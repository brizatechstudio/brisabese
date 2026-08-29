const { access, readFile, writeFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');

const cwd = process.cwd();
const projectFile = path.join(cwd, 'brisabase.json');
const targetsFile = path.join(cwd, 'brisabase.targets.json');

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

function normalizedUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Target URL must be a valid HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Target URL must be a clean HTTP(S) origin without embedded credentials, query or fragment.');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (!local && url.protocol !== 'https:') throw new Error('Remote BrisaBase targets must use HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.origin + (url.pathname === '/' ? '' : url.pathname);
}

async function state() {
  if (!await exists(targetsFile)) return { active: null, targets: {} };
  const value = JSON.parse(await readFile(targetsFile, 'utf8'));
  return { active: value.active || null, targets: value.targets && typeof value.targets === 'object' ? value.targets : {} };
}

async function save(value) {
  await writeFile(targetsFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function project() {
  if (!await exists(projectFile)) throw new Error('brisabase.json was not found. Run "brisabase init" first.');
  return JSON.parse(await readFile(projectFile, 'utf8'));
}

async function add(name, rawUrl) {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name || '')) throw new Error('Target name must use letters, numbers, dot, underscore or dash.');
  const url = normalizedUrl(rawUrl || '');
  const current = await state();
  current.targets[name] = { url, updatedAt: new Date().toISOString() };
  if (!current.active) current.active = name;
  await save(current);
  print({ added: name, url, active: current.active === name });
}

async function use(name) {
  const current = await state();
  const target = current.targets[name];
  if (!target) throw new Error(`Unknown target '${name}'.`);
  const cfg = await project();
  cfg.url = normalizedUrl(target.url);
  current.active = name;
  await writeFile(projectFile, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
  await save(current);
  print({ active: name, url: cfg.url, project: projectFile });
}

async function list() {
  const current = await state();
  const targets = Object.entries(current.targets).map(([name, target]) => ({ name, url: target.url, active: current.active === name }));
  print({ active: current.active, targets });
}

async function remove(name) {
  const current = await state();
  if (!current.targets[name]) throw new Error(`Unknown target '${name}'.`);
  if (current.active === name) throw new Error(`Cannot remove active target '${name}'. Switch targets first.`);
  delete current.targets[name];
  await save(current);
  print({ removed: name });
}

async function doctor(name) {
  const current = await state();
  const selected = current.targets[name || current.active];
  if (!selected) throw new Error('No active target. Add one with brisabase target add local http://localhost:3000.');
  const base = normalizedUrl(selected.url);
  const response = await fetch(`${base}/health/required`, { signal: AbortSignal.timeout(5000) }).catch((error) => ({ ok: false, status: 0, error }));
  if (!response.ok) throw new Error(`Target ${base} is unreachable or unhealthy (${response.status || 'network error'}).`);
  const payload = await response.json().catch(() => ({}));
  print({ target: name || current.active, url: base, healthy: true, health: payload });
}

function help() {
  print(`BrisaBase Targets\n\nUsage:\n  brisabase target add <name> <url>\n  brisabase target use <name>\n  brisabase target list\n  brisabase target remove <name>\n  brisabase target doctor [name]\n\nExamples:\n  brisabase target add local http://localhost:3000\n  brisabase target add empresa https://baas.empresa.com\n  brisabase target use empresa\n\nCompatibility:\n  The npm run target -- ... script remains available for repository maintainers.`);
}

async function main() {
  const [command = 'list', name, value] = process.argv.slice(2);
  if (['help', '--help', '-h'].includes(command)) return help();
  if (command === 'add') return add(name, value);
  if (command === 'use') return use(name);
  if (command === 'list') return list();
  if (command === 'remove') return remove(name);
  if (command === 'doctor') return doctor(name);
  throw new Error(`Unknown target command '${command}'.`);
}

main().catch((error) => fail(error?.message || String(error)));
