const { access, chmod, mkdir, readFile, writeFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const LOCAL_PROFILE = {
  name: 'local',
  envFile: '.env.hobby',
  example: '.env.hobby.example',
  compose: ['docker-compose.local.yml', 'docker-compose.hobby.yml'],
  description: 'Local Docker development stack.',
};

function fail(message) {
  process.stderr.write(`brisabase local: ${message}\n`);
  process.exitCode = 1;
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

async function exists(file) {
  return access(path.join(root, file), constants.F_OK).then(() => true).catch(() => false);
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

function dockerComposeArgs(tail = []) {
  const args = ['compose', '--env-file', LOCAL_PROFILE.envFile];
  for (const file of LOCAL_PROFILE.compose) args.push('-f', file);
  args.push(...tail);
  return args;
}

async function init() {
  if (await exists(LOCAL_PROFILE.envFile)) {
    print({ profile: LOCAL_PROFILE.name, envFile: LOCAL_PROFILE.envFile, created: false, reason: 'already-exists' });
    return;
  }
  if (!await exists(LOCAL_PROFILE.example)) throw new Error(`Missing ${LOCAL_PROFILE.example}.`);
  const template = await readFile(path.join(root, LOCAL_PROFILE.example), 'utf8');
  const target = path.join(root, LOCAL_PROFILE.envFile);
  await writeFile(target, template, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(target, 0o600).catch(() => undefined);
  print({ profile: LOCAL_PROFILE.name, envFile: LOCAL_PROFILE.envFile, created: true, next: 'brisabase up' });
}

async function doctor() {
  if (!await exists(LOCAL_PROFILE.envFile)) await init();
  run('docker', ['version'], { capture: true });
  run('docker', ['compose', 'version'], { capture: true });
  run(process.execPath, ['scripts/validate-deployment-profile.cjs', 'local', LOCAL_PROFILE.envFile]);
  run('docker', dockerComposeArgs(['config', '--quiet']));
  print({ profile: LOCAL_PROFILE.name, status: 'ready', envFile: LOCAL_PROFILE.envFile, compose: LOCAL_PROFILE.compose });
}

async function up() {
  await doctor();
  run('docker', dockerComposeArgs(['up', '-d', '--build']));
  print({ profile: LOCAL_PROFILE.name, status: 'started', hint: 'Open http://localhost:3000 after /health/required reports healthy.' });
}

async function down() {
  run('docker', dockerComposeArgs(['down']));
  print({ profile: LOCAL_PROFILE.name, status: 'stopped' });
}

async function status() {
  run('docker', dockerComposeArgs(['ps']));
}

async function logs() {
  run('docker', dockerComposeArgs(['logs', '--tail', '200', 'brisabase']));
}

function help() {
  print(`BrisaBase Local Environment\n\nUsage:\n  brisabase deployment init\n  brisabase deployment doctor\n  brisabase deployment up\n  brisabase deployment down\n  brisabase deployment status\n  brisabase deployment logs\n\nFriendly shortcut:\n  brisabase up\n\nOnly the local Docker profile is supported in this development phase.`);
}

async function main() {
  const [command = 'help'] = process.argv.slice(2);
  if (command === 'help' || command === '--help' || command === '-h') return help();
  if (!['init', 'doctor', 'up', 'down', 'status', 'logs'].includes(command)) throw new Error(`Unknown command '${command}'. Use 'help'.`);
  if (command === 'init') return init();
  if (command === 'doctor') return doctor();
  if (command === 'up') return up();
  if (command === 'down') return down();
  if (command === 'status') return status();
  return logs();
}

main().catch((error) => fail(error?.message || String(error)));
