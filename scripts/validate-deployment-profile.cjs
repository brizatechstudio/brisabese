const { readFile } = require('node:fs/promises');
const path = require('node:path');

function fail(message) {
  throw new Error(`[BRISABASE LOCAL PROFILE ERROR] ${message}`);
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

function localUrl(name, value, schemes) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${name} must be a valid URL.`); }
  if (!schemes.includes(parsed.protocol)) fail(`${name} must use ${schemes.join(' or ')}.`);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) fail(`${name} must point to localhost for the local profile.`);
  return parsed;
}

async function main() {
  const [profile = 'local', envFile = '.env.hobby'] = process.argv.slice(2);
  if (profile !== 'local' && profile !== 'hobby') fail(`Unknown profile '${profile}'. Only local is supported.`);
  const source = await readFile(path.resolve(envFile), 'utf8');
  const env = parseEnv(source);

  if (env.NODE_ENV === 'production') fail('The local profile cannot use NODE_ENV=production.');
  if (env.BRISABASE_DEPLOYMENT_MODE && env.BRISABASE_DEPLOYMENT_MODE !== 'self-hosted') fail('The local profile must use self-hosted runtime mode when set.');
  if (env.BRISABASE_PRODUCTION_TIER && env.BRISABASE_PRODUCTION_TIER !== 'single-host') fail('The local profile must remain single-host.');

  localUrl('BRISABASE_PUBLIC_URL', env.BRISABASE_PUBLIC_URL || 'http://localhost:3000', ['http:']);
  localUrl('BRISABASE_REALTIME_PUBLIC_URL', env.BRISABASE_REALTIME_PUBLIC_URL || 'ws://localhost:3000/realtime/v1/websocket', ['ws:']);

  if (env.BRISABASE_PORT && !/^\d+$/.test(env.BRISABASE_PORT)) fail('BRISABASE_PORT must be numeric.');
  if (env.BRISABASE_POSTGRES_PORT && !/^\d+$/.test(env.BRISABASE_POSTGRES_PORT)) fail('BRISABASE_POSTGRES_PORT must be numeric.');
  if (env.BRISABASE_MINIO_PORT && !/^\d+$/.test(env.BRISABASE_MINIO_PORT)) fail('BRISABASE_MINIO_PORT must be numeric.');
  if (env.BRISABASE_SMTP_PORT && !/^\d+$/.test(env.BRISABASE_SMTP_PORT)) fail('BRISABASE_SMTP_PORT must be numeric.');
  if (env.BRISABASE_MAILPIT_PORT && !/^\d+$/.test(env.BRISABASE_MAILPIT_PORT)) fail('BRISABASE_MAILPIT_PORT must be numeric.');

  process.stdout.write(JSON.stringify({ profile: 'local', valid: true, topology: 'local-docker' }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
