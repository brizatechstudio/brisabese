const fs = require('fs');
const path = require('path');
const { isSemVerAtLeast } = require('./semver.cjs');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => { if (!fs.existsSync(path.join(root, p))) throw new Error(`Missing ${p}`); };
const must = (p, needles) => { const source = read(p); for (const needle of needles) if (!source.includes(needle)) throw new Error(`${p} missing: ${needle}`); };

exists('server/db/migrations/021_backup_hosting_infrastructure_phase6.sql');
const pkg = JSON.parse(read('package.json'));
const sdk = JSON.parse(read('developer/sdk/package.json'));
if (!isSemVerAtLeast(pkg.version, '0.8.0')) throw new Error(`Phase 6 platform version must be valid SemVer and 0.8.0 or newer, got ${pkg.version}`);
if (sdk.version !== pkg.version) throw new Error('SDK version must match platform.');
if (!read('developer/cli/brisabase.mjs').includes(`const VERSION = '${pkg.version}'`)) throw new Error('CLI version must match platform.');

must('server/db/migrations/021_backup_hosting_infrastructure_phase6.sql', ['hosting_domains', 'backup_recovery_drills', 'runtime_instances', 'operations_incidents', 'hosting_domains_hostname_idx']);
must('server/backup/recoveryCertification.ts', ["WHERE status='passed'", 'config.backup.certified && row', 'assertRecoveryCertified']);
must('server/routes/backup.ts', ['restoreCertificationConfigured', 'latestPassedRecoveryDrill', 'await requireRestoreCertification']);
must('server/routes/platformPitr.ts', ['assertRecoveryCertified', 'RESTORE_ENTIRE_BRISABASE_DATABASE', '/internal/recovery/drills']);

const validator = read('scripts/validate-production-env.cjs');
for (const token of ['BACKUP_ENCRYPTION_KEY', 'BACKUP_STORAGE_BUCKET', 'PITR_PROVIDER must be neon', 'HOSTING_CADDY_ASK_TOKEN', 'BRISABASE_OPERATIONS_TOKEN', 'BRISABASE_PRODUCTION_TIER=ha requires']) if (!validator.includes(token)) throw new Error(`Production validator missing Phase 6 rule: ${token}`);
if (validator.includes('BACKUP_ENABLED must remain false until')) throw new Error('Production validator still blocks backup creation with the obsolete Phase 5 rule.');
must('scripts/generate-production-secrets.cjs', ['BACKUP_ENCRYPTION_KEY: secret()', 'HOSTING_CADDY_ASK_TOKEN: secret()', 'BRISABASE_PITR_OPERATOR_TOKEN: secret()', 'BRISABASE_OPERATIONS_TOKEN: secret()']);

must('server/platform/hostingEngine.ts', ['resolveTxt(`_brisabase.${row.hostname}`)', "status='verified',tls_status='pending'", 'domainAuthorized', 'startDeployment', 'uploadDeploymentFile', 'finalizeDeployment', 'resolvePreview', 'resolveCustomDomain', 'redirectTarget', 'defaultCacheControl', 'PUBLIC_|VITE_', "supplied !== 'application/octet-stream'"]);
must('server/routes/hosting.ts', ['/internal/hosting/domain-authorized', 'hostingCustomDomainRouter', 'hostingPublicRouter', 'raw({type:', 'Content-Security-Policy']);
must('deploy/Caddyfile', ['on_demand_tls', 'domain-authorized', 'https:// {', 'on_demand']);
const server = read('server.ts');
if (server.indexOf('app.use(hostingCustomDomainRouter)') > server.indexOf('app.use(corsAndSecurityMiddleware)')) throw new Error('Custom hosting domain serving must run before control-plane CORS.');

must('server/infrastructure/productionInfrastructureEngine.ts', ["interval '45 seconds'", "interval '5 minutes'", "project_id IS NULL AND environment_id IS NULL", 'embeddedMultiAzProvisioning: false', 'createPlatformIncident', 'updatePlatformIncident']);
must('server/routes/productionInfrastructure.ts', ['/api/infrastructure/overview', '/api/infrastructure/incidents', '/internal/infrastructure/incidents', 'OPERATIONS_OPERATOR_UNAUTHORIZED', "get('/status'"]);
if (read('src/brisabase/pages/InfrastructurePage.tsx').includes('Multi-AZ ativo')) throw new Error('Infrastructure UI must not claim embedded Multi-AZ.');
must('src/brisabase/pages/InfrastructurePage.tsx', ['replicasObserved', 'Incidents', 'Capacidades reais', 'não simula Multi-AZ']);
must('src/App.tsx', ['path="/infrastructure"', '<InfrastructurePage />']);

must('src/brisabase/pages/HostingPage.tsx', ['Domínios customizados', 'Configuração do site', 'PUBLIC_', 'preview imutável', 'hostingService.updateConfig']);
must('src/brisabase/pages/BackupsPage.tsx', ['recovery', 'schedules', 'createSchedule', 'updateSchedule', 'deleteSchedule']);
must('developer/cli/brisabase.mjs', ['hosting deploy', 'hosting domain-add', 'hosting domain-verify', '/deployments/start', '/finalize']);

const prodEnv = read('.env.production.example');
for (const token of ['BRISABASE_PRODUCTION_TIER=single-host', 'BACKUP_ENABLED=true', 'BACKUP_RESTORE_CERTIFIED=false', 'HOSTING_CUSTOM_DOMAINS_ENABLED=true', 'BRISABASE_OPERATIONS_TOKEN=', 'INFRASTRUCTURE_PREVIEW_ENABLED=false']) if (!prodEnv.includes(token)) throw new Error(`Production env missing: ${token}`);
const prodRelease = /^BRISABASE_RELEASE=(\d+)\.(\d+)\.(\d+)$/m.exec(prodEnv); if (!prodRelease || Number(prodRelease[1]) < 0 || (Number(prodRelease[1]) === 0 && Number(prodRelease[2]) < 8)) throw new Error('Production env must declare BRISABASE_RELEASE 0.8.0 or newer');
const compose = read('docker-compose.production.yml');
for (const token of ['BACKUP_ENABLED: "true"', 'BACKUP_STORAGE_BUCKET:', 'BRISABASE_OPERATIONS_TOKEN:', 'HOSTING_CADDY_ASK_TOKEN:', 'BRISABASE_PRODUCTION_TIER:', 'reverse-proxy:']) if (!compose.includes(token)) throw new Error(`Production Compose missing: ${token}`);
must('deploy/minio-init.sh', ['BACKUP_STORAGE_BUCKET', 'mc mb --ignore-existing "brisabase-minio/$BACKUP_STORAGE_BUCKET"']);

console.log('Phase 6 verification: PASS');
