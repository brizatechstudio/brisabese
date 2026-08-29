const fs = require('fs');
const path = require('path');
const { isSemVerAtLeast } = require('./semver.cjs');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => { if (!fs.existsSync(path.join(root, p))) throw new Error(`Missing ${p}`); };
const must = (p, needles) => { const source = read(p); for (const needle of needles) if (!source.includes(needle)) throw new Error(`${p} missing: ${needle}`); };
const count = (source, needle) => source.split(needle).length - 1;

exists('server/db/migrations/020_functions_developer_platform_phase5.sql');
const pkg = JSON.parse(read('package.json'));
const sdk = JSON.parse(read('developer/sdk/package.json'));
if (!isSemVerAtLeast(pkg.version, '0.7.0')) throw new Error(`Phase 5 platform version must be valid SemVer and 0.7.0 or newer, got ${pkg.version}`);
if (sdk.version !== pkg.version) throw new Error('SDK version must match platform.');
if (!read('developer/cli/brisabase.mjs').includes(`const VERSION = '${pkg.version}'`)) throw new Error('CLI version must match platform.');

must('server/db/migrations/020_functions_developer_platform_phase5.sql', ['graphql_persisted_queries', 'developer_artifacts']);
must('server/routes/developer.ts', ['/api/developer/openapi', '/api/developer/typescript', '/api/developer/artifacts', "persistArtifact(req, 'openapi'", "persistArtifact(req, 'typescript'", "servers: [{ url: '/' }]"]);
must('server.ts', ['developerRouter']);
must('server/middleware/auth.ts', ['database|developer|graphql|realtime|webhooks|backups']);

must('server/routes/graphql.ts', ['MAX_GRAPHQL_COMPLEXITY', 'persistedQuery', 'sha256Hash', 'X-GraphQL-Complexity']);
must('server/routes/graphqlManagement.ts', ['/api/graphql/persisted', "delete('/api/graphql/persisted/:hash'"]);
must('developer/sdk/client.ts', ['persistedQuery:', 'sha256Hash']);

must('server/functions/functionRuntime.ts', ['healthCheck()', "hostname === 'functions-executor'", "hostname === 'brisabase'"]);
must('server/functions/persistentFunctionEngine.ts', ['setCronEnabled', 'deleteCron', 'retryJob', "status='dead_letter'", 'function.job_retried']);
must('server/routes/functions.ts', ['/api/functions/health', '/crons/:cronId', '/jobs/:jobId/retry']);
must('src/brisabase/services/functionsService.ts', ['/api/functions/environment/', "method: 'PUT'"]);

const compose = read('docker-compose.production.yml');
if (count(compose, '\n  functions-executor:\n') !== 1) throw new Error('Production compose must define exactly one functions-executor service.');
if (count(compose, '\n  brisabase:\n') !== 1) throw new Error('Production compose must define exactly one brisabase service.');
for (const token of ['FUNCTIONS_ENABLED: "true"', 'FUNCTIONS_EXECUTOR_URL: http://functions-executor:3100', 'read_only: true', 'cap_drop: ["ALL"]', 'no-new-privileges:true', 'functions-plane:', 'internal: true']) if (!compose.includes(token)) throw new Error(`Production Functions hardening missing: ${token}`);
const executorBlock = compose.slice(compose.indexOf('  functions-executor:'), compose.indexOf('\n  brisabase:', compose.indexOf('  functions-executor:')));
for (const forbidden of ['DATABASE_URL', 'REDIS_URL', 'S3_SECRET_KEY', 'JWT_SECRET', 'AUTH_ENCRYPTION_KEY']) if (executorBlock.includes(forbidden)) throw new Error(`Functions executor must not receive ${forbidden}.`);
if (/\n\s+ports:\s*\n/.test(executorBlock)) throw new Error('Functions executor must not expose public ports.');
if (!executorBlock.includes('networks: [functions-plane]') || executorBlock.includes('networks: [backend')) throw new Error('Functions executor must use only the isolated functions-plane network.');

must('scripts/validate-production-env.cjs', ['FUNCTIONS_IMAGE', 'functions-executor', 'FUNCTIONS_EXECUTOR_TOKEN', 'process.env.BRISABASE_ENV_FILE']);
must('scripts/generate-production-secrets.cjs', ['FUNCTIONS_EXECUTOR_TOKEN: secret()']);

must('.env.homologation.example', ['FUNCTIONS_ENABLED=true', 'FUNCTIONS_EXECUTOR_TOKEN=', 'FUNCTIONS_IMAGE=brisabase-functions:contract@sha256:']);
must('docker-compose.homologation.yml', ['functions-executor:', 'dockerfile: Dockerfile.functions', 'image: brisabase-functions:${BRISABASE_RELEASE:-contract}']);

const cli = read('developer/cli/brisabase.mjs');
for (const token of ['db pull', 'db diff', 'db push', 'types pull', 'openapi pull', "action === 'health'", "action === 'rollback'", "action === 'enqueue'"]) if (!cli.includes(token)) throw new Error(`CLI Phase 5 command missing: ${token}`);
if (/status\s*:\s*['"]prepared['"]/.test(cli)) throw new Error('CLI still contains prepared-only placeholder behavior.');


// Phase 5 final hardening contracts.
must('server/routes/realRestApi.ts', ['requestedIncludes', 'expandRelationships', 'Relationship expansion supports at most 200 root rows', 'securityEngine.filterRows']);
must('server/routes/developer.ts', ["name: 'include'", 'Related rows are RLS-filtered']);
must('server/routes/graphql.ts', ['Number(extension.version) !== 1', 'PERSISTED_QUERY_LIMIT', 'maximum of 1000 persisted queries', 'args.limit === undefined ? 50']);
must('src/brisabase/pages/DeveloperPlatformPage.tsx', ['/api/developer/openapi', '/api/developer/typescript', '@brisabase/js', 'Status" value="Official']);
if (read('src/brisabase/pages/DeveloperPlatformPage.tsx').includes('/api/ecosystem')) throw new Error('Developer Tools page must not depend on ecosystem preview endpoints.');
must('server/routes/functions.ts', ["delete('/api/functions/environment/:name'", 'deleteEnvironment(context(req)']);
must('src/brisabase/services/functionsService.ts', ["method: 'DELETE'", 'desiredNames']);
must('src/types/index.ts', ["export type TeamRole = UserRole | 'Billing'", 'role: TeamRole']);

console.log('Phase 5 verification: PASS');
