import assert from 'node:assert/strict';
import { BrisaBaseClient } from '../../../src/sdk/brisaBaseClient.ts';
import { WebSocket } from 'ws';

// BrisaBaseRealtimeChannel targets the browser WebSocket interface. `ws`
// supplies the same interface here without contacting Docker internals.
(globalThis as any).WebSocket = WebSocket;

const base = (process.env.BRISABASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const projectId = process.env.BRISABASE_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_ENVIRONMENT_ID || 'env_proj_local_1_development';
const serviceKey = process.env.BRISABASE_E2E_SERVICE_KEY;
const password = process.env.BRISABASE_E2E_TEST_PASSWORD;
const productsTable = process.env.BRISABASE_PRODUCTS_TABLE || 'external_products';
const realtimeTable = process.env.BRISABASE_REALTIME_TABLE || 'external_realtime_events';
const bucket = process.env.BRISABASE_STORAGE_BUCKET || 'external-real-app';
const functionSlug = process.env.BRISABASE_FUNCTION_SLUG || 'external-hello-world';

if (!serviceKey || !password) throw new Error('BRISABASE_E2E_SERVICE_KEY and BRISABASE_E2E_TEST_PASSWORD are required. They are test-runner variables, never browser variables.');
const e2ePassword: string = password;

const serviceHeaders = {
  apikey: serviceKey,
  'x-brisabase-service-bypass': 'true',
  'x-project-id': projectId,
  'x-environment-id': environmentId,
  'content-type': 'application/json',
};

async function response(path: string, init: RequestInit = {}): Promise<{ response: Response; body: any }> {
  const result = await fetch(`${base}${path}`, init);
  const text = await result.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response: result, body };
}
async function request(path: string, init: RequestInit = {}, expected = 200): Promise<any> {
  const result = await response(path, init);
  assert.equal(result.response.status, expected, `${init.method || 'GET'} ${path}: ${JSON.stringify(result.body)}`);
  return result.body;
}
async function management(path: string, method: string, body?: unknown, expected = 200): Promise<any> {
  return request(path, { method, headers: serviceHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, expected);
}
async function ensureTable(name: string, columns: Array<Record<string, unknown>>): Promise<void> {
  const tables = await management('/api/database/tables', 'GET');
  if (!tables.some((table: any) => table.name === name)) await management('/api/database/tables', 'POST', { name, columns }, 201);
}
async function ensurePolicy(name: string, resource: string, operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE', condition: string, resourceType: 'table' | 'storage' = 'table'): Promise<void> {
  const policies = await management(`/api/security/policies?resourceType=${resourceType}&resource=${encodeURIComponent(resource)}`, 'GET');
  if (!policies.some((policy: any) => policy.name === name)) await management('/api/security/policies', 'POST', { name, resourceType, resource, operation, condition }, 201);
}
async function ensureBucket(): Promise<void> {
  const buckets = await management('/api/storage/buckets', 'GET');
  if (!buckets.some((item: any) => item.name === bucket)) await management('/api/storage/buckets', 'POST', { name: bucket, versioningEnabled: true }, 201);
}
async function ensureFunction(): Promise<void> {
  const functions = await management('/api/functions', 'GET');
  let current = functions.find((item: any) => item.slug === functionSlug);
  const code = 'export default async (req, ctx) => ({ status: 200, body: { message: "Hello BrisaBase", name: req.body?.name || null } });';
  if (!current) current = await management('/api/functions', 'POST', {
    name: 'External hello world', slug: functionSlug, access: 'authenticated',
    code,
  }, 201);
  else await management(`/api/functions/${current.id}`, 'PATCH', { code, access: 'authenticated', changeSummary: 'External client contract fixture' }, 201);
  await management(`/api/functions/${current.id}/deploy`, 'POST', {});
}
async function sessionFor(email: string): Promise<{ client: BrisaBaseClient; user: any; session: any }> {
  const initial = new BrisaBaseClient({ url: base, projectId, environmentId });
  try { await initial.auth.signUp({ email, password: e2ePassword, displayName: email.split('@')[0] }); } catch (error) {
    if (!/already exists/i.test(error instanceof Error ? error.message : '')) throw error;
  }
  const signedIn = await initial.auth.signInWithPassword(email, e2ePassword);
  const refreshed = await initial.auth.refreshSession(signedIn.session.refresh_token);
  const client = new BrisaBaseClient({ url: base, projectId, environmentId, accessToken: refreshed.access_token });
  const user = await client.auth.getUser();
  return { client, user, session: refreshed };
}
function eventFrom(client: BrisaBaseClient, table: string, id: string, operation: 'INSERT' | 'UPDATE' | 'DELETE'): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for public SDK Realtime event.')), 12_000);
    const channel = client.channel('external-real-app-e2e').on('postgres_changes', { event: '*', schema: 'public', table }, async (event) => {
      if (event.event !== operation || (event.new?.id !== id && event.old?.id !== id)) return;
      clearTimeout(timer); await channel.unsubscribe(); resolve(event);
    });
    try { await channel.subscribe(); } catch (error) { clearTimeout(timer); reject(error); }
  });
}

async function run(): Promise<void> {
  const health = await request('/health');
  assert.equal(health.status, 'healthy', 'The external client only runs against a healthy BrisaBase.');

  // Bootstrap is a separately executed privileged client. It uses public HTTP
  // control-plane routes, never a database/Redis/MinIO connection, and leaves
  // no service credential in the Vite app.
  await ensureTable(productsTable, [
    { name: 'id', type: 'text', isPrimaryKey: true, isNullable: false },
    { name: 'owner_id', type: 'text', isNullable: false },
    { name: 'name', type: 'text', isNullable: false },
    { name: 'price', type: 'numeric', isNullable: false },
    { name: 'archived_at', type: 'text', isNullable: true },
    { name: 'created_at', type: 'text', isNullable: false },
    { name: 'updated_at', type: 'text', isNullable: false },
  ]);
  await ensureTable(realtimeTable, [
    { name: 'id', type: 'text', isPrimaryKey: true, isNullable: false },
    { name: 'owner_id', type: 'text', isNullable: false },
    { name: 'message', type: 'text', isNullable: false },
    { name: 'created_at', type: 'text', isNullable: false },
  ]);
  for (const [operation, condition] of [
    ['SELECT', 'row.owner_id = auth.uid()'], ['INSERT', 'new.owner_id = auth.uid()'],
    ['UPDATE', 'row.owner_id = auth.uid() and new.owner_id = auth.uid()'], ['DELETE', 'row.owner_id = auth.uid()'],
  ] as const) await ensurePolicy(`external products ${operation.toLowerCase()} own`, productsTable, operation, condition);
  for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const) await ensurePolicy(`external realtime ${operation.toLowerCase()} shared`, realtimeTable, operation, 'true');
  await ensureBucket();
  for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const) await ensurePolicy(`external storage ${operation.toLowerCase()} own prefix`, `${bucket}/*`, operation, 'context.path starts_with auth.uid()', 'storage');
  await ensureFunction();

  const a = await sessionFor('external.client.a@brisabase.local');
  const b = await sessionFor('external.client.b@brisabase.local');
  await a.client.auth.requestPasswordReset(a.user.email);
  const duplicate = await response('/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.user.email, password, project_id: projectId, environment_id: environmentId }) });
  assert.equal(duplicate.response.status, 409, 'Duplicate signup must surface a real 409.');

  const runId = Date.now().toString(36);
  const now = new Date().toISOString();
  const first = { id: `external-${runId}-one`, owner_id: a.user.id, name: `alpha ${runId}`, price: 10, archived_at: null, created_at: now, updated_at: now };
  const second = { id: `external-${runId}-two`, owner_id: a.user.id, name: `beta ${runId}`, price: 20, archived_at: null, created_at: now, updated_at: now };
  assert.equal((await a.client.from(productsTable).insert([first, second])).error, null, 'SDK insert must use the real REST API.');
  assert.equal((await a.client.from(productsTable).select('*').eq('id', first.id).get()).data?.[0]?.id, first.id);
  assert.equal((await a.client.from(productsTable).select('*').neq('id', first.id).get()).data?.some((row: any) => row.id === second.id), true);
  assert.equal((await a.client.from(productsTable).select('*').gt('price', 15).get()).data?.some((row: any) => row.id === second.id), true);
  assert.equal((await a.client.from(productsTable).select('*').gte('price', 20).get()).data?.some((row: any) => row.id === second.id), true);
  assert.equal((await a.client.from(productsTable).select('*').lt('price', 15).get()).data?.some((row: any) => row.id === first.id), true);
  assert.equal((await a.client.from(productsTable).select('*').lte('price', 10).get()).data?.some((row: any) => row.id === first.id), true);
  assert.equal((await a.client.from(productsTable).select('*').ilike('name', `%${runId}%`).get()).data?.some((row: any) => row.id === first.id), true);
  assert.equal((await a.client.from(productsTable).select('*').in('id', [first.id, second.id]).order('price').limit(1).offset(1).get()).data?.[0]?.id, second.id);
  const directHeaders = { authorization: `Bearer ${a.session.access_token}` };
  assert.equal((await request(`/rest/v1/${productsTable}?name=like.%25${runId}%25`, { headers: directHeaders })).some((row: any) => row.id === first.id), true, 'Public REST like filter failed.');
  assert.equal((await request(`/rest/v1/${productsTable}?archived_at=is.null`, { headers: directHeaders })).some((row: any) => row.id === first.id), true, 'Public REST is filter failed.');
  assert.equal((await a.client.from(productsTable).update({ name: `alpha updated ${runId}`, updated_at: new Date().toISOString() }, first.id)).error, null, 'SDK update failed.');
  assert.equal((await a.client.from(productsTable).delete(second.id)).error, null, 'SDK delete failed.');
  const bRows = await b.client.from(productsTable).select('*').get();
  assert.equal(bRows.data?.some((row: any) => row.id === first.id), false, 'RLS leaked user A data to user B.');
  const denied = await b.client.from(productsTable).insert({ id: `forbidden-${runId}`, owner_id: a.user.id, name: 'forbidden', price: 1, created_at: now, updated_at: now });
  assert.ok(denied.error, 'User B inserting a user A row must be denied (403).');
  const missing = await response(`/rest/v1/${productsTable}/not-found-${runId}`, { headers: directHeaders });
  assert.equal(missing.response.status, 404, 'Missing record must produce a real 404.');

  const storagePath = `${a.user.id}/proof-${runId}.txt`;
  const uploaded = await a.client.storage.from(bucket).upload(storagePath, 'external client storage proof', { metadata: { source: 'external-e2e' } });
  assert.equal(uploaded.error, null, `SDK storage upload failed: ${JSON.stringify(uploaded.error)}`);
  assert.equal((uploaded.data as any)?.storageKey, undefined, 'Internal MinIO storageKey leaked to client.');
  const listed = await a.client.storage.from(bucket).list(`${a.user.id}/`);
  assert.equal(listed.error, null); assert.ok(listed.data?.some((item: any) => item.path === storagePath));
  const downloaded = await a.client.storage.from(bucket).download(storagePath);
  assert.equal(downloaded.error, null); assert.equal(await downloaded.data?.text(), 'external client storage proof');
  const signed = await a.client.storage.from(bucket).createSignedUrl(storagePath, 60);
  assert.equal(signed.error, null); assert.ok((signed.data as any)?.signedUrl.includes('/storage/v1/object/sign/'));
  const crossUserStorage = await b.client.storage.from(bucket).download(storagePath);
  assert.ok(crossUserStorage.error, 'Storage RLS leaked user A data to user B.');
  assert.equal((await a.client.storage.from(bucket).remove([storagePath])).error, null, 'SDK storage delete failed.');
  assert.equal((await a.client.storage.from(bucket).restore(storagePath)).error, null, 'SDK storage restore failed.');

  // Realtime uses a deliberately shared, policy-approved table. Private
  // products stay behind their RLS policy while two independent user clients
  // receive an INSERT event through the public SDK/WebSocket contract.
  const realtimeId = `realtime-${runId}`;
  const realtime = eventFrom(b.client, realtimeTable, realtimeId, 'INSERT');
  assert.equal((await a.client.from(realtimeTable).insert({ id: realtimeId, owner_id: a.user.id, message: 'from client A', created_at: new Date().toISOString() })).error, null);
  assert.equal((await realtime).new.id, realtimeId, 'Client B did not receive the real INSERT event.');
  const updatedEvent = eventFrom(b.client, realtimeTable, realtimeId, 'UPDATE');
  assert.equal((await a.client.from(realtimeTable).update({ message: 'updated by client A' }, realtimeId)).error, null);
  assert.equal((await updatedEvent).new.message, 'updated by client A', 'Client B did not receive the real UPDATE event.');
  const deletedEvent = eventFrom(b.client, realtimeTable, realtimeId, 'DELETE');
  assert.equal((await a.client.from(realtimeTable).delete(realtimeId)).error, null);
  assert.equal((await deletedEvent).old.id, realtimeId, 'Client B did not receive the real DELETE event.');

  const functionResult = await a.client.functions.invoke(functionSlug, { name: 'BrisaBase' });
  assert.deepEqual(functionResult, { message: 'Hello BrisaBase', name: 'BrisaBase' }, 'Public Function invocation returned an unexpected result.');

  const unauthenticated = await response('/api/auth/user');
  assert.equal(unauthenticated.response.status, 401, 'Unauthenticated request must return 401.');
  // Exercise the Redis-backed public API limiter without changing data. Keep
  // this last because the shared local rate window is intentionally exhausted.
  // The gateway builds its Redis limiter key before resolving the JWT scope.
  // A unique header makes this destructive-to-the-window check isolated from
  // the normal client traffic used by the restart verification.
  const rateHeaders = { ...directHeaders, 'x-project-id': `rate-proof-${runId}` };
  const rateResponses = await Promise.all(Array.from({ length: 120 }, () => response(`/rest/v1/${productsTable}?limit=1`, { headers: rateHeaders })));
  assert.equal(rateResponses.some((result) => result.response.status === 429), true, 'Public API rate limit did not return 429.');

  await a.client.auth.signOut();
  await assert.rejects(() => a.client.auth.getUser(), /session|token|invalid/i, 'Logout must revoke the real session.');
  console.log('External client E2E passed: public SDK/API Auth, JWT refresh/logout, CRUD/RLS, filters, Storage/RLS, Realtime, Function, and real 401/403/404/409/429 responses.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
