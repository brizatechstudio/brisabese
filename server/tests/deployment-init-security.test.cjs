const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const executable = path.join(root, 'scripts', 'deployment-profile.cjs');

function parseEnv(source) {
  const values = {};
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

function runInit(profile, example) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `brisabase-${profile}-init-`));
  fs.copyFileSync(path.join(root, example), path.join(temp, example));
  const result = spawnSync(process.execPath, [executable, 'init', profile], { cwd: temp, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { temp, output: JSON.parse(result.stdout) };
}

const selfHosted = runInit('self-hosted', '.env.production.example');
try {
  const file = path.join(selfHosted.temp, '.env.production');
  const env = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const key of [
    'JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'ADMIN_BOOTSTRAP_TOKEN', 'BACKUP_ENCRYPTION_KEY',
    'BRISABASE_OPERATIONS_TOKEN', 'BRISABASE_PITR_OPERATOR_TOKEN', 'POSTGRES_PASSWORD',
    'DATABASE_APP_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_PASSWORD', 'S3_SECRET_KEY',
    'FUNCTIONS_EXECUTOR_TOKEN', 'HOSTING_CADDY_ASK_TOKEN',
  ]) {
    assert.ok((env[key] || '').length >= 32, `${key} should be generated securely`);
    assert.doesNotMatch(env[key], /REPLACE|example/i, `${key} must not retain placeholder material`);
  }
  assert.match(env.MINIO_ROOT_USER, /^bbroot_[a-f0-9]{24}$/);
  assert.match(env.S3_ACCESS_KEY, /^bbapp_[a-f0-9]{24}$/);
  assert.equal(env.DATABASE_URL, `postgresql://brisabase_app:${env.DATABASE_APP_PASSWORD}@postgres:5432/brisabase`);
  assert.equal(env.DATABASE_MIGRATION_URL, env.DATABASE_URL);
  assert.equal(env.REDIS_URL, `redis://:${env.REDIS_PASSWORD}@redis:6379`);
  assert.ok(selfHosted.output.generatedSecrets.includes('JWT_SECRET'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'generated production env should be mode 0600');
} finally {
  fs.rmSync(selfHosted.temp, { recursive: true, force: true });
}

const enterprise = runInit('enterprise', '.env.enterprise.example');
try {
  const file = path.join(enterprise.temp, '.env.enterprise');
  const env = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const key of ['JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'ADMIN_BOOTSTRAP_TOKEN', 'BACKUP_ENCRYPTION_KEY', 'BRISABASE_OPERATIONS_TOKEN', 'BRISABASE_PITR_OPERATOR_TOKEN']) {
    assert.ok((env[key] || '').length >= 32, `${key} should be generated securely`);
    assert.doesNotMatch(env[key], /REPLACE|example/i, `${key} must not retain placeholder material`);
  }
  assert.match(env.DATABASE_URL, /REPLACE_WITH_RANDOM_PASSWORD/, 'external database credentials must remain operator supplied');
  assert.match(env.REDIS_URL, /REPLACE_WITH_RANDOM_PASSWORD/, 'external Redis credentials must remain operator supplied');
  assert.match(env.S3_SECRET_KEY, /REPLACE_WITH_RANDOM_APP_SECRET/, 'external S3 credentials must remain operator supplied');
  assert.ok(enterprise.output.generatedSecrets.includes('JWT_SECRET'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'generated enterprise env should be mode 0600');
} finally {
  fs.rmSync(enterprise.temp, { recursive: true, force: true });
}

const hobby = runInit('hobby', '.env.hobby.example');
try {
  const file = path.join(hobby.temp, '.env.hobby');
  assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(path.join(root, '.env.hobby.example'), 'utf8'));
  assert.deepEqual(hobby.output.generatedSecrets, []);
} finally {
  fs.rmSync(hobby.temp, { recursive: true, force: true });
}

console.log('deployment-init-security.test.cjs: ok');
