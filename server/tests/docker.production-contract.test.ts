import assert from 'node:assert/strict';

if (process.env.BRISABASE_PRODUCTION_CONTRACT !== 'true') {
  console.log('Production contract skipped. Set BRISABASE_PRODUCTION_CONTRACT=true against the homologation compose stack.');
  process.exit(0);
}

const base = (process.env.BRISABASE_API_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN || 'ci_bootstrap_2026_homologation_E6u5N8r3T9y2W4m7Q1p0';
const rootEmail = 'root.contract@homologation.invalid';
const tenantAEmail = 'admin.a@homologation.invalid';
const tenantBEmail = 'admin.b@homologation.invalid';
const password = 'ProductionContractPassword-2026!';
const run = Date.now().toString(36);

async function response(path: string, init: RequestInit = {}): Promise<Response> { return fetch(`${base}${path}`, init); }
async function payload(res: Response): Promise<any> { const raw = await res.text(); try { return raw ? JSON.parse(raw) : null; } catch { return raw; } }
async function expect(path: string, status: number, init: RequestInit = {}): Promise<any> {
  const res = await response(path, init); const value = await payload(res);
  assert.equal(res.status, status, `${init.method || 'GET'} ${path}: ${JSON.stringify(value)}`);
  return value;
}
async function json(path: string, status: number, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<any> {
  return expect(path, status, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function signup(email: string, name: string, bootstrap = false): Promise<void> {
  await json('/api/admin/auth/signup', 201, 'POST', { email, password, name }, bootstrap ? { 'x-admin-bootstrap-token': bootstrapToken } : {});
}
async function login(email: string): Promise<string> {
  const value = await json('/api/admin/auth/login', 200, 'POST', { email, password });
  assert.ok(value.access_token, `Login did not issue a token for ${email}.`);
  return value.access_token;
}
const bearer = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });

async function runContract(): Promise<void> {
  const health = await expect('/health/required', 200);
  assert.equal(health.status, 'healthy');
  for (const service of ['database', 'redis', 'storage', 'mail', 'realtime']) assert.equal(health.details?.[service]?.status, 'healthy', `${service} is not production-ready`);

  await signup(rootEmail, 'Contract Root', true);
  await signup(tenantAEmail, 'Tenant A Admin');
  await signup(tenantBEmail, 'Tenant B Admin');
  const rootToken = await login(rootEmail);
  const rootHeaders = bearer(rootToken);

  const organizations = await json('/api/organizations', 200, 'GET', undefined, rootHeaders);
  assert.equal(organizations.length, 1, 'Bootstrap must create exactly one initial organization in an empty stack.');
  const organizationA = organizations[0];
  const organizationB = await json('/api/organizations', 201, 'POST', { name: `Tenant B ${run}`, slug: `tenant-b-${run}` }, rootHeaders);

  const projectA = await json('/api/projects', 201, 'POST', { organization_id: organizationA.id, name: `Contract A ${run}`, slug: `contract-a-${run}` }, rootHeaders);
  const projectB = await json('/api/projects', 201, 'POST', { organization_id: organizationB.id, name: `Contract B ${run}`, slug: `contract-b-${run}` }, rootHeaders);
  const environmentsA = await json(`/api/projects/${projectA.id}/environments`, 200, 'GET', undefined, bearer(rootToken, { 'x-project-id': projectA.id }));
  const environmentsB = await json(`/api/projects/${projectB.id}/environments`, 200, 'GET', undefined, bearer(rootToken, { 'x-project-id': projectB.id }));
  const environmentA = environmentsA.find((item: any) => item.type === 'production');
  const environmentB = environmentsB.find((item: any) => item.type === 'production');
  assert.ok(environmentA && environmentB, 'Each project must have a production environment.');

  await json(`/api/organizations/${organizationA.id}/members`, 201, 'POST', { email: tenantAEmail, role: 'admin' }, bearer(rootToken, { 'x-organization-id': organizationA.id }));
  await json(`/api/organizations/${organizationB.id}/members`, 201, 'POST', { email: tenantBEmail, role: 'admin' }, bearer(rootToken, { 'x-organization-id': organizationB.id }));
  const tokenA = await login(tenantAEmail);
  const tokenB = await login(tenantBEmail);
  const scopeA = bearer(tokenA, { 'x-organization-id': organizationA.id, 'x-project-id': projectA.id, 'x-environment-id': environmentA.id });
  const scopeB = bearer(tokenB, { 'x-organization-id': organizationB.id, 'x-project-id': projectB.id, 'x-environment-id': environmentB.id });

  await json(`/api/projects/${projectA.id}`, 200, 'GET', undefined, scopeA);
  await json(`/api/projects/${projectB.id}`, 200, 'GET', undefined, scopeB);
  await json(`/api/projects/${projectB.id}`, 403, 'GET', undefined, scopeA);
  await json(`/api/projects/${projectA.id}`, 403, 'GET', undefined, scopeB);
  await json(`/api/organizations/${organizationB.id}`, 403, 'GET', undefined, scopeA);
  await json(`/api/organizations/${organizationA.id}`, 403, 'GET', undefined, scopeB);
  await json(`/api/projects?organization_id=${organizationB.id}`, 403, 'GET', undefined, bearer(tokenA));
  await json(`/api/projects?organization_id=${organizationA.id}`, 403, 'GET', undefined, bearer(tokenB));

  const providersA = await json(`/api/projects/${projectA.id}/environments/${environmentA.id}/auth/providers`, 200, 'GET', undefined, scopeA);
  const googleA = providersA.find((provider: any) => provider.id === 'google');
  assert.ok(googleA, 'Scoped OAuth provider configurations must be available.');
  assert.equal(googleA.client_secret_encrypted, undefined, 'OAuth client secrets must never be returned to the console.');
  await json(`/api/projects/${projectA.id}/environments/${environmentA.id}/auth/providers/google`, 400, 'PATCH', { enabled: true }, scopeA);
  const configuredGoogleA = await json(`/api/projects/${projectA.id}/environments/${environmentA.id}/auth/providers/google`, 200, 'PATCH', { clientId: `google-${run}`, clientSecret: `secret-${run}` }, scopeA);
  assert.equal(configuredGoogleA.client_secret_configured, true, 'The console may only learn that a secret is configured.');
  assert.equal(configuredGoogleA.client_secret_encrypted, undefined, 'The encrypted OAuth secret must not be returned to the console.');
  await json(`/api/projects/${projectA.id}/environments/${environmentA.id}/auth/providers/google`, 200, 'PATCH', { enabled: true }, scopeA);
  await json(`/api/projects/${projectA.id}/environments/${environmentA.id}/auth/providers`, 403, 'GET', undefined, scopeB);

  const table = `tenant_contract_${run}`;
  const columns = [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'tenant', type: 'text', isNullable: false }];
  await json('/api/database/tables', 201, 'POST', { name: table, columns }, scopeA);
  await json('/api/database/tables', 201, 'POST', { name: table, columns }, scopeB);
  await json('/api/security/policies', 201, 'POST', { name: 'Contract A table policy', resourceType: 'table', resource: table, operation: '*', condition: 'true' }, scopeA);
  await json('/api/security/policies', 201, 'POST', { name: 'Contract B table policy', resourceType: 'table', resource: table, operation: '*', condition: 'true' }, scopeB);
  await json(`/api/database/tables/${table}/rows`, 201, 'POST', { id: 'proof', tenant: 'A' }, scopeA);
  await json(`/api/database/tables/${table}/rows`, 201, 'POST', { id: 'proof', tenant: 'B' }, scopeB);
  const rowsA = await json(`/api/database/tables/${table}/rows`, 200, 'GET', undefined, scopeA);
  const rowsB = await json(`/api/database/tables/${table}/rows`, 200, 'GET', undefined, scopeB);
  assert.deepEqual(rowsA.rows.map((row: any) => row.tenant), ['A']);
  assert.deepEqual(rowsB.rows.map((row: any) => row.tenant), ['B']);

  // Production SQL Editor is enabled for control-plane admins but remains scoped
  // to the physical schema of the selected project/environment.
  const sqlRowsA = await json('/api/database/sql/execute', 200, 'POST', { query: `SELECT id, tenant FROM ${table};` }, scopeA);
  const sqlRowsB = await json('/api/database/sql/execute', 200, 'POST', { query: `SELECT id, tenant FROM ${table};` }, scopeB);
  assert.deepEqual(sqlRowsA.rows.map((row: any) => row.tenant), ['A']);
  assert.deepEqual(sqlRowsB.rows.map((row: any) => row.tenant), ['B']);
  assert.deepEqual(sqlRowsA.columns, ['id', 'tenant']);

  const sqlOnlyTable = `sql_contract_${run}`;
  await json('/api/database/sql/execute', 200, 'POST', { query: `CREATE TABLE ${sqlOnlyTable} (id text PRIMARY KEY, tenant text NOT NULL);` }, scopeA);
  await json('/api/database/sql/execute', 200, 'POST', { query: `CREATE TABLE ${sqlOnlyTable} (id text PRIMARY KEY, tenant text NOT NULL);` }, scopeB);
  await json('/api/database/sql/execute', 200, 'POST', { query: `INSERT INTO ${sqlOnlyTable} (id, tenant) VALUES ('sql-proof', 'A') RETURNING tenant;` }, scopeA);
  await json('/api/database/sql/execute', 200, 'POST', { query: `INSERT INTO ${sqlOnlyTable} (id, tenant) VALUES ('sql-proof', 'B') RETURNING tenant;` }, scopeB);
  const isolatedSqlA = await json('/api/database/sql/execute', 200, 'POST', { query: `SELECT tenant FROM ${sqlOnlyTable};` }, scopeA);
  const isolatedSqlB = await json('/api/database/sql/execute', 200, 'POST', { query: `SELECT tenant FROM ${sqlOnlyTable};` }, scopeB);
  assert.deepEqual(isolatedSqlA.rows.map((row: any) => row.tenant), ['A']);
  assert.deepEqual(isolatedSqlB.rows.map((row: any) => row.tenant), ['B']);
  await json('/api/database/sql/execute', 400, 'POST', { query: 'SELECT * FROM pg_roles;' }, scopeA);
  await json('/api/database/sql/execute', 400, 'POST', { query: `SELECT * FROM public.${table};` }, scopeA);

  const keyA = await json(`/api/projects/${projectA.id}/api-keys`, 201, 'POST', { name: 'Contract A service', type: 'service', environment_id: environmentA.id }, scopeA);
  const keyB = await json(`/api/projects/${projectB.id}/api-keys`, 201, 'POST', { name: 'Contract B service', type: 'service', environment_id: environmentB.id }, scopeB);
  await json('/api/projects', 403, 'GET', undefined, { apikey: keyA.fullSecretKey, 'x-project-id': projectA.id, 'x-environment-id': environmentA.id });
  await json('/api/projects', 403, 'GET', undefined, { apikey: keyB.fullSecretKey, 'x-project-id': projectB.id, 'x-environment-id': environmentB.id });
  await json(`/rest/v1/${table}?select=id`, 401, 'GET', undefined, { apikey: keyA.fullSecretKey, 'x-project-id': projectB.id, 'x-environment-id': environmentB.id });
  await json(`/rest/v1/${table}?select=id`, 401, 'GET', undefined, { apikey: keyB.fullSecretKey, 'x-project-id': projectA.id, 'x-environment-id': environmentA.id });

  const backups = await json('/api/backups', 200, 'GET', undefined, scopeA);
  assert.ok(Array.isArray(backups), 'Production encrypted backup listing must be available when BACKUP_ENABLED=true.');
  const functions = await json('/api/functions', 200, 'GET', undefined, scopeA);
  assert.ok(Array.isArray(functions), 'Production Functions management must be available when FUNCTIONS_ENABLED=true with an isolated executor.');
  const infrastructure = await json('/api/infrastructure/overview', 200, 'GET', undefined, scopeA);
  assert.equal(infrastructure.mode, 'production-runtime', 'Production infrastructure overview must expose the real production runtime.');
  assert.equal(infrastructure.health?.status, 'healthy', 'Production infrastructure overview must report healthy runtime dependencies.');
  await json('/api/ecosystem/overview', 503, 'GET', undefined, scopeA);

  for (const internalPath of ['/server.cjs', '/server.cjs.map', '/server/server.cjs', '/dist/server/server.cjs', '/server/db/admin-create.cjs', '/package.json', '/server.ts', '/.env']) await expect(internalPath, 404);
  console.log('Production contract passed: strict dependencies, bidirectional tenant isolation, scoped SQL Editor, schema isolation, feature gates and private server artifacts.');
}

runContract().catch((error) => { console.error('Production contract failed:', error); process.exit(1); });