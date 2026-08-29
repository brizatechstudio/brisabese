const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const hobby = read('docker-compose.hobby.yml');
const local = read('docker-compose.local.yml');
const enterprise = read('docker-compose.enterprise.yml');
const production = read('docker-compose.production.yml');
const enterpriseEnv = read('.env.enterprise.example');
const hobbyEnv = read('.env.hobby.example');
const gitignore = read('.gitignore');
const deployScript = read('scripts/deployment-profile.cjs');
const profileValidator = read('scripts/validate-deployment-profile.cjs');
const targetScript = read('scripts/target.cjs');
const packageJson = JSON.parse(read('package.json'));
const adminAuth = read('server/routes/adminAuth.ts');
const realAuth = read('server/routes/realAuth.ts');
const securityBaseline = read('docs/SECURITY_BASELINE.md');
const deploymentDocs = read('docs/DEPLOYMENT_PROFILES.md');

assert.match(hobby, /BRISABASE_DEPLOYMENT_PROFILE:\s*hobby/);
assert.match(hobby, /BRISABASE_DEPLOYMENT_MODE:\s*self-hosted/);
assert.match(hobby, /BRISABASE_PRODUCTION_TIER:\s*single-host/);
assert.match(hobbyEnv, /NODE_ENV=development/);
assert.match(hobbyEnv, /BRISABASE_DEPLOYMENT_PROFILE=hobby/);

for (const port of ['BRISABASE_POSTGRES_PORT', 'BRISABASE_REDIS_PORT', 'BRISABASE_MINIO_PORT', 'BRISABASE_MINIO_CONSOLE_PORT', 'BRISABASE_SMTP_PORT', 'BRISABASE_MAILPIT_PORT', 'BRISABASE_PORT']) {
  assert.match(local, new RegExp(`127\\.0\\.0\\.1:\\$\\{${port}`), `local ${port} must bind to loopback`);
}

assert.match(enterprise, /BRISABASE_DEPLOYMENT_PROFILE:\s*enterprise/);
assert.match(enterprise, /BRISABASE_DEPLOYMENT_MODE:\s*managed/);
assert.match(enterprise, /BRISABASE_PRODUCTION_TIER:\s*ha/);
assert.doesNotMatch(enterprise, /^\s{2}(postgres|redis|minio|minio-init|functions-executor):\s*$/m, 'enterprise compose must not bundle stateful or single-node Functions infrastructure');
assert.match(enterprise, /^\s{2}brisabase-migrate:\s*$/m, 'enterprise must run schema migrations in a separate operator container');
assert.match(enterprise, /command:\s*\["node",\s*"server\/db\/migrate\.cjs"\]/);
const migrationService = enterprise.split('\n  brisabase-migrate:\n')[1]?.split('\n  brisabase:\n')[0] || '';
const applicationService = enterprise.split('\n  brisabase:\n')[1]?.split('\n  reverse-proxy:\n')[0] || '';
assert.match(migrationService, /DATABASE_MIGRATION_URL:/, 'migration plane must receive DATABASE_MIGRATION_URL');
assert.match(migrationService, /read_only:\s*true/);
assert.match(migrationService, /cap_drop:\s*\["ALL"\]/);
assert.match(migrationService, /no-new-privileges:true/);
assert.doesNotMatch(applicationService, /DATABASE_MIGRATION_URL:/, 'application runtime must not receive migration credentials');
assert.match(applicationService, /brisabase-migrate:\s*\n\s*condition:\s*service_completed_successfully/, 'application must wait for successful migrations');
assert.match(enterprise, /FUNCTIONS_ENABLED:\s*\$\{FUNCTIONS_ENABLED:-false\}/);
assert.match(enterprise, /FUNCTIONS_EXECUTOR_URL:\s*\$\{FUNCTIONS_EXECUTOR_URL:-\}/);
assert.match(enterprise, /read_only:\s*true/);
assert.match(enterprise, /cap_drop:\s*\["ALL"\]/);
assert.match(enterprise, /no-new-privileges:true/);
assert.match(enterprise, /BRISABASE_BIND_ADDRESS:-127\.0\.0\.1/);

assert.match(enterpriseEnv, /BRISABASE_DEPLOYMENT_MODE=managed/);
assert.match(enterpriseEnv, /BRISABASE_PRODUCTION_TIER=ha/);
assert.match(enterpriseEnv, /DATABASE_SSL=true/);
assert.match(enterpriseEnv, /REDIS_URL=rediss:\/\//);
assert.match(enterpriseEnv, /S3_ENDPOINT=https:\/\//);
assert.match(enterpriseEnv, /FUNCTIONS_ENABLED=false/);
assert.doesNotMatch(enterpriseEnv, /^FUNCTIONS_IMAGE=/m);

assert.match(production, /BRISABASE_DEPLOYMENT_MODE:\s*self-hosted/);
assert.match(production, /BRISABASE_PRODUCTION_TIER:\s*\$\{BRISABASE_PRODUCTION_TIER:-single-host\}/);
assert.match(production, /functions-plane:/);
assert.match(production, /internal:\s*true/);

assert.match(adminAuth, /redisClient\.increment\(`rate:admin:/, 'admin auth rate limiting must use shared Redis');
assert.match(realAuth, /redisClient\.increment\(`rate:auth:/, 'application auth rate limiting must use shared Redis');
assert.doesNotMatch(adminAuth, /from ['"]\.\.\/auth\/rateLimiter['"]/);
assert.doesNotMatch(realAuth, /from ['"]\.\.\/auth\/rateLimiter['"]/);

assert.match(deployScript, /hobby/);
assert.match(deployScript, /self-hosted/);
assert.match(deployScript, /enterprise/);
assert.match(deployScript, /validate-deployment-profile\.cjs/);
assert.match(profileValidator, /enterprise requires TLS for PostgreSQL/);
assert.match(profileValidator, /enterprise requires Redis TLS/);
assert.match(profileValidator, /immutable sha256 digest/);
assert.match(profileValidator, /FUNCTIONS_EXECUTOR_URL/);
assert.match(profileValidator, /FUNCTIONS_RPC_CALLBACK_ORIGIN/);
assert.match(profileValidator, /Enterprise secrets must be distinct/);

assert.match(targetScript, /Remote BrisaBase targets must use HTTPS/);
assert.match(targetScript, /brisabase\.json/);
assert.match(targetScript, /brisabase\.targets\.json/);
assert.match(targetScript, /\/health\/required/);
assert.match(targetScript, /Cannot remove active target/);
assert.match(gitignore, /^brisabase\.targets\.json$/m, 'named target state must remain local and out of git');
assert.equal(packageJson.scripts.deployment, 'node scripts/deployment-profile.cjs');
assert.equal(packageJson.scripts.target, 'node scripts/target.cjs');
assert.equal(
  packageJson.scripts['test:deployment-profiles'],
  'node server/tests/deployment-profile-contract.test.cjs && node server/tests/deployment-init-security.test.cjs'
);

const validator = path.join(root, 'scripts/validate-deployment-profile.cjs');
const hobbyValidation = spawnSync(process.execPath, [validator, 'hobby', path.join(root, '.env.hobby.example')], { encoding: 'utf8' });
assert.equal(hobbyValidation.status, 0, hobbyValidation.stderr);
assert.match(hobbyValidation.stdout, /"topology":"local-bundled"/);

const enterpriseTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'brisabase-enterprise-test-'));
try {
  const secret = (char, length = 48) => char.repeat(length);
  const digest = (char) => char.repeat(64);
  const baseEnv = [
    'NODE_ENV=production',
    'BRISABASE_DEPLOYMENT_MODE=managed',
    'BRISABASE_PRODUCTION_TIER=ha',
    'BRISABASE_RELEASE=1.0.1',
    `BRISABASE_IMAGE=ghcr.io/acme/brisabase:1.0.1@sha256:${digest('a')}`,
    'DATABASE_URL=postgresql://app:0123456789abcdef0123456789abcdef@db.acme.test:5432/brisabase?sslmode=require',
    'DATABASE_MIGRATION_URL=postgresql://migrator:fedcba9876543210fedcba9876543210@db-direct.acme.test:5432/brisabase?sslmode=require',
    'DATABASE_SSL=true',
    'REDIS_URL=rediss://:00112233445566778899aabbccddeeff@redis.acme.test:6380',
    'REDIS_TLS=true',
    'S3_ENDPOINT=https://s3.acme.test',
    'S3_SECRET_KEY=0123456789abcdef0123456789abcdef',
    'STORAGE_PROVIDER=s3',
    'APP_URL=https://baas.acme.test',
    'API_URL=https://baas.acme.test',
    'STORAGE_PUBLIC_URL=https://storage.acme.test',
    'REALTIME_PUBLIC_URL=wss://baas.acme.test/realtime/v1/websocket',
    'CORS_ALLOWED_ORIGINS=https://console.acme.test',
    'COOKIE_SECURE=true',
    'COOKIE_HTTP_ONLY=true',
    'OBSERVABILITY_ENABLED=true',
    'INFRASTRUCTURE_PREVIEW_ENABLED=false',
    'ECOSYSTEM_PREVIEW_ENABLED=false',
    'ENTERPRISE_ENABLED=true',
    `JWT_SECRET=${secret('j')}`,
    `AUTH_ENCRYPTION_KEY=${secret('e')}`,
    `ADMIN_BOOTSTRAP_TOKEN=${secret('b')}`,
    `BACKUP_ENCRYPTION_KEY=${secret('k')}`,
    `BRISABASE_OPERATIONS_TOKEN=${secret('o')}`,
    `BRISABASE_PITR_OPERATOR_TOKEN=${secret('p')}`,
  ];

  const disabledFile = path.join(enterpriseTemp, 'enterprise-disabled.env');
  fs.writeFileSync(disabledFile, `${baseEnv.concat('FUNCTIONS_ENABLED=false').join('\n')}\n`);
  const disabled = spawnSync(process.execPath, [validator, 'enterprise', disabledFile], { encoding: 'utf8' });
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(disabled.stdout, /"functions":"disabled"/);

  const enabledFile = path.join(enterpriseTemp, 'enterprise-enabled.env');
  fs.writeFileSync(enabledFile, `${baseEnv.concat([
    'FUNCTIONS_ENABLED=true',
    'FUNCTIONS_EXECUTOR_URL=https://functions.acme.test',
    `FUNCTIONS_EXECUTOR_TOKEN=${secret('f')}`,
    'FUNCTIONS_RPC_CALLBACK_ORIGIN=https://baas.acme.test',
  ]).join('\n')}\n`);
  const enabled = spawnSync(process.execPath, [validator, 'enterprise', enabledFile], { encoding: 'utf8' });
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.match(enabled.stdout, /"functions":"external-https"/);

  const unsafeFile = path.join(enterpriseTemp, 'enterprise-unsafe-functions.env');
  fs.writeFileSync(unsafeFile, `${baseEnv.concat([
    'FUNCTIONS_ENABLED=true',
    'FUNCTIONS_EXECUTOR_URL=http://functions-executor:3100',
    `FUNCTIONS_EXECUTOR_TOKEN=${secret('f')}`,
    'FUNCTIONS_RPC_CALLBACK_ORIGIN=https://baas.acme.test',
  ]).join('\n')}\n`);
  const unsafe = spawnSync(process.execPath, [validator, 'enterprise', unsafeFile], { encoding: 'utf8' });
  assert.notEqual(unsafe.status, 0, 'managed Enterprise must reject internal HTTP Functions executor');
  assert.match(unsafe.stderr, /FUNCTIONS_EXECUTOR_URL must use https:/);
} finally {
  fs.rmSync(enterpriseTemp, { recursive: true, force: true });
}

const targetTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'brisabase-target-test-'));
try {
  fs.writeFileSync(path.join(targetTemp, 'brisabase.json'), JSON.stringify({ projectId: 'project_test', environmentId: 'env_test', url: 'http://localhost:3000' }, null, 2));
  const targetExecutable = path.join(root, 'scripts/target.cjs');
  const runTarget = (...args) => spawnSync(process.execPath, [targetExecutable, ...args], { cwd: targetTemp, encoding: 'utf8' });

  const addLocal = runTarget('add', 'local', 'http://localhost:3000');
  assert.equal(addLocal.status, 0, addLocal.stderr);

  const rejectRemoteHttp = runTarget('add', 'unsafe', 'http://baas.example.com');
  assert.notEqual(rejectRemoteHttp.status, 0, 'remote HTTP target must be rejected');
  assert.match(rejectRemoteHttp.stderr, /must use HTTPS/);

  const addRemote = runTarget('add', 'empresa', 'https://baas.example.com');
  assert.equal(addRemote.status, 0, addRemote.stderr);
  const useRemote = runTarget('use', 'empresa');
  assert.equal(useRemote.status, 0, useRemote.stderr);

  const switchedProject = JSON.parse(fs.readFileSync(path.join(targetTemp, 'brisabase.json'), 'utf8'));
  const targets = JSON.parse(fs.readFileSync(path.join(targetTemp, 'brisabase.targets.json'), 'utf8'));
  assert.equal(switchedProject.url, 'https://baas.example.com');
  assert.equal(targets.active, 'empresa');
  assert.equal(targets.targets.local.url, 'http://localhost:3000');
  assert.equal(targets.targets.empresa.url, 'https://baas.example.com');
} finally {
  fs.rmSync(targetTemp, { recursive: true, force: true });
}

assert.match(securityBaseline, /distributed limiter/i);
assert.match(securityBaseline, /Do not describe the bundled Compose as HA/);
assert.match(securityBaseline, /separate HTTPS Functions service/);
assert.match(deploymentDocs, /Hobby \/ Local/);
assert.match(deploymentDocs, /Self-Hosted/);
assert.match(deploymentDocs, /Enterprise \/ External Infrastructure/);
assert.match(deploymentDocs, /FUNCTIONS_ENABLED=false/);
assert.match(deploymentDocs, /plan vs deployment profile/i);

console.log('deployment-profile-contract.test.cjs: ok');
