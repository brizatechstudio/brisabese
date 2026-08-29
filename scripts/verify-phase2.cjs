/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { isSemVerAtLeast } = require('./semver.cjs');
const root = path.resolve(__dirname, '..');
const failures = [];
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const required = [
  'server/db/migrations/017_database_phase2.sql','server/db/databasePhase2.ts','src/brisabase/components/database/DatabaseObjectsView.tsx',
  'src/brisabase/components/database/DatabasePoliciesView.tsx','src/brisabase/components/database/SqlEditorView.tsx','src/brisabase/components/database/TableSpreadsheet.tsx',
  'PHASE2_COMPLETION.md'
];
for (const file of required) if (!fs.existsSync(path.join(root,file))) failures.push(`missing Phase 2 file: ${file}`);
const pkg = JSON.parse(read('package.json'));
const sdk = JSON.parse(read('developer/sdk/package.json'));
if (!isSemVerAtLeast(pkg.version, '0.4.0')) failures.push('platform version must be valid SemVer and Phase 2 (0.4.0) or newer');
if (sdk.version !== pkg.version) failures.push('SDK version must match platform');
if (!read('developer/cli/brisabase.mjs').includes(`const VERSION = '${pkg.version}'`)) failures.push('CLI version must match platform');
const scoped = read('server/db/scopedSql.ts');
if (!/dedicated EXPLAIN/.test(scoped) || !/\^EXPLAIN\\b/.test(scoped)) failures.push('generic SQL executor must reject manual EXPLAIN');
const rpd = read('server/db/realProjectDatabase.ts');
for (const token of ['activeQueries','pg_cancel_backend','scopeKey(scope)','Row-by-id operations require a single-column primary key','rollbackMigration']) if (!rpd.includes(token)) failures.push(`real database is missing ${token}`);
const phase = read('server/db/databasePhase2.ts');
for (const token of ['addColumn','alterColumn','isUnique','defaultValue','listMaterializedViews','listEnums','listSequences','listExtensions','importRows','exportRows','snapshot','relationships.added',"compareNamed('indexes'","compareNamed('materializedViews'"]) if (!phase.includes(token)) failures.push(`Phase 2 engine is missing ${token}`);
const route = read('server/routes/realDatabase.ts');
for (const endpoint of ['/api/database/sql/metrics','/api/database/sql/explain','/api/database/sql/cancel/:queryId','/api/database/schema/snapshot','/api/database/schema/diff']) if (!route.includes(endpoint)) failures.push(`Database route is missing ${endpoint}`);
const repo = read('server/db/controlRepository.ts');
if (!/project_id=\$1 AND environment_id=\$2 AND user_id=\$3/.test(repo)) failures.push('saved SQL queries must remain scoped by project/environment/user');
if (!/percentile_cont\(0\.95\)/.test(repo)) failures.push('SQL p95 metrics are missing');
const table = read('src/brisabase/components/database/TableSpreadsheet.tsx');
for (const token of ['primaryKeys.length === 1','Unique','defaultValue','Importar dados','exportRows','filters']) if (!table.includes(token)) failures.push(`Table Editor is missing ${token}`);
const sqlUi = read('src/brisabase/components/database/SqlEditorView.tsx');
for (const token of ['getSqlMetrics','p95ExecutionTimeMs','cancelQuery','explainQuery','listSavedQueries']) if (!sqlUi.includes(token)) failures.push(`SQL Editor UI is missing ${token}`);
const policy = read('src/brisabase/components/database/DatabasePoliciesView.tsx');
if (!policy.includes('/api/security/simulate') || !policy.includes('/api/security/policies')) failures.push('Database Policies UI is incomplete');
if (failures.length) { console.error('[BRISABASE PHASE 2 VERIFY] FAILED'); failures.forEach((x)=>console.error(`- ${x}`)); process.exit(1); }
console.log('[BRISABASE PHASE 2 VERIFY] PASS');
