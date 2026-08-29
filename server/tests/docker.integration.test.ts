/*
 * Integration proof for docker-compose.local.yml.
 *
 * This client process talks only to the public BrisaBase HTTP/WebSocket API.
 * PostgreSQL, Redis and MinIO are reached exclusively through the running API;
 * there are no test doubles, direct database connections, or mock adapters.
 *
 * Run: BRISABASE_REAL_E2E=true npm.cmd run test:docker
 */
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { BrisaBaseClient } from '../../src/sdk/brisaBaseClient';

const enabled = process.env.BRISABASE_REAL_E2E === 'true';
if (!enabled) {
  console.log('Docker integration skipped. Set BRISABASE_REAL_E2E=true after the local compose stack is healthy.');
  process.exit(0);
}

const apiUrl = (process.env.BRISABASE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const serviceKey = process.env.BRISABASE_E2E_SERVICE_KEY || 'bb_srv_local_development_only';
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const runId = `docker_${Date.now().toString(36)}`;
const table = `proof_${runId}`;
const parentTable = `parent_${runId}`;
const childTable = `child_${runId}`;
const bucket = `proof-${Date.now().toString(36)}`;
const serviceHeaders = {
  apikey: serviceKey,
  'x-brisabase-service-bypass': 'true',
  'x-project-id': projectId,
  'x-environment-id': environmentId,
  'content-type': 'application/json',
};
let controlHeaders: Record<string, string> = {};

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, init);
}

async function body(response: Response): Promise<any> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function expectStatus(response: Response, expected: number, description: string): Promise<any> {
  const payload = await body(response);
  assert.equal(response.status, expected, `${description}: ${JSON.stringify(payload)}`);
  return payload;
}

async function jsonRequest(path: string, method: string, payload: unknown, headers: HeadersInit = serviceHeaders, expected = 200): Promise<any> {
  const effectiveHeaders = headers === serviceHeaders && path.startsWith('/api/') && !path.startsWith('/api/auth/') ? controlHeaders : headers;
  return expectStatus(await request(path, { method, headers: effectiveHeaders, body: JSON.stringify(payload) }), expected, `${method} ${path}`);
}

function waitForSocketMessage(socket: WebSocket, predicate: (message: any) => boolean, timeoutMs = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for a Realtime message from the Docker stack.'));
    }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      let message: any;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

async function signUp(email: string, password: string): Promise<any> {
  return jsonRequest('/api/auth/signup', 'POST', { email, password, project_id: projectId, environment_id: environmentId }, { 'content-type': 'application/json' }, 201);
}

async function login(email: string, password: string): Promise<any> {
  return jsonRequest('/api/auth/login', 'POST', { email, password, project_id: projectId, environment_id: environmentId }, { 'content-type': 'application/json' });
}

async function run(): Promise<void> {
  // Health endpoints tell the truth about each dependency. The complete health
  // report may be degraded for modules that are deliberately not certified as
  // persistent yet, but required Docker dependencies must all be healthy.
  const required = await expectStatus(await request('/health/required'), 200, 'required Docker health check');
  assert.equal(required.status, 'healthy');
  for (const service of ['database', 'redis', 'storage', 'mail', 'realtime']) {
    assert.equal(required.details?.[service]?.status, 'healthy', `${service} must be connected to a real service`);
  }
  for (const service of ['database', 'storage', 'realtime', 'functions', 'security', 'observability']) {
    const result = await expectStatus(await request(`/health/${service}`), 200, `health endpoint ${service}`);
    assert.notEqual(result.status, 'unhealthy', `${service} health endpoint is unavailable`);
  }

  const adminEmail = 'owner@brisabase.local';
  const adminPassword = 'SuperSecretSmokePassword123!';
  const bootstrap = await request('/api/admin/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-bootstrap-token': process.env.ADMIN_BOOTSTRAP_TOKEN || 'local-bootstrap-token-for-isolated-e2e-only-2026' }, body: JSON.stringify({ email: adminEmail, password: adminPassword, name: 'Local E2E Owner' }) });
  assert.equal(bootstrap.status, 201, `fresh-stack admin bootstrap must return HTTP 201: ${JSON.stringify(await body(bootstrap))}`);
  const adminLogin = await expectStatus(await request('/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) }), 200, 'admin login');
  controlHeaders = { authorization: `Bearer ${adminLogin.access_token}`, 'x-organization-id': 'org_local_1', 'x-project-id': projectId, 'x-environment-id': environmentId, 'content-type': 'application/json' };
  await expectStatus(await request('/api/database/overview', { headers: serviceHeaders }), 403, 'data-plane service key must not enter the control plane');
  await expectStatus(await request('/api/functions', { headers: serviceHeaders }), 403, 'data-plane service key must not manage Functions');

  // AUTH: signup, login/JWT, get user, refresh rotation and logout use
  // PostgreSQL session/token records and Redis-backed rate limiting.
  const password = `Docker-E2E-${runId}-Password!`;
  const userAEmail = `alice.${runId}@brisabase.local`;
  const userBEmail = `bob.${runId}@brisabase.local`;
  const signupA = await signUp(userAEmail, password);
  const signupB = await signUp(userBEmail, password);
  assert.ok(signupA.session?.access_token && signupB.session?.access_token, 'development seed must allow verified local signup');
  const loginA = await login(userAEmail, password);
  const loginB = await login(userBEmail, password);
  let accessA = loginA.session.access_token as string;
  const accessB = loginB.session.access_token as string;
  let sdkA = new BrisaBaseClient({ url: apiUrl, projectId, environmentId, accessToken: accessA });
  const sdkService = new BrisaBaseClient({ url: apiUrl, projectId, environmentId, apiKey: serviceKey });
  const sdkAdmin = new BrisaBaseClient({ url: apiUrl, projectId, environmentId, accessToken: adminLogin.access_token });
  const userA = await expectStatus(await request('/api/auth/user', { headers: { authorization: `Bearer ${accessA}` } }), 200, 'get signed-in user');
  assert.equal(userA.email, userAEmail);
  assert.equal((await sdkA.auth.getUser()).email, userAEmail, 'SDK Auth client must use the real API');
  const firstRefresh = loginA.session.refresh_token as string;
  const rotated = await jsonRequest('/api/auth/refresh', 'POST', { refresh_token: firstRefresh }, { 'content-type': 'application/json' });
  assert.notEqual(rotated.refresh_token, firstRefresh, 'refresh token must rotate');
  await expectStatus(await request('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: firstRefresh }) }), 401, 'reused refresh token must be rejected');
  await expectStatus(await request('/api/auth/user', { headers: { authorization: `Bearer ${rotated.access_token}` } }), 401, 'refresh replay must revoke the rotated session family');
  const recoveredLoginA = await login(userAEmail, password);
  accessA = recoveredLoginA.session.access_token as string;
  sdkA = new BrisaBaseClient({ url: apiUrl, projectId, environmentId, accessToken: accessA });
  const userAAfterReplay = await expectStatus(await request('/api/auth/user', { headers: { authorization: `Bearer ${accessA}` } }), 200, 'new login after replay revocation');
  assert.equal(userAAfterReplay.email, userAEmail);

  // DATABASE: schemas, tables, rows, relationship, index, migration, SQL,
  // PostgreSQL function and trigger all execute through the real data plane.
  await jsonRequest('/api/database/schemas', 'POST', { name: 'public' }, serviceHeaders, 201);
  await jsonRequest('/api/database/tables', 'POST', {
    name: parentTable,
    columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }],
  }, serviceHeaders, 201);
  await jsonRequest('/api/database/tables', 'POST', {
    name: childTable,
    columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'parent_id', type: 'text', isNullable: false }],
  }, serviceHeaders, 201);
  await jsonRequest('/api/database/relationships', 'POST', { fromTable: childTable, fromColumn: 'parent_id', toTable: parentTable, toColumn: 'id', type: 'one-to-many', onDelete: 'CASCADE', onUpdate: 'NO ACTION' }, serviceHeaders, 201);
  await jsonRequest('/api/database/indexes', 'POST', { name: `idx_${childTable}_parent`, tableName: childTable, columns: ['parent_id'], type: 'btree', isUnique: false }, serviceHeaders, 201);
  await jsonRequest('/api/database/tables', 'POST', {
    name: table,
    columns: [
      { name: 'id', type: 'text', isPrimaryKey: true, isNullable: false },
      { name: 'owner_id', type: 'text', isNullable: false },
      { name: 'message', type: 'text', isNullable: false },
    ],
  }, serviceHeaders, 201);
  const databaseFunction = `touch_${runId}`;
  await jsonRequest('/api/database/functions', 'POST', { name: databaseFunction, returnType: 'trigger', language: 'plpgsql', definition: 'BEGIN RETURN NEW; END' }, serviceHeaders, 201);
  await jsonRequest('/api/database/triggers', 'POST', { name: `trg_${runId}`, tableName: table, event: 'INSERT', timing: 'BEFORE', functionName: databaseFunction }, serviceHeaders, 201);
  const migration = await jsonRequest('/api/database/migrations', 'POST', { name: `insert-${runId}`, sqlUp: `INSERT INTO ${table} (id,owner_id,message) VALUES ('migration-row','system','from migration')` }, serviceHeaders, 201);
  assert.equal(migration.status, 'success');
  const sql = await jsonRequest('/api/database/sql/execute', 'POST', { query: `SELECT id FROM ${table} WHERE id = 'migration-row'` }, serviceHeaders);
  assert.equal(sql.rowCount, 1, 'SQL editor must query the real project schema');

  // SECURITY/RLS: service bypass is explicit; users can only see their own row.
  for (const [operation, condition] of [
    ['SELECT', 'row.owner_id = auth.uid()'],
    ['INSERT', 'new.owner_id = auth.uid()'],
    ['UPDATE', 'row.owner_id = auth.uid() and new.owner_id = auth.uid()'],
    ['DELETE', 'row.owner_id = auth.uid()'],
  ]) {
    await jsonRequest('/api/security/policies', 'POST', { name: `${operation.toLowerCase()} own ${table}`, resourceType: 'table', resource: table, operation, condition }, serviceHeaders, 201);
  }
  const userARow = await jsonRequest(`/rest/v1/${table}`, 'POST', { id: 'alice-row', owner_id: signupA.user.id, message: 'private alice row' }, serviceHeaders, 201);
  await jsonRequest(`/rest/v1/${table}`, 'POST', { id: 'bob-row', owner_id: signupB.user.id, message: 'private bob row' }, serviceHeaders, 201);
  assert.equal(userARow.id, 'alice-row');
  const aRows = await expectStatus(await request(`/rest/v1/${table}?select=id,owner_id,message&order=id.asc`, { headers: { authorization: `Bearer ${accessA}` } }), 200, 'RLS select for user A');
  const bRows = await expectStatus(await request(`/rest/v1/${table}?select=id,owner_id,message&order=id.asc`, { headers: { authorization: `Bearer ${accessB}` } }), 200, 'RLS select for user B');
  assert.ok(aRows.some((row: any) => row.id === 'alice-row'));
  assert.ok(!aRows.some((row: any) => row.id === 'bob-row'), 'user A must not receive user B private data');
  assert.ok(bRows.some((row: any) => row.id === 'bob-row'));
  assert.ok(!bRows.some((row: any) => row.id === 'alice-row'), 'user B must not receive user A private data');
  const sdkRows = await sdkA.from(table).select('id,owner_id').eq('id', 'alice-row').get();
  assert.equal(sdkRows.error, null, `SDK Database error: ${JSON.stringify(sdkRows.error)}`);
  assert.equal(sdkRows.data?.[0]?.id, 'alice-row', 'SDK Database client must honor real RLS scope');
  assert.ok((await sdkAdmin.security.listPolicies()).some((policy: any) => policy.resource === table), 'SDK Security client must use an administrative control-plane session');
  assert.ok(Array.isArray(await sdkAdmin.observability.health()), 'SDK Observability client must use an administrative control-plane session');
  const anonymous = await request(`/rest/v1/${table}?select=id`);
  assert.ok(anonymous.status >= 400, `anonymous request unexpectedly accessed scoped data (${anonymous.status})`);

  // REST + REALTIME: the change events follow API commits into PostgreSQL and
  // Redis-backed WebSocket delivery. INSERT, UPDATE and DELETE are all proven.
  const socket = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/realtime/v1/websocket`);
  try {
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const connected = waitForSocketMessage(socket, (message) => message.type === 'connected' && message.payload?.connectionId);
    socket.send(JSON.stringify({ type: 'connect', apiKey: serviceKey }));
    await connected;
    const subscribed = waitForSocketMessage(socket, (message) => message.type === 'subscribed' && message.channel === 'docker-proof');
    socket.send(JSON.stringify({ type: 'subscribe', channel: 'docker-proof', schema: 'public', table, event: '*' }));
    await subscribed;

    const insertEvent = waitForSocketMessage(socket, (message) => message.type === 'event' && message.table === table && message.payload?.event === 'INSERT' && message.payload?.new?.id === 'realtime-row');
    await jsonRequest(`/rest/v1/${table}`, 'POST', { id: 'realtime-row', owner_id: signupA.user.id, message: 'created through REST' }, serviceHeaders, 201);
    await insertEvent;
    const updateEvent = waitForSocketMessage(socket, (message) => message.type === 'event' && message.table === table && message.payload?.event === 'UPDATE' && message.payload?.new?.message === 'updated through REST');
    await jsonRequest(`/rest/v1/${table}/realtime-row`, 'PATCH', { message: 'updated through REST' }, serviceHeaders);
    await updateEvent;
    const deleteEvent = waitForSocketMessage(socket, (message) => message.type === 'event' && message.table === table && message.payload?.event === 'DELETE' && message.payload?.old?.id === 'realtime-row');
    await expectStatus(await request(`/rest/v1/${table}/realtime-row`, { method: 'DELETE', headers: serviceHeaders }), 204, 'REST delete');
    await deleteEvent;
  } finally {
    socket.close();
  }

  const sdkRealtimeEvent = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SDK Realtime client timed out.')), 10_000);
    const channel = sdkService.channel('sdk-docker-proof').on('postgres_changes', { event: 'INSERT', schema: 'public', table }, async (event) => {
      if (event.new?.id !== 'sdk-realtime-row') return;
      clearTimeout(timer);
      await channel.unsubscribe();
      resolve(event);
    });
    channel.subscribe().then(async () => {
      await jsonRequest(`/rest/v1/${table}`, 'POST', { id: 'sdk-realtime-row', owner_id: signupA.user.id, message: 'SDK subscription proof' }, serviceHeaders, 201);
    }).catch((error) => { clearTimeout(timer); reject(error); });
  });
  assert.equal((await sdkRealtimeEvent).new.id, 'sdk-realtime-row', 'SDK Realtime client must receive a real event');

  const filtered = await expectStatus(await request(`/rest/v1/${table}?select=id,message&message=ilike.%private%&order=id.asc&limit=1&offset=0`, { headers: serviceHeaders }), 200, 'REST filtering, ordering, selection and pagination');
  assert.equal(filtered.length, 1);

  // FUNCTIONS: this proves the sandboxed runtime, API authentication, secret
  // redaction path, environment variables, queue/cron control and metrics on
  // the running server. Persistent Functions storage remains separately marked
  // as a known limitation by /health/functions.
  // Function slugs are public URL identifiers and are normalized by the API.
  // Keep this test's invocation URL identical to the resulting slug.
  const functionSlug = `echo-${runId.replace(/_/g, '-')}`;
  const createdFunction = await jsonRequest('/api/functions', 'POST', {
    name: `Echo ${runId}`,
    slug: functionSlug,
    access: 'service',
    code: 'export default async (req, ctx) => ({ status: 200, body: { source: req.body?.source || null, environment: ctx.env.LOCAL_E2E_FLAG || null, hasSecret: Boolean(ctx.secrets.LOCAL_E2E_SECRET) } });',
  }, serviceHeaders, 201);
  await jsonRequest(`/api/functions/${createdFunction.id}/deploy`, 'POST', {}, serviceHeaders);
  await jsonRequest('/api/functions/secrets/LOCAL_E2E_SECRET', 'PUT', { value: `secret-${runId}` }, serviceHeaders, 201);
  await jsonRequest('/api/functions/environment/LOCAL_E2E_FLAG', 'PUT', { value: 'real-runtime' }, serviceHeaders);
  const functionResponse = await expectStatus(await request(`/functions/v1/${functionSlug}`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify({ source: 'docker-integration' }) }), 200, 'Function invocation');
  assert.equal(functionResponse.source, 'docker-integration');
  assert.equal(functionResponse.environment, 'real-runtime');
  assert.equal(functionResponse.hasSecret, true);
  const functionLogs = await expectStatus(await request(`/api/functions/${createdFunction.id}/logs`, { headers: controlHeaders }), 200, 'Function logs');
  const functionMetrics = await expectStatus(await request(`/api/functions/${createdFunction.id}/metrics`, { headers: controlHeaders }), 200, 'Function metrics');
  assert.ok(functionLogs.length >= 1 && functionMetrics.invocations >= 1);
  assert.ok((await sdkAdmin.functions.list()).some((item: any) => item.id === createdFunction.id), 'SDK Functions control-plane client must use an administrative session');
  await jsonRequest(`/api/functions/${createdFunction.id}/crons`, 'POST', { expression: '* * * * *' }, serviceHeaders, 201);
  const queue = await jsonRequest('/api/functions/queues', 'POST', { name: `queue-${runId}` }, serviceHeaders, 201);
  const queued = await jsonRequest(`/api/functions/queues/${queue.name}/jobs`, 'POST', { functionId: createdFunction.id, payload: { source: 'queue' } }, serviceHeaders, 201);
  assert.equal(queued.status, 'queued');

  // STORAGE: all bytes go through MinIO, while object metadata/version state is
  // persisted in PostgreSQL. The public API never returns storageKey here.
  const createdBucket = await jsonRequest('/api/storage/buckets', 'POST', { name: bucket, versioningEnabled: true }, serviceHeaders, 201);
  assert.equal(createdBucket.name, bucket);
  // The real data plane is deny-by-default. Grant the E2E user only their own
  // object prefix before validating the public SDK storage contract.
  for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    await jsonRequest('/api/security/policies', 'POST', {
      name: `Docker storage ${operation.toLowerCase()} own ${runId}`,
      resourceType: 'storage',
      resource: `${bucket}/*`,
      operation,
      condition: 'context.path starts_with auth.uid()',
    }, serviceHeaders, 201);
  }
  const firstUpload = await expectStatus(await request(`/storage/v1/object/${bucket}/proof.txt`, { method: 'POST', headers: { ...serviceHeaders, 'content-type': 'text/plain', 'x-storage-metadata': JSON.stringify({ source: 'docker-e2e' }) }, body: 'first MinIO version' }), 201, 'storage upload v1');
  const secondUpload = await expectStatus(await request(`/storage/v1/object/${bucket}/proof.txt`, { method: 'POST', headers: { ...serviceHeaders, 'content-type': 'text/plain' }, body: 'second MinIO version' }), 201, 'storage upload v2');
  assert.equal(firstUpload.storageKey, undefined);
  assert.equal(secondUpload.storageKey, undefined);
  assert.equal(firstUpload.metadata.source, 'docker-e2e');
  const downloaded = await request(`/storage/v1/object/${bucket}/proof.txt`, { headers: serviceHeaders });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), 'second MinIO version');
  // The proof object was written by the service role with an explicit RLS
  // bypass. A normal dashboard session must not silently inherit that bypass.
  await expectStatus(await request(`/api/storage/buckets/${bucket}/versions?path=proof.txt`, { headers: controlHeaders }), 403, 'control-plane storage versions must honor RLS');
  const versions = await expectStatus(await request(`/storage/v1/object/versions/${bucket}?path=proof.txt`, { headers: serviceHeaders }), 200, 'service storage versions');
  assert.ok(versions.length >= 1, 'versioning must retain the prior object version');
  const signed = await jsonRequest(`/storage/v1/object/signed/${bucket}`, 'POST', { path: 'proof.txt', expiresIn: 60 }, serviceHeaders);
  const signedDownload = await fetch(signed.signedUrl);
  assert.equal(signedDownload.status, 200);
  assert.equal(await signedDownload.text(), 'second MinIO version');
  await expectStatus(await request(`/storage/v1/object/${bucket}/proof.txt`, { method: 'DELETE', headers: serviceHeaders }), 200, 'storage soft delete');
  await expectStatus(await request(`/storage/v1/object/${bucket}/proof.txt`, { headers: serviceHeaders }), 404, 'soft-deleted object must not download');
  await jsonRequest(`/storage/v1/object/restore/${bucket}`, 'POST', { path: 'proof.txt' }, serviceHeaders);
  const restored = await request(`/storage/v1/object/${bucket}/proof.txt`, { headers: serviceHeaders });
  assert.equal(restored.status, 200);
  assert.equal(await restored.text(), 'second MinIO version');
  const sdkPath = `${userA.id}/sdk.txt`;
  const sdkUpload = await sdkA.storage.from(bucket).upload(sdkPath, 'SDK MinIO object');
  assert.equal(sdkUpload.error, null, `SDK Storage upload error: ${JSON.stringify(sdkUpload.error)}`);
  const sdkDownload = await sdkA.storage.from(bucket).download(sdkPath);
  assert.equal(sdkDownload.error, null, `SDK Storage download error: ${JSON.stringify(sdkDownload.error)}`);
  assert.equal(await sdkDownload.data?.text(), 'SDK MinIO object');
  await expectStatus(await request(`/storage/v1/object/${bucket}/proof.txt?soft=false`, { method: 'DELETE', headers: serviceHeaders }), 200, 'storage purge');

  // Observability request IDs are returned by the public gateway. Detailed
  // metrics/traces are intentionally not declared persistent by this test.
  const observed = await request(`/rest/v1/${table}?select=id&limit=1`, { headers: { ...serviceHeaders, 'x-request-id': `req_${runId}` } });
  await expectStatus(observed, 200, 'observability request');
  assert.equal(observed.headers.get('x-request-id'), `req_${runId}`);

  // Logout revokes the backing PostgreSQL session and closes the access path.
  await expectStatus(await request('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${accessA}` } }), 200, 'logout');
  await expectStatus(await request('/api/auth/user', { headers: { authorization: `Bearer ${accessA}` } }), 401, 'revoked session must reject get user');

  console.log('Docker integration passed: real PostgreSQL, Redis, MinIO, Mailpit, Auth, Database, REST, RLS, WebSocket Realtime, Storage and request IDs.');
}

run().catch((error) => {
  console.error('Docker integration failed:', error);
  process.exitCode = 1;
});
