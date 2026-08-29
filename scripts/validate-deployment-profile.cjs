const { readFile } = require('node:fs/promises');
const path = require('node:path');

function fail(message) {
  throw new Error(`[BRISABASE DEPLOYMENT PROFILE ERROR] ${message}`);
}

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function url(name, value, schemes, options = {}) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${name} must be a valid URL.`); }
  if (!schemes.includes(parsed.protocol)) fail(`${name} must use ${schemes.join(' or ')}.`);
  if (!parsed.hostname) fail(`${name} must include a hostname.`);
  if (options.public && ['localhost', '127.0.0.1', 'postgres', 'redis', 'minio', 'brisabase', 'functions-executor'].includes(parsed.hostname)) {
    fail(`${name} must point to external infrastructure for the enterprise profile.`);
  }
  return parsed;
}

function assertEquals(env, key, expected, profile) {
  if (env[key] !== expected) fail(`${profile} requires ${key}=${expected}.`);
}

function secret(env, key, min = 32) {
  const value = env[key] || '';
  if (Buffer.byteLength(value, 'utf8') < min) fail(`${key} must contain at least ${min} bytes.`);
  if (/replace|example|your[-_ ]?secret|password/i.test(value)) fail(`${key} still contains placeholder material.`);
  return value;
}

function immutableImage(env, key) {
  const value = env[key] || '';
  if (!/@sha256:[a-f0-9]{64}$/i.test(value)) fail(`${key} must be pinned to an immutable sha256 digest.`);
}

function validateCors(value) {
  const origins = String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!origins.length || origins.includes('*')) fail('CORS_ALLOWED_ORIGINS must contain explicit HTTPS origins.');
  for (const origin of origins) url('CORS_ALLOWED_ORIGINS', origin, ['https:'], { public: true });
}

async function main() {
  const [profile = 'hobby', envFile = profile === 'hobby' ? '.env.hobby' : profile === 'enterprise' ? '.env.enterprise' : '.env.production'] = process.argv.slice(2);
  if (!['hobby', 'self-hosted', 'enterprise'].includes(profile)) fail(`Unknown profile '${profile}'.`);
  const source = await readFile(path.resolve(envFile), 'utf8');
  const env = parseEnv(source);

  if (profile === 'hobby') {
    if (env.NODE_ENV === 'production') fail('hobby cannot use NODE_ENV=production.');
    if (env.BRISABASE_DEPLOYMENT_MODE && env.BRISABASE_DEPLOYMENT_MODE !== 'self-hosted') fail('hobby uses the local self-hosted Docker topology.');
    if (env.BRISABASE_PRODUCTION_TIER && env.BRISABASE_PRODUCTION_TIER !== 'single-host') fail('hobby must remain single-host.');
    process.stdout.write(JSON.stringify({ profile, valid: true, topology: 'local-bundled' }) + '\n');
    return;
  }

  if (profile === 'self-hosted') {
    assertEquals(env, 'NODE_ENV', 'production', profile);
    assertEquals(env, 'BRISABASE_DEPLOYMENT_MODE', 'self-hosted', profile);
    if ((env.BRISABASE_PRODUCTION_TIER || 'single-host') !== 'single-host') fail('self-hosted Compose is intentionally single-host; use enterprise for HA/external infrastructure.');
    process.stdout.write(JSON.stringify({ profile, valid: true, topology: 'single-host-production' }) + '\n');
    return;
  }

  assertEquals(env, 'NODE_ENV', 'production', profile);
  assertEquals(env, 'BRISABASE_DEPLOYMENT_MODE', 'managed', profile);
  assertEquals(env, 'BRISABASE_PRODUCTION_TIER', 'ha', profile);
  if (!env.BRISABASE_RELEASE || /^(latest|main|master|dev|local)$/i.test(env.BRISABASE_RELEASE)) fail('BRISABASE_RELEASE must identify an immutable release.');

  immutableImage(env, 'BRISABASE_IMAGE');

  const database = url('DATABASE_URL', env.DATABASE_URL || '', ['postgres:', 'postgresql:'], { public: true });
  if (!database.username || !database.password) fail('DATABASE_URL must include a dedicated application username and password.');
  if (Buffer.byteLength(decodeURIComponent(database.password), 'utf8') < 16) fail('DATABASE_URL password must contain at least 16 bytes.');
  const migration = url('DATABASE_MIGRATION_URL', env.DATABASE_MIGRATION_URL || '', ['postgres:', 'postgresql:'], { public: true });
  if (!migration.username || !migration.password) fail('DATABASE_MIGRATION_URL must include a migration username and password.');
  if (Buffer.byteLength(decodeURIComponent(migration.password), 'utf8') < 16) fail('DATABASE_MIGRATION_URL password must contain at least 16 bytes.');
  const databaseTls = env.DATABASE_SSL === 'true' || ['require', 'verify-ca', 'verify-full'].includes((database.searchParams.get('sslmode') || '').toLowerCase());
  if (!databaseTls) fail('enterprise requires TLS for PostgreSQL (DATABASE_SSL=true or sslmode=require/verify-*).');

  const redis = url('REDIS_URL', env.REDIS_URL || '', ['redis:', 'rediss:'], { public: true });
  if (!redis.password) fail('REDIS_URL must be authenticated.');
  if (Buffer.byteLength(decodeURIComponent(redis.password), 'utf8') < 16) fail('REDIS_URL password must contain at least 16 bytes.');
  if (redis.protocol !== 'rediss:' && env.REDIS_TLS !== 'true') fail('enterprise requires Redis TLS via rediss:// or REDIS_TLS=true.');

  url('S3_ENDPOINT', env.S3_ENDPOINT || '', ['https:'], { public: true });
  url('APP_URL', env.APP_URL || '', ['https:'], { public: true });
  url('API_URL', env.API_URL || '', ['https:'], { public: true });
  url('STORAGE_PUBLIC_URL', env.STORAGE_PUBLIC_URL || '', ['https:'], { public: true });
  url('REALTIME_PUBLIC_URL', env.REALTIME_PUBLIC_URL || '', ['wss:'], { public: true });
  validateCors(env.CORS_ALLOWED_ORIGINS);

  assertEquals(env, 'COOKIE_SECURE', 'true', profile);
  assertEquals(env, 'COOKIE_HTTP_ONLY', 'true', profile);
  assertEquals(env, 'OBSERVABILITY_ENABLED', 'true', profile);
  assertEquals(env, 'INFRASTRUCTURE_PREVIEW_ENABLED', 'false', profile);
  assertEquals(env, 'ECOSYSTEM_PREVIEW_ENABLED', 'false', profile);
  if ((env.STORAGE_PROVIDER || 's3').toLowerCase() === 'local') fail('enterprise forbids local filesystem storage.');
  if (env.ENTERPRISE_ENABLED !== 'true') fail('enterprise profile requires ENTERPRISE_ENABLED=true.');

  const uniqueSecrets = [
    secret(env, 'JWT_SECRET'),
    secret(env, 'AUTH_ENCRYPTION_KEY'),
    secret(env, 'ADMIN_BOOTSTRAP_TOKEN'),
    secret(env, 'BACKUP_ENCRYPTION_KEY'),
    secret(env, 'BRISABASE_OPERATIONS_TOKEN'),
    secret(env, 'BRISABASE_PITR_OPERATOR_TOKEN'),
    secret(env, 'S3_SECRET_KEY', 16),
  ];

  if (env.FUNCTIONS_ENABLED === 'true') {
    const executor = url('FUNCTIONS_EXECUTOR_URL', env.FUNCTIONS_EXECUTOR_URL || '', ['https:'], { public: true });
    const callback = url('FUNCTIONS_RPC_CALLBACK_ORIGIN', env.FUNCTIONS_RPC_CALLBACK_ORIGIN || '', ['https:'], { public: true });
    if (executor.origin === callback.origin) fail('FUNCTIONS_EXECUTOR_URL must be a separate service origin from the BrisaBase callback origin.');
    uniqueSecrets.push(secret(env, 'FUNCTIONS_EXECUTOR_TOKEN'));
  } else if (env.FUNCTIONS_ENABLED !== 'false') {
    fail('Enterprise FUNCTIONS_ENABLED must be explicitly true or false.');
  }

  if (new Set(uniqueSecrets).size !== uniqueSecrets.length) fail('Enterprise secrets must be distinct from each other.');

  process.stdout.write(JSON.stringify({ profile, valid: true, topology: 'enterprise-external', functions: env.FUNCTIONS_ENABLED === 'true' ? 'external-https' : 'disabled' }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
