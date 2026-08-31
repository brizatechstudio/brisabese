const { access, readFile, writeFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');

const cwd = process.cwd();
const projectFile = path.join(cwd, 'brisabase.json');
const localUrl = 'http://localhost:3000';

async function exists(file) {
  return access(file, constants.F_OK).then(() => true).catch(() => false);
}

function fail(message) {
  process.stderr.write(`brisabase target: ${message}\n`);
  process.exitCode = 1;
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

async function project() {
  if (!await exists(projectFile)) throw new Error('brisabase.json was not found. Run "brisabase init" first.');
  return JSON.parse(await readFile(projectFile, 'utf8'));
}

async function useLocal() {
  const cfg = await project();
  cfg.url = localUrl;
  await writeFile(projectFile, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  print({ active: 'local', url: localUrl, project: projectFile });
}

async function doctor() {
  const response = await fetch(`${localUrl}/health/required`, { signal: AbortSignal.timeout(5000) }).catch((error) => ({ ok: false, status: 0, error }));
  if (!response.ok) throw new Error(`Local BrisaBase is unreachable or unhealthy (${response.status || 'network error'}).`);
  const payload = await response.json().catch(() => ({}));
  print({ target: 'local', url: localUrl, healthy: true, health: payload });
}

function help() {
  print(`BrisaBase Local Target\n\nUsage:\n  brisabase target local\n  brisabase target doctor\n\nThe target command is intentionally local-only in this development phase.`);
}

async function main() {
  const [command = 'local'] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) return help();
  if (command === 'local') return useLocal();
  if (command === 'doctor') return doctor();
  throw new Error(`Unknown target command '${command}'. Use 'help'.`);
}

main().catch((error) => fail(error?.message || String(error)));