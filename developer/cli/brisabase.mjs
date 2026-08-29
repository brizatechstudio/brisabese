#!/usr/bin/env node
import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const VERSION = '1.0.1-beta.1';
const cwd = process.cwd();
const configPath = path.join(cwd, 'brisabase.json');
const sessionPath = path.join(homedir(), '.brisabase', 'session.json');
const defaultSnapshot = path.join(cwd, 'brisabase.schema.json');
const defaultTypes = path.join(cwd, 'brisabase.types.ts');
const defaultOpenApi = path.join(cwd, 'brisabase.openapi.json');
const defaultIacManifest = path.join(cwd, 'brisabase.manifest.json');
const defaultTerraform = path.join(cwd, 'main.tf');
const environmentId = (cfg) => cfg.environmentId || (cfg.projectId && cfg.environment ? `env_${cfg.projectId}_${cfg.environment}` : undefined);
const exists = async (file) => access(file, constants.F_OK).then(() => true).catch(() => false);
const print = (value) => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
const fail = (message) => { process.stderr.write(`brisabase: ${message}\n`); process.exitCode = 1; };
const flag = (args, name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const positional = (args) => args.filter((value, index) => !value.startsWith('--') && (index === 0 || !args[index - 1]?.startsWith('--')));

async function config(required = true) {
  if (!await exists(configPath)) {
    if (required) throw new Error('brisabase.json was not found. Run "brisabase init" first.');
    return {};
  }
  return JSON.parse(await readFile(configPath, 'utf8'));
}
async function session() { return (await exists(sessionPath)) ? JSON.parse(await readFile(sessionPath, 'utf8')) : {}; }

async function request(method, apiPath, body, options = {}) {
  const cfg = await config(options.configRequired !== false);
  const auth = await session();
  const envId = environmentId(cfg);
  const headers = {
    ...(body === undefined || options.rawBody ? {} : { 'Content-Type': 'application/json' }),
    ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
    ...((process.env.BRISABASE_TOKEN || auth.token) ? { Authorization: `Bearer ${process.env.BRISABASE_TOKEN || auth.token}` } : {}),
    ...(cfg.organizationId ? { 'x-organization-id': cfg.organizationId } : {}),
    ...(cfg.projectId ? { 'x-project-id': cfg.projectId } : {}),
    ...(envId ? { 'x-environment-id': envId } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${process.env.BRISABASE_URL || cfg.url || 'http://localhost:3000'}${apiPath}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: options.rawBody ? body : JSON.stringify(body) }),
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
  if (!response.ok) throw new Error(data?.error?.message || data?.message || `API request failed (${response.status}).`);
  return data;
}

function help() {
  print(`BrisaBase CLI ${VERSION}\n\nCommands:\n  login --token <jwt>                     Store an admin session token\n  logout                                  Remove the local session\n  init [template] [dir]                   Create brisabase.json and starter files\n  dev | start                             Start local BrisaBase\n  doctor                                  Check CLI config and API health\n\nDatabase:\n  db pull [file]                          Save a real schema snapshot\n  db diff [file]                          Compare remote schema to a snapshot\n  db push [migration.sql]                 Apply one file or pending ./migrations/*.sql\n  migration create <name>                 Create a migration file\n  migration apply [file]                  Apply one file or pending migrations\n  migration list                          List applied migrations
  migration rollback <id>                 Roll back the latest reversible migration\n\nFunctions:\n  functions list | health\n  functions create <name> [file]\n  functions deploy <id> [version]\n  functions rollback <id> <version>\n  functions invoke <id> [json]\n  functions logs <id>\n  functions queues | jobs <queue>\n  functions enqueue <queue> <functionId> [json]\n\nDeveloper tooling:\n  secrets list | set <name> <value> | delete <name>\n  env list | set <name> <value>\n  types pull [file]\n  openapi pull [file]\n  storage upload <bucket> <source> <target>\n  storage download <bucket> <source> <target> [--force]\n  hosting sites | deploy <siteId> <dir> | domains <siteId>
  hosting domain-add <siteId> <hostname> | domain-verify <siteId> <domainId>
  backup list | create | schedules | recovery
  restore <id> | logs | monitor`);
}

async function init(args) {
  const template = args[0] || 'typescript-starter';
  const directory = path.resolve(args[1] || '.');
  const target = path.join(directory, 'brisabase.json');
  if (await exists(target)) throw new Error(`Refusing to overwrite ${target}.`);
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await mkdir(path.join(directory, 'migrations'), { recursive: true });
  const project = { projectId: 'replace-me', organizationId: 'replace-me', environmentId: 'replace-me', environment: 'development', region: 'sa-east-1', template, url: 'http://localhost:3000' };
  await writeFile(target, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  await writeFile(path.join(directory, 'src', 'brisabase.ts'), `import { createClient } from '@brisabase/js';\n\nexport const brisabase = createClient({\n  url: ${JSON.stringify(project.url)},\n  projectId: ${JSON.stringify(project.projectId)},\n  environmentId: ${JSON.stringify(project.environmentId)},\n  apiKey: process.env.BRISABASE_PUBLIC_KEY,\n});\n`, 'utf8');
  await writeFile(path.join(directory, 'README.md'), `# BrisaBase ${template}\n\nCreated with \`brisabase init\`.\n`, 'utf8');
  print({ created: ['brisabase.json', 'src/brisabase.ts', 'migrations/'], template, directory });
}

function runNpm(script) {
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(executable, ['run', script], { stdio: 'inherit', env: { ...process.env, BRISABASE_LOCAL: '1' } });
  child.on('exit', (code) => { process.exitCode = code || 0; });
}

function splitMigration(content) {
  const marker = /^\s*--\s*@down\s*$/mi;
  const match = marker.exec(content);
  return match ? { sqlUp: content.slice(0, match.index).trim(), sqlDown: content.slice(match.index + match[0].length).trim() } : { sqlUp: content.trim(), sqlDown: '' };
}

async function migrationFiles() {
  const dir = path.join(cwd, 'migrations');
  if (!await exists(dir)) return [];
  return (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort().map((file) => path.join(dir, file));
}

async function applyMigrationFile(file) {
  const content = await readFile(file, 'utf8');
  const { sqlUp, sqlDown } = splitMigration(content);
  if (!sqlUp) throw new Error(`Migration ${file} has no SQL to apply.`);
  const name = path.basename(file);
  const applied = await request('GET', '/api/database/migrations');
  if (Array.isArray(applied) && applied.some((item) => item.name === name && item.status !== 'rolled_back')) return { file, skipped: true };
  const result = await request('POST', '/api/database/migrations', { name, sqlUp, sqlDown: sqlDown || undefined });
  return { file, applied: true, migration: result };
}

async function applyMigrations(file) {
  const files = file ? [path.resolve(file)] : await migrationFiles();
  if (!files.length) throw new Error('No migration files were found.');
  const results = [];
  for (const item of files) results.push(await applyMigrationFile(item));
  return results;
}

async function database(action, rest) {
  if (action === 'pull') {
    const target = path.resolve(rest[0] || defaultSnapshot);
    const snapshot = await request('GET', '/api/database/schema/snapshot');
    await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    return print({ pulled: target, tables: snapshot.tables?.length || 0, generatedAt: snapshot.generatedAt });
  }
  if (action === 'diff') {
    const source = path.resolve(rest[0] || defaultSnapshot);
    if (!await exists(source)) throw new Error(`Schema snapshot not found: ${source}. Run "brisabase db pull" first.`);
    const baseline = JSON.parse(await readFile(source, 'utf8'));
    return print(await request('POST', '/api/database/schema/diff', { baseline }));
  }
  if (action === 'push') return print(await applyMigrations(rest[0]));
  throw new Error('Use db pull, db diff, or db push.');
}

async function migration(action, rest) {
  if (action === 'create') {
    const name = rest[0];
    if (!name) throw new Error('Migration name is required.');
    const dir = path.join(cwd, 'migrations');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}_${name.replace(/[^a-z0-9_-]/gi, '_')}.sql`);
    await writeFile(file, '-- BrisaBase migration\n\n-- SQL up\n\n-- @down\n-- SQL down\n', 'utf8');
    return print({ created: file });
  }
  if (action === 'apply') return print(await applyMigrations(rest[0]));
  if (action === 'list') return print(await request('GET', '/api/database/migrations'));
  if (action === 'rollback') { if (!rest[0]) throw new Error('Migration id is required.'); return print(await request('POST', `/api/database/migrations/${encodeURIComponent(rest[0])}/rollback`, { confirm: rest[0] })); }
  throw new Error('Use migration create <name>, migration apply [file], migration list, or migration rollback <id>.');
}

async function functions(action, rest) {
  if (action === 'list') return print(await request('GET', '/api/functions'));
  if (action === 'health') return print(await request('GET', '/api/functions/health'));
  if (action === 'create') {
    const name = rest[0]; if (!name) throw new Error('Function name is required.');
    const code = rest[1] ? await readFile(path.resolve(rest[1]), 'utf8') : `export default async (_req, ctx) => ctx.response.json({ ok: true, function: ${JSON.stringify(name)} });`;
    return print(await request('POST', '/api/functions', { name, code, access: 'authenticated' }));
  }
  if (action === 'deploy') return print(await request('POST', `/api/functions/${encodeURIComponent(rest[0] || '')}/deploy`, rest[1] ? { version: Number(rest[1]) } : {}));
  if (action === 'rollback') return print(await request('POST', `/api/functions/${encodeURIComponent(rest[0] || '')}/rollback`, { version: Number(rest[1]) }));
  if (action === 'logs') return print(await request('GET', `/api/functions/${encodeURIComponent(rest[0] || '')}/logs`));
  if (action === 'invoke') { const body = rest[1] ? JSON.parse(rest[1]) : {}; return print(await request('POST', `/api/functions/${encodeURIComponent(rest[0] || '')}/invoke`, { body })); }
  if (action === 'queues') return print(await request('GET', '/api/functions/queues/list'));
  if (action === 'jobs') return print(await request('GET', `/api/functions/queues/${encodeURIComponent(rest[0] || '')}/jobs`));
  if (action === 'enqueue') { const payload = rest[2] ? JSON.parse(rest[2]) : {}; return print(await request('POST', `/api/functions/queues/${encodeURIComponent(rest[0] || '')}/jobs`, { functionId: rest[1], payload })); }
  if (action === 'retry') return print(await request('POST', `/api/functions/queues/${encodeURIComponent(rest[0] || '')}/jobs/${encodeURIComponent(rest[1] || '')}/retry`, {}));
  if (action === 'crons') return print(await request('GET', `/api/functions/${encodeURIComponent(rest[0] || '')}/crons`));
  if (action === 'cron-create') { if (!rest[0] || !rest[1]) throw new Error('Use functions cron-create <functionId> <expression>.'); return print(await request('POST', `/api/functions/${encodeURIComponent(rest[0])}/crons`, { expression: rest.slice(1).join(' ') })); }
  if (action === 'cron-enable' || action === 'cron-disable') { if (!rest[0] || !rest[1]) throw new Error(`Use functions ${action} <functionId> <cronId>.`); return print(await request('PATCH', `/api/functions/${encodeURIComponent(rest[0])}/crons/${encodeURIComponent(rest[1])}`, { enabled: action === 'cron-enable' })); }
  if (action === 'cron-delete') { if (!rest[0] || !rest[1]) throw new Error('Use functions cron-delete <functionId> <cronId>.'); await request('DELETE', `/api/functions/${encodeURIComponent(rest[0])}/crons/${encodeURIComponent(rest[1])}`); return print({ deleted: rest[1] }); }
  throw new Error('Unknown functions command. Run "brisabase help".');
}

async function storage(args) {
  const [action, bucket, source, target] = args;
  if (!bucket || !source || !target) throw new Error(`Usage: brisabase storage ${action} <bucket> <source> <target>.`);
  const cfg = await config(); const auth = await session(); const envId = environmentId(cfg);
  const headers = { ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}), 'x-project-id': cfg.projectId, 'x-environment-id': envId };
  if (action === 'upload') {
    const content = await readFile(source);
    const response = await fetch(`${process.env.BRISABASE_URL || cfg.url || 'http://localhost:3000'}/storage/v1/object/${encodeURIComponent(bucket)}/${target.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: content });
    if (!response.ok) throw new Error(`Storage upload failed (${response.status}).`);
    return print(await response.json());
  }
  if (action === 'download') {
    if (await exists(target) && !args.includes('--force')) throw new Error(`Refusing to overwrite ${target}; pass --force to allow it.`);
    const response = await fetch(`${process.env.BRISABASE_URL || cfg.url || 'http://localhost:3000'}/storage/v1/object/${encodeURIComponent(bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`, { headers });
    if (!response.ok) throw new Error(`Storage download failed (${response.status}).`);
    await writeFile(target, Buffer.from(await response.arrayBuffer())); return print({ downloaded: target });
  }
  throw new Error('Storage action must be upload or download.');
}


async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true }); const files = [];
  for (const entry of entries) { const absolute=path.join(current,entry.name); if(entry.isDirectory()) files.push(...await walkFiles(root,absolute)); else if(entry.isFile()) files.push({ absolute, relative:path.relative(root,absolute).split(path.sep).join('/') }); }
  return files;
}

async function hosting(action, rest) {
  if (!action || action === 'sites') return print(await request('GET','/api/hosting/sites'));
  if (action === 'deploy') {
    const siteId=rest[0], directory=path.resolve(rest[1]||'dist'); if(!siteId)throw new Error('Use hosting deploy <siteId> <directory>.');
    if(!await exists(directory))throw new Error(`Hosting directory not found: ${directory}`);
    const files=await walkFiles(directory); if(!files.some((item)=>item.relative==='index.html'))throw new Error('Hosting directory must contain index.html.');
    const deployment=await request('POST',`/api/hosting/sites/${encodeURIComponent(siteId)}/deployments/start`,{});
    let uploaded=0;
    try {
      for(const file of files){ const content=await readFile(file.absolute); await request('PUT',`/api/hosting/sites/${encodeURIComponent(siteId)}/deployments/${encodeURIComponent(deployment.id)}/files?path=${encodeURIComponent(file.relative)}`,content,{rawBody:true,contentType:'application/octet-stream',headers:{'x-file-mime':'application/octet-stream'}}); uploaded+=1; process.stderr.write(`brisabase: hosting ${uploaded}/${files.length} ${file.relative}\n`); }
      const result=await request('POST',`/api/hosting/sites/${encodeURIComponent(siteId)}/deployments/${encodeURIComponent(deployment.id)}/finalize`,{activate:true}); return print({deployment:result,uploaded});
    } catch(error){ throw new Error(`Hosting deployment ${deployment.id} failed after ${uploaded}/${files.length} files: ${error.message}`); }
  }
  if(action==='domains'){ if(!rest[0])throw new Error('Site id is required.'); return print(await request('GET',`/api/hosting/sites/${encodeURIComponent(rest[0])}/domains`)); }
  if(action==='domain-add'){ if(!rest[0]||!rest[1])throw new Error('Use hosting domain-add <siteId> <hostname>.'); return print(await request('POST',`/api/hosting/sites/${encodeURIComponent(rest[0])}/domains`,{hostname:rest[1]})); }
  if(action==='domain-verify'){ if(!rest[0]||!rest[1])throw new Error('Use hosting domain-verify <siteId> <domainId>.'); return print(await request('POST',`/api/hosting/sites/${encodeURIComponent(rest[0])}/domains/${encodeURIComponent(rest[1])}/verify`,{})); }
  throw new Error('Unknown hosting command. Run "brisabase help".');
}

async function backup(action) {
  if (!action || action === 'list') return print(await request('GET','/api/backups'));
  if (action === 'create') return print(await request('POST','/api/backups',{type:'full'}));
  if (action === 'schedules') return print(await request('GET','/api/backups/schedules'));
  if (action === 'recovery') return print(await request('GET','/api/backups/recovery/status'));
  throw new Error('Use backup list, backup create, backup schedules, or backup recovery.');
}

async function iac(action, rest) {
  if (!action || action === 'export') {
    const target = path.resolve((rest.find((value) => !value.startsWith('--')) || defaultIacManifest));
    const terraform = rest.includes('--terraform');
    const payload = await request('GET', `/api/iac/export?provider=${terraform ? 'terraform' : 'json'}`);
    await writeFile(target, `${JSON.stringify(payload.manifest, null, 2)}\n`, 'utf8');
    if (terraform && payload.terraform) await writeFile(defaultTerraform, `${payload.terraform}\n`, 'utf8');
    return print({ exported: target, checksum: payload.checksum, ...(terraform ? { terraform: defaultTerraform } : {}) });
  }
  if (action === 'diff' || action === 'check') {
    const target = path.resolve(rest.find((value) => !value.startsWith('--')) || defaultIacManifest);
    if (!await exists(target)) throw new Error(`IaC manifest not found: ${target}`);
    const raw = await readFile(target, 'utf8');
    const manifest = JSON.parse(raw);
    const expectedSha = flag(rest, '--expected-sha');
    if (expectedSha) {
      const { createHash } = await import('node:crypto');
      const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter((key) => key !== 'generatedAt').sort().map((key) => [key, canonical(value[key])])) : value;
      const actualFileSha = createHash('sha256').update(JSON.stringify(canonical(manifest), null, 2)).digest('hex');
      if (actualFileSha !== expectedSha) throw new Error(`IaC manifest checksum mismatch: expected ${expectedSha}, got ${actualFileSha}.`);
    }
    const result = await request('POST', '/api/iac/diff', { manifest });
    if (action === 'check' && result.drift) throw new Error(`IaC drift detected: ${(result.differences || []).join(', ')}`);
    return print(result);
  }
  if (action === 'history') return print(await request('GET', '/api/iac/history'));
  throw new Error('Use iac export, iac diff, iac check, or iac history.');
}

async function command(args) {
  const [group, action, ...rest] = args;
  if (!group || ['help', '--help', '-h'].includes(group)) return help();
  if (group === '--version' || group === 'version') return print(VERSION);
  if (group === 'login') {
    const token = action === '--token' ? rest[0] : flag(args.slice(1), '--token');
    if (!token) throw new Error('Use "brisabase login --token <jwt>"; passwords are never accepted by the CLI.');
    await mkdir(path.dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, JSON.stringify({ token, updatedAt: new Date().toISOString() }), { mode: 0o600 });
    return print({ loggedIn: true });
  }
  if (group === 'logout') { if (await exists(sessionPath)) await unlink(sessionPath).catch(() => undefined); return print({ loggedOut: true }); }
  if (group === 'init') return init([action, ...rest].filter(Boolean));
  if (group === 'dev') return runNpm('dev');
  if (group === 'start') return runNpm('start');
  if (group === 'doctor') { const cfg = await config(false); let health; try { health = await request('GET', '/health', undefined, { configRequired: false }); } catch (error) { health = { status: 'unreachable', reason: error.message }; } return print({ version: VERSION, config: Boolean(cfg.projectId), projectId: cfg.projectId, environmentId: environmentId(cfg), health }); }
  if (group === 'db') return database(action, rest);
  if (group === 'migration') return migration(action, rest);
  if (group === 'functions') return functions(action, rest);
  if (group === 'storage') return storage([action, ...rest]);
  if (group === 'hosting') return hosting(action, rest);
  if (group === 'auth' && action === 'users') { const cfg = await config(); return print(await request('GET', `/api/projects/${encodeURIComponent(cfg.projectId)}/environments/${encodeURIComponent(environmentId(cfg))}/auth/users`)); }
  if (group === 'secrets') {
    if (!action || action === 'list') return print(await request('GET', '/api/functions/secrets/list'));
    if (action === 'set') { if (!rest[0] || rest[1] === undefined) throw new Error('Use secrets set <name> <value>.'); return print(await request('PUT', `/api/functions/secrets/${encodeURIComponent(rest[0])}`, { value: rest[1] })); }
    if (action === 'delete') { if (!rest[0]) throw new Error('Secret name is required.'); await request('DELETE', `/api/functions/secrets/${encodeURIComponent(rest[0])}`); return print({ deleted: rest[0] }); }
  }
  if (group === 'env') {
    if (!action || action === 'list') return print(await request('GET', '/api/functions/environment/list'));
    if (action === 'set') { if (!rest[0] || rest[1] === undefined) throw new Error('Use env set <name> <value>.'); return print(await request('PUT', `/api/functions/environment/${encodeURIComponent(rest[0])}`, { value: rest[1] })); }
  }
  if (group === 'types' && action === 'pull') { const target = path.resolve(rest[0] || defaultTypes); const content = await request('GET', '/api/developer/typescript'); await writeFile(target, String(content), 'utf8'); return print({ generated: target }); }
  if (group === 'openapi' && action === 'pull') { const target = path.resolve(rest[0] || defaultOpenApi); const content = await request('GET', '/api/developer/openapi'); await writeFile(target, `${JSON.stringify(content, null, 2)}\n`, 'utf8'); return print({ generated: target }); }
  if (group === 'iac') return iac(action, rest);
  if (group === 'backup') return backup(action);
  if (group === 'restore') return print(await request('POST', `/api/backups/${encodeURIComponent(action || '')}/restore`, {}));
  if (group === 'logs') return print(await request('GET', '/api/observability/logs'));
  if (group === 'monitor') return print(await request('GET', '/api/observability/overview'));
  return fail(`Unknown command '${group}'. Run brisabase help.`);
}

command(process.argv.slice(2)).catch((error) => fail(error.message || String(error)));
