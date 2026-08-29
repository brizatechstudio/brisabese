#!/usr/bin/env node
'use strict';

const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

const [, , tool, ...args] = process.argv;
const allowedTools = new Set(['pg_dump', 'pg_restore']);
const supportedMajors = new Set([16, 18]);

function fail(message) {
  process.stderr.write(`[BRISABASE RECOVERY ERROR] ${message}\n`);
  process.exit(2);
}

if (!allowedTools.has(tool)) fail('Unsupported PostgreSQL recovery command.');

// Version probes are build-time checks and do not have a target connection.
// Report the newest packaged client while the runtime path below always picks
// the exact server major.
if (args.length === 1 && args[0] === '--version') {
  const result = spawnSync(`/usr/lib/postgresql/18/bin/${tool}`, ['--version'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function option(name) {
  const long = `--${name}`;
  const inline = `${long}=`;
  for (let index = 0; index < args.length; index += 1) {
    const current = String(args[index]);
    if (current === long && index + 1 < args.length) return String(args[index + 1]);
    if (current.startsWith(inline)) return current.slice(inline.length);
  }
  return '';
}

const host = option('host');
const port = option('port') || '5432';
const username = option('username');
const database = option('dbname');
if (!host || !username || !database) {
  fail('host, username, and dbname are required to select a compatible PostgreSQL client.');
}

// Use the newest packaged psql only for the harmless version probe. libpq
// credentials stay in the inherited environment (PGPASSWORD); passwords are
// never copied into command-line arguments or diagnostics.
const probe = spawnSync('/usr/lib/postgresql/18/bin/psql', [
  '--host', host,
  '--port', port,
  '--username', username,
  '--dbname', database,
  '--no-psqlrc',
  '--tuples-only',
  '--no-align',
  '--quiet',
  '--command', 'SHOW server_version_num',
], {
  env: process.env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (probe.status !== 0) fail('Unable to determine the PostgreSQL server version.');
const versionNumber = Number.parseInt(String(probe.stdout || '').trim(), 10);
if (!Number.isFinite(versionNumber) || versionNumber < 100000) fail('PostgreSQL returned an invalid server version.');
const major = Math.trunc(versionNumber / 10000);
if (!supportedMajors.has(major)) {
  fail(`PostgreSQL ${major} is not supported by the packaged recovery clients.`);
}

const executable = `/usr/lib/postgresql/${major}/bin/${tool}`;
if (!existsSync(executable)) fail(`PostgreSQL ${major} recovery client is not installed.`);

const result = spawnSync(executable, args, {
  env: process.env,
  stdio: 'inherit',
});
if (result.error) fail('The PostgreSQL recovery command could not be started.');
process.exit(result.status ?? 1);
