import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const digest = `sha256:${'a'.repeat(64)}`;
const managed: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'production', BRISABASE_DEPLOYMENT_MODE: 'managed', VITE_DATA_SOURCE: 'api', BRISABASE_RELEASE: '2026.8.11',
  APP_URL: 'https://brisabase.onrender.com', API_URL: 'https://brisabase.onrender.com', STORAGE_PUBLIC_URL: 'https://brisabase.onrender.com', CORS_ALLOWED_ORIGINS: 'https://app.contract.invalid,https://admin.contract.invalid',
  DATABASE_URL: 'postgresql://neon_owner:ManagedNeonDb_2026_9qW4eR7tY2uI@ep-silent-rain-a1b2c3d4-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require', DATABASE_MIGRATION_URL: 'postgresql://neon_owner:ManagedNeonDb_2026_9qW4eR7tY2uI@ep-silent-rain-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require', DATABASE_SSL: 'true', DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
  REDIS_URL: 'rediss://:ManagedRedis_2026_8pL3kN6mQ1rS@redis.contract.invalid:6380', REDIS_TLS: 'true',
  STORAGE_ENABLED: 'true', STORAGE_PROVIDER: 's3', S3_ENDPOINT: 'https://objects.contract.invalid', S3_ACCESS_KEY: 'managed-access-key', S3_SECRET_KEY: 'ManagedStorage_2026_7hJ2kL5nP8qR', S3_BUCKET: 'brisabase',
  JWT_SECRET: 'ManagedJwt_2026_A9dF4gH7jK2mN5pQ8rT', AUTH_ENCRYPTION_KEY: 'ManagedAuth_2026_B8cE3fG6hJ1kM4nP7qS', ADMIN_BOOTSTRAP_TOKEN: 'ManagedBootstrap_2026_C7bD2eF5gH9jL3mN6pQ',
  BRISABASE_OPERATIONS_TOKEN: 'ManagedOperations_2026_D6aC4eF8hJ2kM5nP9qR',
  COOKIE_SECURE: 'true', COOKIE_HTTP_ONLY: 'true', COOKIE_SAME_SITE: 'lax',
  SMTP_ENABLED: 'false', REALTIME_ENABLED: 'false', FUNCTIONS_ENABLED: 'false', BACKUP_ENABLED: 'false', OBSERVABILITY_ENABLED: 'true', INFRASTRUCTURE_PREVIEW_ENABLED: 'false', ECOSYSTEM_PREVIEW_ENABLED: 'false', API_KEY_HASH_ALGORITHM: 'sha256',
  ALERT_WEBHOOK_ENABLED: 'false', ALERT_WEBHOOK_URL: '', ALERT_WEBHOOK_TOKEN: '',
  AI_PROVIDER_ALLOWED_HOSTS: 'api.openai.com',
};

const selfHosted: NodeJS.ProcessEnv = {
  ...managed,
  BRISABASE_DEPLOYMENT_MODE: 'self-hosted', BRISABASE_RELEASE: 'contract-20260811',
  APP_DOMAIN: 'app.contract.invalid', STORAGE_DOMAIN: 'storage.contract.invalid', ACME_EMAIL: 'ops@contract.invalid',
  DATABASE_APP_USER: 'brisabase_app', DATABASE_APP_PASSWORD: 'CfgApplicationDb_2026_7uK4w9xP', DATABASE_URL: 'postgresql://brisabase_app:CfgApplicationDb_2026_7uK4w9xP@postgres:5432/brisabase', DATABASE_MIGRATION_URL: 'postgresql://brisabase_app:CfgApplicationDb_2026_7uK4w9xP@postgres:5432/brisabase', DATABASE_SSL: 'false', POSTGRES_USER: 'brisabase_admin', POSTGRES_PASSWORD: 'CfgBootstrapDb_2026_5pQ8m2zN',
  REDIS_PASSWORD: 'CfgRedis_2026_8cR5n3vL', REDIS_URL: 'redis://:CfgRedis_2026_8cR5n3vL@redis:6379', REDIS_TLS: 'false',
  MINIO_ROOT_USER: 'cfgminioadmin', MINIO_ROOT_PASSWORD: 'CfgMinio_2026_9sT6b4yM', STORAGE_PROVIDER: 'minio', S3_ENDPOINT: 'http://minio:9000', S3_ACCESS_KEY: 'cfgminioapp', S3_SECRET_KEY: 'CfgMinioApp_2026_4kR8v2mQ',
  SMTP_ENABLED: 'true', SMTP_HOST: 'smtp.contract.invalid', SMTP_FROM: 'no-reply@contract.invalid', REALTIME_ENABLED: 'true', REALTIME_PUBLIC_URL: 'wss://app.contract.invalid/realtime/v1/websocket',
  NODE_IMAGE: `node:22.18.0-bookworm-slim@${digest}`, POSTGRES_IMAGE: `postgres:16.10-alpine@${digest}`, REDIS_IMAGE: `redis:7.4.5-alpine@${digest}`, MINIO_IMAGE: `minio/minio:release@${digest}`, MINIO_MC_IMAGE: `minio/mc:release@${digest}`, CADDY_IMAGE: `caddy:2.10.2-alpine@${digest}`,
};

function validate(base: NodeJS.ProcessEnv, overrides: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['scripts/validate-production-env.cjs', '--environment'], { cwd: process.cwd(), env: { ...base, ...overrides }, encoding: 'utf8' });
  return { status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

function runtime(overrides: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', "const { config } = await import('./server/config.ts'); config.assertRealRuntime(); console.log('DATABASE_SSL=' + config.database.ssl);"], { cwd: process.cwd(), env: { ...managed, ...overrides }, encoding: 'utf8' });
  return { status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

const managedResult = validate(managed);
assert.equal(managedResult.status, 0, managedResult.stderr);
assert.match(managedResult.stdout, /passed \(managed\)/i);
const managedRuntime = runtime();
assert.equal(managedRuntime.status, 0, `Managed runtime rejected the supported Neon environment: ${managedRuntime.stderr}`);
assert.match(managedRuntime.stdout, /DATABASE_SSL=true/, 'Neon sslmode=require must enable TLS in the PostgreSQL runtime.');

const selfHostedResult = validate(selfHosted);
assert.equal(selfHostedResult.status, 0, selfHostedResult.stderr);
assert.equal(runtime(selfHosted).status, 0, 'Self-hosted runtime rejected the existing Compose-compatible configuration.');
assert.notEqual(validate(selfHosted, { S3_ACCESS_KEY: selfHosted.MINIO_ROOT_USER, S3_SECRET_KEY: selfHosted.MINIO_ROOT_PASSWORD }).status, 0, 'Bundled MinIO must reject root credentials reused by the application.');

assert.equal(validate({ ...managed, REALTIME_ENABLED: 'false', REALTIME_PUBLIC_URL: '' }).status, 0, 'Disabled realtime must not require REALTIME_PUBLIC_URL.');
assert.notEqual(validate({ ...managed, REALTIME_ENABLED: 'true', REALTIME_PUBLIC_URL: '' }).status, 0, 'Enabled realtime must require a secure public WebSocket URL.');
assert.equal(validate({ ...managed, BRISABASE_RELEASE: '', RENDER_GIT_COMMIT: 'a1b2c3d4e5f6a7b8c9d0' }).status, 0, 'Render commit metadata must be a safe release fallback.');
const renderDerived = validate({ ...managed, APP_URL: '', API_URL: '', STORAGE_PUBLIC_URL: '', REALTIME_ENABLED: 'true', REALTIME_PUBLIC_URL: '', CORS_ALLOWED_ORIGINS: '', RENDER_EXTERNAL_URL: 'https://brisabase-lab.onrender.com', BRISABASE_RELEASE: '', RENDER_GIT_COMMIT: 'a1b2c3d4e5f6a7b8c9d0' });
assert.equal(renderDerived.status, 0, `Render default public URL must satisfy managed URL/CORS/WebSocket configuration: ${renderDerived.stderr}`);
assert.equal(validate({ ...managed, STORAGE_ENABLED: 'false', S3_ENDPOINT: '', S3_ACCESS_KEY: '', S3_SECRET_KEY: '', S3_BUCKET: '', STORAGE_PUBLIC_URL: '' }).status, 0, 'Explicitly disabled storage must not require S3 configuration.');

for (const [name, base, overrides, expected] of [
  ['invalid Neon URL', managed, { DATABASE_URL: 'not-a-postgres-url' }, 'valid PostgreSQL URL'],
  ['pooled migration URL', managed, { DATABASE_MIGRATION_URL: 'postgresql://neon_owner:ManagedNeonDb_2026_9qW4eR7tY2uI@ep-silent-rain-a1b2c3d4-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require' }, 'direct PostgreSQL endpoint'],
  ['weak JWT secret', managed, { JWT_SECRET: 'replace-with-a-secret' }, 'JWT_SECRET must be at least 32 bytes'],
  ['managed mutable Compose image is irrelevant', managed, { NODE_IMAGE: '', POSTGRES_IMAGE: '', CADDY_IMAGE: '' }, ''],
  ['self-hosted requires Caddy image', selfHosted, { CADDY_IMAGE: '' }, 'CADDY_IMAGE is required'],
  ['self-hosted requires PostgreSQL bootstrap password', selfHosted, { POSTGRES_PASSWORD: '' }, 'POSTGRES_PASSWORD is required'],
  ['managed Redis needs TLS', managed, { REDIS_URL: 'redis://:ManagedRedis_2026_8pL3kN6mQ1rS@redis.contract.invalid:6379', REDIS_TLS: 'false' }, 'require rediss'],
] as Array<[string, NodeJS.ProcessEnv, NodeJS.ProcessEnv, string]>) {
  const result = validate(base, overrides);
  if (!expected) assert.equal(result.status, 0, `${name} unexpectedly failed: ${result.stderr}`);
  else {
    assert.notEqual(result.status, 0, `${name} unexpectedly passed production validation.`);
    assert.match(result.stderr, new RegExp(expected, 'i'), `${name} did not produce its expected diagnostic: ${result.stderr}`);
  }
}

const noLeak = validate(managed, { DATABASE_URL: 'postgresql://neon_owner:DoNotLogThisPassword_2026_7kLmN@/neondb?sslmode=require' });
assert.notEqual(noLeak.status, 0, 'An invalid managed database host should not pass validation.');
assert.doesNotMatch(noLeak.stderr, /DoNotLogThisPassword/, 'Database credentials must never appear in validation output.');

const healthz = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', "const express=(await import('express')).default; const { healthRouter }=await import('./server/routes/health.ts'); const app=express(); app.use(healthRouter); const server=app.listen(0,'127.0.0.1',async()=>{const address=server.address(); const response=await fetch('http://127.0.0.1:'+address.port+'/healthz'); console.log(JSON.stringify({status:response.status,body:await response.json()})); server.close();});"], { cwd: process.cwd(), env: { ...managed, BRISABASE_TEST_MODE: 'true' }, encoding: 'utf8' });
assert.equal(healthz.status, 0, healthz.stderr);
assert.match(String(healthz.stdout), /"status":200,"body":\{"status":"ok","service":"brisabase"\}/, '/healthz must return a minimal liveness payload.');

const serverSource = readFileSync('server.ts', 'utf8');
assert.match(serverSource, /app\.listen\(PORT, '0\.0\.0\.0'/, 'The HTTP server must bind all interfaces for Render.');
const dockerfile = readFileSync('Dockerfile', 'utf8');
assert.match(dockerfile, /healthz/, 'The generic Docker image liveness check must use /healthz.');
assert.match(dockerfile, /ARG VITE_DATA_SOURCE=api[\s\S]*ENV VITE_DATA_SOURCE=\$\{VITE_DATA_SOURCE\}/, 'Docker production frontend build must deterministically compile VITE_DATA_SOURCE=api without exposing secrets as build args.');
assert.doesNotMatch(dockerfile, /node server\/db\/migrate\.cjs && node dist\/server\/server\.cjs/, 'Production container must not run a second standalone migration pass before application startup.');
const deployScript = readFileSync('scripts/deploy.sh', 'utf8');
assert.doesNotMatch(deployScript, /run --rm brisabase node server\/db\/migrate\.cjs/, 'Deploy script must not duplicate the application startup migration path.');
const pgSslHelper = readFileSync('server/db/pg-ssl-options.cjs', 'utf8');
assert.match(pgSslHelper, /DATABASE_SSL_CA_FILE/, 'Cloud SQL direct TLS helper must support a server CA file.');
assert.match(pgSslHelper, /DATABASE_SSL_CERT_FILE/, 'Cloud SQL direct TLS helper must support an optional client certificate.');
assert.match(pgSslHelper, /DATABASE_SSL_KEY_FILE/, 'Cloud SQL direct TLS helper must support an optional client key.');
assert.match(pgSslHelper, /DATABASE_SSL_SERVERNAME/, 'Cloud SQL direct TLS helper must support explicit TLS server-name verification.');
for (const tool of ['server/db/migrate.cjs', 'server/db/status.cjs', 'server/db/admin-create.cjs']) {
  assert.match(readFileSync(tool, 'utf8'), /pgSslOptionsFromEnv/, `${tool} must reuse the production PostgreSQL TLS policy.`);
}
const postgresRuntime = readFileSync('server/db/postgres.ts', 'utf8');
assert.match(postgresRuntime, /config\.databaseMigrationUrl/, 'Application startup migrations must support a dedicated direct DATABASE_MIGRATION_URL.');
assert.match(postgresRuntime, /pg_advisory_xact_lock/, 'Application startup migrations must use a transaction-scoped PostgreSQL advisory lock as a second concurrency guard.');
assert.doesNotMatch(postgresRuntime, /pg_advisory_lock\(/, 'Application startup must not use session-scoped advisory locks behind transaction poolers.');
assert.doesNotMatch(postgresRuntime, /pg_advisory_unlock/, 'Transaction-scoped advisory locks must be released automatically at transaction end.');
const manualMigrator = readFileSync('server/db/migrate.cjs', 'utf8');
assert.match(manualMigrator, /DATABASE_MIGRATION_URL/, 'Manual migrator must prefer the dedicated migration connection when configured.');
assert.match(manualMigrator, /pg_advisory_xact_lock/, 'Manual migrator must use the same transaction-scoped lock policy.');
const compose = readFileSync('docker-compose.production.yml', 'utf8');
const serviceBlock = compose.slice(compose.indexOf('services:'), compose.indexOf('\nnetworks:'));
const services = [...serviceBlock.matchAll(/^  ([a-z][a-z0-9-]*):$/gm)].map((match) => match[1]);
assert.deepEqual(services, ['postgres', 'redis', 'minio', 'minio-init', 'functions-executor', 'brisabase', 'reverse-proxy'], 'Production Compose contains an unexpected runtime or is missing a required service.');
assert.doesNotMatch(serviceBlock, /mailpit|seed|mock|server\/backup\/data/i, 'Production Compose contains a development fixture or local backup fixture data.');
assert.match(serviceBlock, /minio-init:[\s\S]*BACKUP_STORAGE_BUCKET/, 'Production MinIO bootstrap must provision the configured backup bucket.');
assert.match(serviceBlock, /brisabase:[\s\S]*BACKUP_ENABLED: \"true\"[\s\S]*BACKUP_ENCRYPTION_KEY:[\s\S]*BACKUP_STORAGE_BUCKET:/, 'Production BrisaBase service must explicitly enable encrypted backups with a configured bucket.');
assert.match(serviceBlock, /minio-init:[\s\S]*MINIO_ROOT_USER:[\s\S]*S3_ACCESS_KEY:[\s\S]*deploy\/minio-init\.sh/, 'MinIO initializer must receive root credentials only for provisioning and mount the least-privilege bootstrap script.');
const minioInit = readFileSync('deploy/minio-init.sh', 'utf8');
assert.match(minioInit, /mc admin user add/, 'MinIO initializer must create a dedicated application identity.');
assert.match(minioInit, /mc admin policy attach/, 'MinIO initializer must attach the bucket-scoped application policy.');
assert.doesNotMatch(minioInit, /consoleAdmin|admin:\*/, 'Application MinIO policy must not grant administrative permissions.');
const runtimeStage = dockerfile.slice(dockerfile.indexOf('FROM ${NODE_RUNTIME_IMAGE} AS runtime'), dockerfile.indexOf('FROM runtime AS integration'));
assert.match(runtimeStage, /postgresql-client-18/, 'Production runtime must package PostgreSQL 18 recovery tooling to match the managed Neon server major version.');
const integrationStage = dockerfile.slice(dockerfile.indexOf('FROM runtime AS integration'), dockerfile.lastIndexOf('FROM runtime AS production'));
assert.match(integrationStage, /pg_dump --version \| grep -E ' 18\\\.'/i, 'Integration image must verify that PostgreSQL 18 pg_dump is inherited from the production runtime.');
assert.match(integrationStage, /seed\.cjs/, 'Dockerfile must isolate the destructive development seed in the integration target.');
const productionStage = dockerfile.slice(dockerfile.lastIndexOf('FROM runtime AS production'));
assert.doesNotMatch(productionStage, /seed\.cjs|server\/backup\/data/i, 'Final production target must not add integration-only seed or local backup fixture data.');
const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(packageManifest.scripts?.['release:validate:docker'], 'node scripts/run-docker-release-gates.cjs', 'Docker release validation must use the cross-platform launcher.');

console.log('Production configuration contract passed: managed Render/Neon and self-hosted Compose requirements remain separately enforced.');
