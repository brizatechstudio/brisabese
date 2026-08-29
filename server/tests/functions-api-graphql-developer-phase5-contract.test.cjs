const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (v, m) => { if (!v) throw new Error(m); };

const migration = read('server/db/migrations/020_functions_developer_platform_phase5.sql');
assert(migration.includes('UNIQUE (organization_id, project_id, environment_id, sha256_hash)'), 'persisted query uniqueness scope missing');
assert(migration.includes("kind IN ('openapi','typescript')"), 'developer artifact kind constraint missing');

const graphql = read('server/routes/graphql.ts');
assert(graphql.includes("createHash('sha256')") || graphql.includes("createHash(\"sha256\")"), 'persisted query SHA-256 validation missing');
assert(graphql.includes('MAX_GRAPHQL_COMPLEXITY = 500'), 'GraphQL complexity ceiling missing');
assert(graphql.includes('graphql_persisted_queries'), 'GraphQL persisted-query storage missing');

const dev = read('server/routes/developer.ts');
assert(dev.includes('realProjectDatabase.listTables'), 'Developer artifacts must derive from the real PostgreSQL schema');
assert(dev.includes("openapi: '3.0.3'"), 'OpenAPI generation missing');
assert(dev.includes('developer_artifacts'), 'Developer artifact audit persistence missing');

const functions = read('server/functions/persistentFunctionEngine.ts');
assert(functions.includes("status='dead_letter'"), 'dead-letter queue state missing');
assert(functions.includes('retryJob'), 'dead-letter retry missing');
assert(functions.includes('setCronEnabled') && functions.includes('deleteCron'), 'cron lifecycle controls missing');
const runtime = read('server/functions/functionRuntime.ts');
assert(runtime.includes('healthCheck()'), 'production executor health check missing');
assert(runtime.includes("hostname === 'functions-executor'"), 'self-hosted executor host allowlist missing');

const compose = read('docker-compose.production.yml');
assert((compose.match(/^  functions-executor:$/gm) || []).length === 1, 'duplicate functions-executor service');
assert((compose.match(/^  brisabase:$/gm) || []).length === 1, 'duplicate brisabase service');
const executor = compose.slice(compose.indexOf('  functions-executor:'), compose.indexOf('\n  brisabase:', compose.indexOf('  functions-executor:')));
for (const secret of ['DATABASE_URL', 'REDIS_URL', 'S3_SECRET_KEY', 'JWT_SECRET']) assert(!executor.includes(secret), `executor leaks ${secret}`);
assert(!executor.includes('\n    ports:'), 'executor must remain private');
assert(executor.includes('networks: [functions-plane]') && !executor.includes('networks: [backend'), 'executor must use only the isolated functions-plane network');
assert(compose.includes('functions-plane:') && compose.includes('internal: true'), 'functions-plane network must be internal');

const cli = read('developer/cli/brisabase.mjs');
assert(cli.includes('/api/database/schema/snapshot'), 'CLI db pull not wired to real snapshot');
assert(cli.includes('/api/database/schema/diff'), 'CLI db diff not wired to real diff');
assert(cli.includes('/api/developer/typescript') && cli.includes('/api/developer/openapi'), 'CLI artifact pulls missing');
assert(!cli.includes("status: 'prepared'"), 'CLI placeholder remains');

const sdk = read('developer/sdk/client.ts');
assert(sdk.includes('persistedQuery:'), 'SDK persisted-query support missing');


const rest = read('server/routes/realRestApi.ts');
assert(rest.includes('requestedIncludes') && rest.includes('expandRelationships'), 'REST relationship expansion missing');
assert(rest.includes('securityEngine.filterRows'), 'related REST rows must be RLS-filtered');
assert(rest.includes('Relationship expansion supports at most 200 root rows'), 'REST relationship root-row ceiling missing');
assert(graphql.includes('Number(extension.version) !== 1'), 'persisted-query protocol version validation missing');
assert(graphql.includes('PERSISTED_QUERY_LIMIT') && graphql.includes('maximum of 1000 persisted queries'), 'persisted-query per-environment ceiling missing');
assert(graphql.includes('args.limit === undefined ? 50'), 'GraphQL complexity must account for requested list limit');
const developerPage = read('src/brisabase/pages/DeveloperPlatformPage.tsx');
assert(developerPage.includes('/api/developer/openapi') && developerPage.includes('/api/developer/typescript'), 'Developer Tools page must use real artifact endpoints');
assert(!developerPage.includes('/api/ecosystem'), 'Developer Tools page must not depend on preview ecosystem endpoints');
const functionRoutes = read('server/routes/functions.ts');
assert(functionRoutes.includes("delete('/api/functions/environment/:name'"), 'Function environment variable deletion route missing');
const functionService = read('src/brisabase/services/functionsService.ts');
assert(functionService.includes('desiredNames') && functionService.includes("method: 'DELETE'"), 'Function environment UI must remove deleted keys');
const sharedTypes = read('src/types/index.ts');
assert(sharedTypes.includes("export type TeamRole = UserRole | 'Billing'"), 'legacy team role compatibility must not widen Auth UserRole');

console.log('Functions + APIs + GraphQL + Developer Tools Phase 5 contract: PASS');
