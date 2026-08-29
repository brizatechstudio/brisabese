import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const databaseRouter = readFileSync(path.join(root, 'server/routes/realDatabase.ts'), 'utf8');
const restRouter = readFileSync(path.join(root, 'server/routes/realRestApi.ts'), 'utf8');
const authMiddleware = readFileSync(path.join(root, 'server/middleware/auth.ts'), 'utf8');
const server = readFileSync(path.join(root, 'server.ts'), 'utf8');

console.log('=== BRISABASE ADMIN DATABASE RLS CONTRACT TEST ===');

// The Database Editor is a control-plane management surface. Only an actual
// admin-session credential with an authorized organization role may inspect
// tenant rows without applying end-user RLS.
assert.match(
  databaseRouter,
  /req\.authKind === 'admin' && \['owner', 'admin', 'developer'\]\.includes\(req\.user\?\.role \|\| ''\)/,
  'Managed-row reads must be restricted to admin sessions with owner/admin/developer roles.',
);
assert.match(
  databaseRouter,
  /req\.authKind === 'admin' && \['owner', 'admin'\]\.includes\(req\.user\?\.role \|\| ''\)/,
  'Managed-row writes must be restricted to admin sessions with owner/admin roles.',
);
assert.doesNotMatch(
  databaseRouter,
  /\['owner', 'admin', 'developer', 'viewer'\]|\['owner', 'admin', 'developer', 'billing'\]/,
  'Viewer/billing roles must never be added to the raw-row management bypass.',
);

// Every non-read Database operation (SQL Editor, DDL, migrations, functions,
// triggers, relationships and row writes) must require the `admin` permission.
assert.match(
  authMiddleware,
  /if \(\/\^\\\/api\\\/database\(\?:\\\/\|\$\)\/\.test\(req\.path\)[^\n]+return 'admin';/,
  'Non-GET /api/database operations must stay behind the admin permission.',
);
assert.deepEqual(
  ['owner', 'admin'].filter((role) => authMiddleware.includes(`${role}: ['read', 'write', 'admin', 'billing']`)),
  ['owner', 'admin'],
  'Owner and admin must retain the admin permission used by Database writes.',
);
assert.doesNotMatch(authMiddleware, /developer: \[[^\]]*'admin'/, 'Developer must not gain the admin permission used by SQL/DDL writes.');
assert.doesNotMatch(authMiddleware, /viewer: \[[^\]]*'admin'/, 'Viewer must not gain the admin permission used by SQL/DDL writes.');
assert.doesNotMatch(authMiddleware, /billing: \[[^\]]*'admin'/, 'Billing must not gain the admin permission used by SQL/DDL writes.');

// The row-list route must return the scoped database result directly only for
// the explicitly authorized Database Editor roles. All other callers still
// pass through the RLS engine. Allow ordinary whitespace/newlines between the
// two statements so this security contract does not depend on source formatting.
assert.match(
  databaseRouter,
  /if \(canReadManagedRows\(req\)\) \{ res\.json\(result\); return; \}\s*const rows = securityEngine\.filterRows/,
  'Database Editor reads must bypass end-user RLS only through canReadManagedRows.',
);

for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
  assert.match(
    databaseRouter,
    new RegExp(`!canWriteManagedRows\\(req\\) && !securityEngine\\.evaluate\\([^\\n]+ '${operation}'`),
    `${operation} must still evaluate RLS whenever the caller is not an authorized admin writer.`,
  );
}

// The public data plane must remain RLS protected. This is the contract that
// prevents the Database Editor exception from weakening application traffic.
assert.match(restRouter, /securityEngine\.filterRows\(ApiGateway\.toSecurityContext\(ctx, req\), apiResource\.table, rows\)/);
assert.match(restRouter, /securityEngine\.evaluate\(ApiGateway\.toSecurityContext\(ctx, req\), 'table', apiResource\.table, 'INSERT'/);
assert.match(restRouter, /securityEngine\.evaluate\(ApiGateway\.toSecurityContext\(ctx, req\), 'table', apiResource\.table, 'UPDATE'/);
assert.match(restRouter, /securityEngine\.evaluate\(ApiGateway\.toSecurityContext\(ctx, req\), 'table', apiResource\.table, 'DELETE'/);

// Database control-plane routes must stay behind both authentication and tenant
// authorization. Data-plane credentials must not be able to reach them.
const authIndex = server.indexOf('app.use(authMiddleware);');
const controlPlaneIndex = server.indexOf('app.use(controlPlaneAuthorizationMiddleware);');
const databaseIndex = server.indexOf('app.use(config.testMode ? databaseRouter : realDatabaseRouter);');
assert.ok(authIndex >= 0 && controlPlaneIndex > authIndex && databaseIndex > controlPlaneIndex, 'Database management routes must remain behind authMiddleware and controlPlaneAuthorizationMiddleware.');
assert.match(authMiddleware, /if \(req\.authKind !== 'admin' \|\| !req\.user\)/, 'Control-plane authorization must require an admin credential.');
assert.match(
  authMiddleware,
  /if \(!roleAllows\(role, permission\) && !await enterpriseEngine\.customRoleAllows\(organizationId, role, permission\)\)/,
  'Control-plane authorization must enforce built-in or explicitly configured enterprise role permissions.',
);

console.log('  ✅ PASS: Database Editor bypass is scoped to authorized admin sessions.');
console.log('  ✅ PASS: Database write tools remain restricted to owner/admin.');
console.log('  ✅ PASS: Public REST data plane remains protected by RLS.');
console.log('  ✅ PASS: Database management remains behind control-plane authorization.');