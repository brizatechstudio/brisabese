import assert from 'node:assert/strict';
import express from 'express';
import { pathToFileURL } from 'node:url';

function expect(value: unknown, message: string): asserts value { assert.ok(value, `TEST FAILED (RC Audit): ${message}`); }
async function listen(app: express.Express): Promise<{ server: import('node:http').Server; base: string }> { const server = await new Promise<import('node:http').Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); }); const address = server.address() as import('node:net').AddressInfo; return { server, base: `http://127.0.0.1:${address.port}` }; }
async function close(server: import('node:http').Server): Promise<void> { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

export async function runRcAuditTests() {
  console.log('Starting RC-1 hardening audit tests...\n');
  const previousNodeEnv = process.env.NODE_ENV; const previousOrigins = process.env.CORS_ALLOWED_ORIGINS; const previousDataSource = process.env.VITE_DATA_SOURCE;
  process.env.NODE_ENV = 'production'; delete process.env.VITE_DATA_SOURCE; process.env.CORS_ALLOWED_ORIGINS = 'https://console.brisabase.test';
  try {
    // Load configuration-dependent modules only after the production environment
    // has been established. This mirrors a real server process, where env vars
    // exist before the application module graph is evaluated.
    const [jwtModule, authModule, corsModule, errorModule, authDbModule, authRoutesModule] = await Promise.all([
      import('../auth/jwt'),
      import('../middleware/auth'),
      import('../middleware/cors'),
      import('../middleware/error'),
      import('../db/authDatabase'),
      import('../routes/authEngine'),
    ]);
    const { signJwt } = jwtModule;
    const { authMiddleware } = authModule;
    const { corsAndSecurityMiddleware } = corsModule;
    const { errorHandler } = errorModule;
    const { authDatabase } = authDbModule;
    const { authEngineRouter } = authRoutesModule;

    const app = express(); app.use(corsAndSecurityMiddleware); app.use(authMiddleware); app.use(authEngineRouter); app.get('/protected', (req: any, res) => res.json({ user: req.user?.id, organizationId: req.organizationId })); app.get('/api/auth/login', (_req, res) => res.json({ public: true })); app.get('/boom', () => { throw new Error('internal database connection string'); }); app.use(errorHandler);
    const { server, base } = await listen(app);
    try {
      const denied = await fetch(`${base}/protected`, { headers: { Origin: 'https://console.brisabase.test' } });
      expect(denied.status === 401, 'Production control-plane requests without credentials must be rejected');
      const deniedOrigin = await fetch(`${base}/protected`, { headers: { Origin: 'https://attacker.test' } });
      expect(deniedOrigin.status === 403, 'Production CORS must reject origins outside the allowlist');
      const user = authDatabase.createUser({ project_id: 'proj_ecommerce_1', environment_id: 'env_proj_ecommerce_1_production', email: `rc-${Date.now()}@brisabase.test`, email_verified: true, display_name: 'RC Audit', role: 'admin', status: 'active', provider: 'email', user_metadata: {}, app_metadata: {} });
      const session = authDatabase.createSession({ user_id: user.id, project_id: user.project_id, environment_id: user.environment_id, expires_at: new Date(Date.now() + 60_000).toISOString() });
      const token = signJwt({ sub: user.id, project_id: user.project_id, environment_id: user.environment_id, session_id: session.id, role: 'admin', email: user.email });
      const allowed = await fetch(`${base}/protected`, { headers: { Origin: 'https://console.brisabase.test', Authorization: `Bearer ${token}` } });
      expect(allowed.ok && (await allowed.json()).organizationId === 'org_core_1' && allowed.headers.get('x-frame-options') === 'DENY', 'Scoped JWT requests must retain organization context and security headers');
      const scopeMismatch = await fetch(`${base}/protected`, { headers: { Origin: 'https://console.brisabase.test', Authorization: `Bearer ${token}`, 'x-project-id': 'proj_mobile_saas' } });
      expect(scopeMismatch.status === 401, 'JWT credentials must not be reused against a different project scope');
      const managementScopeMismatch = await fetch(`${base}/api/projects/proj_mobile_saas/environments/env_proj_mobile_saas_production/auth/users`, { headers: { Origin: 'https://console.brisabase.test', Authorization: `Bearer ${token}` } });
      expect(managementScopeMismatch.status === 403, 'Management URLs must not escape the token project and environment scope');
      const publicAuth = await fetch(`${base}/api/auth/login`, { headers: { Origin: 'https://console.brisabase.test' } });
      expect(publicAuth.ok && (await publicAuth.json()).public, 'Public authentication routes must remain reachable');
      const boom = await fetch(`${base}/boom`, { headers: { Origin: 'https://console.brisabase.test', Authorization: `Bearer ${token}` } }); const body = await boom.json();
      expect(boom.status === 500 && body.error.message === 'Internal server error.' && !JSON.stringify(body).includes('connection string'), 'Production errors must not leak internal details');
    } finally { await close(server); }
    console.log('Test 1: production authentication, CORS allowlist, headers, and error sanitization.');
  } finally { if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv; if (previousOrigins === undefined) delete process.env.CORS_ALLOWED_ORIGINS; else process.env.CORS_ALLOWED_ORIGINS = previousOrigins; if (previousDataSource === undefined) delete process.env.VITE_DATA_SOURCE; else process.env.VITE_DATA_SOURCE = previousDataSource; }
  console.log('All RC-1 hardening audit tests passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runRcAuditTests().catch((error) => { console.error(error); process.exitCode = 1; });
