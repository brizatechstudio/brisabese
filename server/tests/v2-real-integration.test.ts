/*
 * Deliberately opt-in end-to-end validation for a running Docker Compose stack.
 * It never starts an in-memory fallback: missing infrastructure is a failure.
 * Run after `docker compose up -d` with BRISABASE_REAL_E2E=true.
 */
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const enabled = process.env.BRISABASE_REAL_E2E === 'true';
if (!enabled) {
  console.log('V2 real-local E2E skipped. Set BRISABASE_REAL_E2E=true after docker compose up -d.');
  process.exit(0);
}

const apiUrl = process.env.BRISABASE_API_URL || 'http://localhost:3000';
const serviceKey = process.env.BRISABASE_E2E_SERVICE_KEY || 'bb_srv_local_development_only';
const headers = { apikey: serviceKey, 'x-brisabase-service-bypass': 'true', 'content-type': 'application/json' };
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const suffix = Date.now().toString(36);
const table = `v2_real_${suffix}`;
const sqlTable = `sql_editor_${suffix}`;
const migrationTable = `migration_${suffix}`;
const parentTable = `parent_${suffix}`;
const childTable = `child_${suffix}`;
const indexName = `idx_message_${suffix}`;
const functionName = `normalize_message_${suffix}`;
const triggerName = `trg_message_${suffix}`;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, init);
}

async function json(response: Response): Promise<any> {
  const body = await response.text();
  try { return body ? JSON.parse(body) : null; } catch { return body; }
}

async function assertStatus(response: Response, expected: number, message: string): Promise<void> {
  if (response.status !== expected) {
    assert.fail(`${message}: ${JSON.stringify(await json(response))}`);
  }
}

function waitForSocketMessage(socket: WebSocket, predicate: (message: any) => boolean, timeoutMs = 8_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for a real Realtime event.')); }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer); socket.off('message', onMessage); resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function run(): Promise<void> {
  const health = await request('/health');
  await assertStatus(health, 200, 'health endpoint failed');
  const healthJson = await json(health);
  assert.notEqual(healthJson.status, 'unhealthy', `runtime is unavailable: ${JSON.stringify(healthJson)}`);
  for (const service of ['database', 'redis', 'storage', 'mail', 'realtime']) {
    assert.equal(healthJson.details?.[service]?.status, 'healthy', `${service} is not healthy: ${JSON.stringify(healthJson.details?.[service])}`);
  }

  const adminEmail = 'owner@brisabase.local'; const adminPassword = 'SuperSecretSmokePassword123!';
  const bootstrap = await request('/api/admin/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-bootstrap-token': process.env.ADMIN_BOOTSTRAP_TOKEN || 'local-bootstrap-token-for-isolated-e2e-only-2026' }, body: JSON.stringify({ email: adminEmail, password: adminPassword, name: 'Local E2E Owner' }) });
  assert.ok([201, 409].includes(bootstrap.status), `admin bootstrap failed: ${JSON.stringify(await json(bootstrap))}`);
  const login = await request('/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
  await assertStatus(login, 200, 'admin login failed');
  const admin = await json(login);
  const controlHeaders = { authorization: `Bearer ${admin.access_token}`, 'x-organization-id': 'org_local_1', 'x-project-id': projectId, 'x-environment-id': environmentId, 'content-type': 'application/json' };
  await assertStatus(await request('/api/database/overview', { headers }), 403, 'service API key entered the control plane');

  // Database SQL Editor proof against a real PostgreSQL tenant schema.
  const sqlCreate = await request('/api/database/sql/execute', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ query: `CREATE TABLE ${sqlTable} (id text PRIMARY KEY, note text NOT NULL);` }),
  });
  await assertStatus(sqlCreate, 200, 'scoped SQL CREATE TABLE failed');
  const sqlCreateJson = await json(sqlCreate);
  assert.equal(sqlCreateJson.rowCount, 0);
  assert.deepEqual(sqlCreateJson.columns, []);

  const sqlInsert = await request('/api/database/sql/execute', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ query: `INSERT INTO ${sqlTable} (id, note) VALUES ('sql-row', 'created by SQL Editor') RETURNING id, note;` }),
  });
  await assertStatus(sqlInsert, 200, 'scoped SQL INSERT failed');
  const sqlInsertJson = await json(sqlInsert);
  assert.equal(sqlInsertJson.rows?.[0]?.id, 'sql-row');
  assert.deepEqual(sqlInsertJson.columns, ['id', 'note']);

  const sqlSelect = await request('/api/database/sql/execute', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ query: `SELECT id, note FROM ${sqlTable} WHERE id = 'sql-row';` }),
  });
  await assertStatus(sqlSelect, 200, 'scoped SQL SELECT failed');
  const sqlSelectJson = await json(sqlSelect);
  assert.equal(sqlSelectJson.rows?.[0]?.note, 'created by SQL Editor');
  assert.deepEqual(sqlSelectJson.columns, ['id', 'note']);

  const blockedCatalog = await request('/api/database/sql/execute', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ query: 'SELECT * FROM pg_roles;' }),
  });
  await assertStatus(blockedCatalog, 400, 'SQL Editor exposed a PostgreSQL system catalog');

  const sqlDrop = await request('/api/database/sql/execute', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ query: `DROP TABLE ${sqlTable};` }),
  });
  await assertStatus(sqlDrop, 200, 'scoped SQL DROP TABLE failed');

  // Table editor base used by Indexes, Functions, Triggers, REST and Realtime.
  const createdTable = await request('/api/database/tables', { method: 'POST', headers: controlHeaders, body: JSON.stringify({ name: table, columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'message', type: 'text', isNullable: false }] }) });
  await assertStatus(createdTable, 201, 'create table failed');

  // Indexes tab proof.
  const createdIndex = await request('/api/database/indexes', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ name: indexName, tableName: table, columns: ['message'], type: 'btree', isUnique: false }),
  });
  await assertStatus(createdIndex, 201, 'create index failed');
  const indexesResponse = await request('/api/database/indexes', { headers: controlHeaders });
  await assertStatus(indexesResponse, 200, 'list indexes failed');
  const indexes = await json(indexesResponse);
  const persistedIndex = indexes.find((item: any) => item.name === indexName);
  assert.equal(persistedIndex?.tableName, table);
  assert.equal(persistedIndex?.type, 'btree');
  assert.ok(Number(persistedIndex?.sizeKb) >= 0, 'index size must be a real numeric value');

  // Functions + Triggers tabs proof.
  const createdFunction = await request('/api/database/functions', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({
      name: functionName,
      schema: 'public',
      arguments: '',
      returnType: 'trigger',
      language: 'plpgsql',
      definition: 'BEGIN\n  NEW.message = upper(NEW.message);\n  RETURN NEW;\nEND;',
    }),
  });
  await assertStatus(createdFunction, 201, 'create PostgreSQL function failed');
  assert.equal((await json(createdFunction))?.name, functionName);

  const createdTrigger = await request('/api/database/triggers', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ name: triggerName, tableName: table, event: 'UPDATE', timing: 'BEFORE', functionName, enabled: true }),
  });
  await assertStatus(createdTrigger, 201, 'create trigger failed');
  assert.equal((await json(createdTrigger))?.name, triggerName);

  // Relationships tab proof with a real FK in the tenant schema.
  await assertStatus(await request('/api/database/tables', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ name: parentTable, columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }] }),
  }), 201, 'create relationship parent table failed');
  await assertStatus(await request('/api/database/tables', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ name: childTable, columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'parent_id', type: 'text', isNullable: true }] }),
  }), 201, 'create relationship child table failed');
  const createdRelationship = await request('/api/database/relationships', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ fromTable: childTable, fromColumn: 'parent_id', toTable: parentTable, toColumn: 'id', type: 'one-to-many', onDelete: 'CASCADE', onUpdate: 'NO ACTION' }),
  });
  await assertStatus(createdRelationship, 201, 'create foreign-key relationship failed');
  const relationshipsResponse = await request('/api/database/relationships', { headers: controlHeaders });
  await assertStatus(relationshipsResponse, 200, 'list relationships failed');
  const relationships = await json(relationshipsResponse);
  assert.ok(relationships.some((item: any) => item.fromTable === childTable && item.toTable === parentTable), 'created relationship was not introspected back from PostgreSQL');

  // Migrations tab proof. SQL DOWN is persisted; SQL UP is applied immediately.
  const migration = await request('/api/database/migrations', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({
      name: `create_${migrationTable}`,
      sqlUp: `CREATE TABLE ${migrationTable} (id text PRIMARY KEY);`,
      sqlDown: `DROP TABLE ${migrationTable};`,
    }),
  });
  await assertStatus(migration, 201, 'apply migration failed');
  const migrationJson = await json(migration);
  assert.equal(migrationJson.status, 'success');
  const migrationTableResponse = await request(`/api/database/tables/${migrationTable}`, { headers: controlHeaders });
  await assertStatus(migrationTableResponse, 200, 'migration did not create the table');
  const migrationsResponse = await request('/api/database/migrations', { headers: controlHeaders });
  await assertStatus(migrationsResponse, 200, 'list migrations failed');
  assert.ok((await json(migrationsResponse)).some((item: any) => item.id === migrationJson.id), 'migration history did not persist');

  const socket = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/realtime/v1/websocket`);
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const connected = waitForSocketMessage(socket, (message) => message.type === 'connected' && message.payload?.connectionId);
  socket.send(JSON.stringify({ type: 'connect', apiKey: serviceKey }));
  await connected;
  const subscribed = waitForSocketMessage(socket, (message) => message.type === 'subscribed' && message.channel === 'v2-proof');
  socket.send(JSON.stringify({ type: 'subscribe', channel: 'v2-proof', schema: 'public', table, event: '*' }));
  await subscribed;

  const realtimeEventPromise = waitForSocketMessage(socket, (message) => message.type === 'event' && message.table === table && message.payload?.event === 'INSERT');
  const inserted = await request(`/api/database/tables/${table}/rows`, { method: 'POST', headers: controlHeaders, body: JSON.stringify({ id: 'persisted-row', message: 'real PostgreSQL row' }) });
  await assertStatus(inserted, 201, 'insert failed');
  const realtimeEvent = await realtimeEventPromise;
  assert.equal(realtimeEvent.payload.new.id, 'persisted-row', 'Realtime CDC did not send the inserted PostgreSQL row.');

  const updated = await request(`/api/database/tables/${table}/rows/persisted-row`, { method: 'PATCH', headers: controlHeaders, body: JSON.stringify({ message: 'trigger proof' }) });
  await assertStatus(updated, 200, 'update through trigger failed');
  assert.equal((await json(updated))?.message, 'TRIGGER PROOF', 'BEFORE UPDATE trigger function did not run');

  const listed = await request(`/rest/v1/${table}`, { headers });
  await assertStatus(listed, 200, 'REST query failed');
  assert.ok((await json(listed)).some((row: any) => row.id === 'persisted-row' && row.message === 'TRIGGER PROOF'));

  // Clean up the migration proof table through the same scoped SQL engine.
  await assertStatus(await request('/api/database/sql/execute', {
    method: 'POST', headers: controlHeaders,
    body: JSON.stringify({ query: `DROP TABLE ${migrationTable};` }),
  }), 200, 'cleanup migration table failed');

  const bucket = `v2-${suffix}`;
  const createdBucket = await request('/api/storage/buckets', { method: 'POST', headers: controlHeaders, body: JSON.stringify({ name: bucket, versioningEnabled: true }) });
  await assertStatus(createdBucket, 201, 'create bucket failed');
  const uploaded = await request(`/storage/v1/object/${bucket}/proof.txt`, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: 'stored in MinIO' });
  await assertStatus(uploaded, 201, 'upload failed');
  const downloaded = await request(`/storage/v1/object/${bucket}/proof.txt`, { headers });
  await assertStatus(downloaded, 200, 'download failed');
  const downloadedBody = await downloaded.text();
  assert.equal(downloadedBody, 'stored in MinIO');
  socket.close();

  console.log('V2 real-local E2E passed: SQL Editor, Migrations, Relationships, Indexes, PostgreSQL Functions/Triggers, PostgreSQL rows, Redis-gated API, MinIO Storage, real WebSocket CDC, auth scope, REST and health are live.');
}

run().catch((error) => { console.error('V2 real-local E2E failed:', error); process.exit(1); });
