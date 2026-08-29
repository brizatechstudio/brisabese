const crypto = require('node:crypto');
const { access, chmod, mkdir, readFile, writeFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const PROFILES = {
  hobby: {
    envFile: '.env.hobby',
    example: '.env.hobby.example',
    compose: ['docker-compose.local.yml', 'docker-compose.hobby.yml'],
    description: 'Local Docker stack for learning, prototypes and personal projects.',
  },
  'self-hosted': {
    envFile: '.env.production',
    example: '.env.production.example',
    compose: ['docker-compose.production.yml'],
    description: 'Single-host production stack for a VPS or dedicated server.',
  },
  enterprise: {
    envFile: '.env.enterprise',
    example: '.env.enterprise.example',
    compose: ['docker-compose.enterprise.yml'],
    description: 'External PostgreSQL/Redis/S3 enterprise topology with Docker application planes.',
  },
};

function fail(message) {
  process.stderr.write(`brisabase deployment: ${message}\n`);
  process.exitCode = 1;
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

async function exists(file) {
  return access(path.join(root, file), constants.F_OK).then(() => true).catch(() => false);
}

function profile(name) {
  const selected = PROFILES[name || 'hobby'];
  if (!selected) throw new Error(`Unknown profile '${name}'. Use hobby, self-hosted, or enterprise.`);
  return { name: name || 'hobby', ...selected };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}.`);
  }
  return result;
}

function dockerComposeArgs(selected, tail = []) {
  const args = ['compose', '--env-file', selected.envFile];
  for (const file of selected.compose) args.push('-f', file);
  args.push(...tail);
  return args;
}

function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function envValue(source, key, value) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  if (!line.test(source)) return source;
  return source.replace(line, `${key}=${value}`);
}

function secureTemplate(selected, template) {
  if (selected.name === 'hobby') return { content: template, generated: [] };

  const common = {
    JWT_SECRET: randomSecret(),
    AUTH_ENCRYPTION_KEY: randomSecret(),
    ADMIN_BOOTSTRAP_TOKEN: randomSecret(),
    BACKUP_ENCRYPTION_KEY: randomSecret(),
    BRISABASE_OPERATIONS_TOKEN: randomSecret(),
    BRISABASE_PITR_OPERATOR_TOKEN: randomSecret(),
  };
  const values = selected.name === 'self-hosted'
    ? {
        ...common,
        POSTGRES_PASSWORD: randomSecret(36),
        DATABASE_APP_PASSWORD: randomSecret(36),
        REDIS_PASSWORD: randomSecret(36),
        MINIO_ROOT_USER: `bbroot_${crypto.randomBytes(12).toString('hex')}`,
        MINIO_ROOT_PASSWORD: randomSecret(36),
        S3_ACCESS_KEY: `bbapp_${crypto.randomBytes(12).toString('hex')}`,
        S3_SECRET_KEY: randomSecret(36),
        FUNCTIONS_EXECUTOR_TOKEN: randomSecret(),
        HOSTING_CADDY_ASK_TOKEN: randomSecret(),
      }
    : common;

  let content = template;
  for (const [key, value] of Object.entries(values)) content = envValue(content, key, value);

  if (selected.name === 'self-hosted') {
    content = envValue(content, 'DATABASE_URL', `postgresql://brisabase_app:${values.DATABASE_APP_PASSWORD}@postgres:5432/brisabase`);
    content = envValue(content, 'DATABASE_MIGRATION_URL', `postgresql://brisabase_app:${values.DATABASE_APP_PASSWORD}@postgres:5432/brisabase`);
    content = envValue(content, 'REDIS_URL', `redis://:${values.REDIS_PASSWORD}@redis:6379`);
  }

  return { content, generated: Object.keys(values) };
}

async function init(selected) {
  if (await exists(selected.envFile)) {
    print({ profile: selected.name, envFile: selected.envFile, created: false, reason: 'already-exists' });
    return;
  }
  if (!await exists(selected.example)) throw new Error(`Missing ${selected.example}.`);
  await mkdir(path.dirname(path.join(root, selected.envFile)), { recursive: true });
  const template = await readFile(path.join(root, selected.example), 'utf8');
  const prepared = secureTemplate(selected, template);
  const target = path.join(root, selected.envFile);
  await writeFile(target, prepared.content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(target, 0o600).catch(() => undefined);
  print({
    profile: selected.name,
    envFile: selected.envFile,
    created: true,
    generatedSecrets: prepared.generated,
    next: selected.name === 'hobby'
      ? 'brisabase up'
      : `Review ${selected.envFile}, configure domains/images/external credentials, then run brisabase deployment doctor ${selected.name}`,
  });
}

async function doctor(selected) {
  if (!await exists(selected.envFile)) throw new Error(`${selected.envFile} was not found. Run brisabase deployment init ${selected.name}.`);
  run('docker', ['version'], { capture: true });
  run('docker', ['compose', 'version'], { capture: true });
  run(process.execPath, ['scripts/validate-deployment-profile.cjs', selected.name, selected.envFile]);
  if (selected.name === 'self-hosted') {
    run(process.execPath, ['scripts/validate-production-env.cjs'], {
      env: { BRISABASE_ENV_FILE: selected.envFile },
    });
  }
  run('docker', dockerComposeArgs(selected, ['config', '--quiet']));
  print({ profile: selected.name, status: 'ready', envFile: selected.envFile, compose: selected.compose });
}

async function up(selected) {
  await doctor(selected);
  const args = dockerComposeArgs(selected, ['up', '-d']);
  if (selected.name !== 'enterprise') args.push('--build');
  run('docker', args);
  print({
    profile: selected.name,
    status: 'started',
    hint: selected.name === 'hobby'
      ? 'Open http://localhost:3000 after /health/required reports healthy.'
      : 'Use the APP_URL/API_URL configured for this profile.',
  });
}

async function down(selected) {
  if (!await exists(selected.envFile)) throw new Error(`${selected.envFile} was not found.`);
  run('docker', dockerComposeArgs(selected, ['down']));
  print({ profile: selected.name, status: 'stopped' });
}

async function status(selected) {
  if (!await exists(selected.envFile)) throw new Error(`${selected.envFile} was not found.`);
  run('docker', dockerComposeArgs(selected, ['ps']));
}

async function logs(selected) {
  if (!await exists(selected.envFile)) throw new Error(`${selected.envFile} was not found.`);
  run('docker', dockerComposeArgs(selected, ['logs', '--tail', '200', 'brisabase']));
}

function help() {
  print(`BrisaBase Deployment Profiles\n\nUsage:\n  brisabase deployment init [hobby|self-hosted|enterprise]\n  brisabase deployment doctor [profile]\n  brisabase deployment up [profile]\n  brisabase deployment down [profile]\n  brisabase deployment status [profile]\n  brisabase deployment logs [profile]\n\nFriendly shortcut:\n  brisabase up                    Equivalent to: brisabase deployment up hobby\n\nProfiles:\n  hobby        Local Docker stack for beginners and prototypes\n  self-hosted  Single-server production deployment\n  enterprise   External PostgreSQL/Redis/S3 with Docker application planes\n\nInit behavior:\n  Hobby is ready with local-only development defaults. Self-Hosted and Enterprise\n  generate independent BrisaBase secrets automatically; domains, immutable images\n  and externally managed infrastructure credentials still require operator input.\n\nCompatibility:\n  The npm run deployment -- ... script remains available for repository maintainers.`);
}

async function main() {
  const [command = 'help', name = 'hobby'] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') return help();
  const selected = profile(name);
  if (command === 'init') return init(selected);
  if (command === 'doctor') return doctor(selected);
  if (command === 'up') return up(selected);
  if (command === 'down') return down(selected);
  if (command === 'status') return status(selected);
  if (command === 'logs') return logs(selected);
  throw new Error(`Unknown command '${command}'.`);
}

main().catch((error) => fail(error?.message || String(error)));
