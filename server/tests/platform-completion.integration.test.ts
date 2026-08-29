/*
 * Real-stack acceptance for the platform-completion modules.
 *
 * This test intentionally talks only to the running BrisaBase HTTP API.
 * It does not import database/storage engines or use direct PostgreSQL/MinIO
 * connections. The goal is to prove the same contracts an application/admin
 * panel will use after deployment.
 */
import assert from 'node:assert/strict';
import { createClient } from '../../developer/sdk/client';

const enabled = process.env.BRISABASE_REAL_E2E === 'true';
if (!enabled) {
  console.log('Platform completion real-stack test skipped. Set BRISABASE_REAL_E2E=true.');
  process.exit(0);
}

const apiUrl = (process.env.BRISABASE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const organizationId = process.env.BRISABASE_E2E_ORGANIZATION_ID || 'org_local_1';
const serviceKey = process.env.BRISABASE_E2E_SERVICE_KEY || 'bb_srv_local_development_only';
const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN || 'local-bootstrap-token-for-isolated-e2e-only-2026';
const adminEmail = 'owner@brisabase.local';
const adminPassword = 'SuperSecretSmokePassword123!';
const runId = `platform_${Date.now().toString(36)}`;
const table = `pc_${runId}`;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiUrl}${path}`, init);
}

async function payload(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function expectStatus(response: Response, expected: number, description: string): Promise<any> {
  const value = await payload(response);
  assert.equal(response.status, expected, `${description}: HTTP ${response.status} ${JSON.stringify(value)}`);
  return value;
}

async function adminLogin(): Promise<any> {
  const login = async () => request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });

  let response = await login();
  if (response.status === 200) return payload(response);
  await payload(response);

  const bootstrap = await request('/api/admin/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-bootstrap-token': bootstrapToken },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, name: 'Platform Completion Owner' }),
  });
  if (![201, 409].includes(bootstrap.status)) {
    throw new Error(`Admin bootstrap failed: HTTP ${bootstrap.status} ${JSON.stringify(await payload(bootstrap))}`);
  }
  await payload(bootstrap);
  response = await login();
  return expectStatus(response, 200, 'admin login');
}

async function main(): Promise<void> {
  const admin = await adminLogin();
  const controlHeaders: Record<string, string> = {
    authorization: `Bearer ${admin.access_token}`,
    'x-organization-id': organizationId,
    'x-project-id': projectId,
    'x-environment-id': environmentId,
    'content-type': 'application/json',
  };
  const serviceHeaders: Record<string, string> = {
    apikey: serviceKey,
    'x-brisabase-service-bypass': 'true',
    'x-project-id': projectId,
    'x-environment-id': environmentId,
    'content-type': 'application/json',
  };

  const userEmail = `${runId}@brisabase.local`;
  const password = `Platform-${runId}-Password!`;
  const signup = await expectStatus(await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password, project_id: projectId, environment_id: environmentId }),
  }), 201, 'platform user signup');
  assert.ok(signup.user?.id && signup.session?.access_token, 'signup must issue a development session');

  const accessToken = signup.session.access_token as string;
  const refreshToken = signup.session.refresh_token as string | undefined;
  const userId = signup.user.id as string;
  const client = createClient({
    url: apiUrl,
    projectId,
    environmentId,
    session: { accessToken, refreshToken },
  });

  let previewId: string | undefined;
  let previewEnvironmentId: string | undefined;
  let siteId: string | undefined;
  let deviceId: string | undefined;
  let functionId: string | undefined;

  try {
    // Dedicated table + own-row RLS used by REST, GraphQL and Preview DB proofs.
    await expectStatus(await request('/api/database/tables', {
      method: 'POST', headers: controlHeaders, body: JSON.stringify({
        name: table,
        columns: [
          { name: 'id', type: 'text', isPrimaryKey: true, isNullable: false },
          { name: 'owner_id', type: 'text', isNullable: false },
          { name: 'message', type: 'text', isNullable: false },
        ],
      }),
    }), 201, 'create platform acceptance table');

    for (const [operation, condition] of [
      ['SELECT', 'row.owner_id = auth.uid()'],
      ['INSERT', 'new.owner_id = auth.uid()'],
      ['UPDATE', 'row.owner_id = auth.uid() and new.owner_id = auth.uid()'],
      ['DELETE', 'row.owner_id = auth.uid()'],
    ]) {
      await expectStatus(await request('/api/security/policies', {
        method: 'POST', headers: controlHeaders, body: JSON.stringify({
          name: `${operation.toLowerCase()} platform ${table}`,
          resourceType: 'table', resource: table, operation, condition,
        }),
      }), 201, `create ${operation} RLS policy`);
    }

    await expectStatus(await request(`/rest/v1/${table}`, {
      method: 'POST', headers: serviceHeaders,
      body: JSON.stringify({ id: 'service-row', owner_id: 'another-user', message: 'must stay hidden' }),
    }), 201, 'seed row outside user RLS scope');

    // GraphQL mutations and reads execute through the same real PostgreSQL/RLS
    // path as REST. The official SDK is used here to prove its live contract.
    const inserted = await client.graphql.query<any>(`
      mutation Insert($object: JSON!) {
        insert_${table}(object: $object) { id owner_id message }
      }
    `, { object: { id: 'graphql-row', owner_id: userId, message: 'created by graphql' } }, 'Insert');
    assert.equal(inserted.errors, undefined, `GraphQL insert failed: ${JSON.stringify(inserted.errors)}`);
    assert.equal(inserted.data?.[`insert_${table}`]?.id, 'graphql-row');

    const selected = await client.graphql.query<any>(`
      query ReadMine {
        ${table}(orderBy: { field: "id", direction: "ASC" }) { id owner_id message }
      }
    `, undefined, 'ReadMine');
    assert.equal(selected.errors, undefined, `GraphQL query failed: ${JSON.stringify(selected.errors)}`);
    const visible = selected.data?.[table] || [];
    assert.ok(visible.some((row: any) => row.id === 'graphql-row'), 'GraphQL must return the user-owned row');
    assert.ok(!visible.some((row: any) => row.id === 'service-row'), 'GraphQL must enforce SELECT RLS');

    const updated = await client.graphql.query<any>(`
      mutation Update($id: ID!, $patch: JSON!) {
        update_${table}(id: $id, patch: $patch) { id message }
      }
    `, { id: 'graphql-row', patch: { message: 'updated by graphql' } }, 'Update');
    assert.equal(updated.errors, undefined, `GraphQL update failed: ${JSON.stringify(updated.errors)}`);
    assert.equal(updated.data?.[`update_${table}`]?.message, 'updated by graphql');

    const sdkRows = await client.from<any>(table).select('id,owner_id,message').eq('id', 'graphql-row').get();
    assert.equal(sdkRows.length, 1, 'official SDK must query the live REST data plane');
    assert.equal(sdkRows[0].message, 'updated by graphql');

    // Preview DB clones a real project schema, rows and policies into a new
    // environment. Verify the cloned table and row through the control-plane DB
    // API using the preview environment scope, then delete the preview schema.
    const preview = await expectStatus(await request('/api/previews', {
      method: 'POST', headers: controlHeaders,
      body: JSON.stringify({ branchName: `accept-${runId}`, sourceEnvironmentId: environmentId, includeData: true, ttlHours: 1 }),
    }), 201, 'create Preview DB');
    previewId = preview.id;
    previewEnvironmentId = preview.previewEnvironmentId;
    assert.equal(preview.status, 'ready');
    assert.ok(previewEnvironmentId);

    const previewHeaders = { ...controlHeaders, 'x-environment-id': previewEnvironmentId! };
    const previewTables = await expectStatus(await request('/api/database/tables', { headers: previewHeaders }), 200, 'list Preview DB tables');
    assert.ok(previewTables.some((item: any) => item.name === table), 'Preview DB must clone source table definitions');
    const previewSql = await expectStatus(await request('/api/database/sql/execute', {
      method: 'POST', headers: previewHeaders,
      body: JSON.stringify({ query: `SELECT id,message FROM ${table} WHERE id = 'graphql-row'` }),
    }), 200, 'query cloned Preview DB data');
    assert.equal(previewSql.rowCount, 1, 'Preview DB includeData=true must clone source records');

    // Hosting stores the deployment in the real S3-compatible backend and then
    // serves the activated file through the public Hosting data plane.
    const site = await expectStatus(await request('/api/hosting/sites', {
      method: 'POST', headers: controlHeaders,
      body: JSON.stringify({ name: `Acceptance ${runId}`, slug: `accept-${runId}` }),
    }), 201, 'create Hosting site');
    siteId = site.id;
    const html = `<!doctype html><html><body>BrisaBase Hosting ${runId}</body></html>`;
    const deployment = await expectStatus(await request(`/api/hosting/sites/${siteId}/deployments`, {
      method: 'POST', headers: controlHeaders,
      body: JSON.stringify({ files: [{ path: 'index.html', contentBase64: Buffer.from(html).toString('base64'), mimeType: 'text/html' }] }),
    }), 201, 'deploy Hosting site');
    assert.equal(deployment.status, 'active');
    const hosted = await request(`/hosting/v1/${projectId}/${environmentId}/${site.slug}/index.html`);
    assert.equal(hosted.status, 200, `public Hosting file returned HTTP ${hosted.status}`);
    assert.equal(await hosted.text(), html, 'Hosting public plane must stream the activated S3 artifact');

    // Functions: create a version, deploy it, invoke the live runtime and prove
    // that runtime console/log output is persisted back into function logs.
    const fn = await expectStatus(await request('/api/functions', {
      method: 'POST', headers: controlHeaders,
      body: JSON.stringify({
        name: `Acceptance ${runId}`,
        slug: `accept-${runId}`,
        access: 'authenticated',
        code: `export default async (req, ctx) => { ctx.logger.info('platform-e2e-log'); return { status: 200, body: { ok: true, value: req.body?.value ?? null } }; };`,
      }),
    }), 201, 'create Function');
    functionId = fn.id;
    await expectStatus(await request(`/api/functions/${functionId}/deploy`, {
      method: 'POST', headers: controlHeaders, body: JSON.stringify({ version: fn.currentVersion || 1 }),
    }), 200, 'deploy Function');
    const invocation = await expectStatus(await request(`/api/functions/${functionId}/invoke`, {
      method: 'POST', headers: controlHeaders, body: JSON.stringify({ body: { value: runId } }),
    }), 200, 'invoke Function');
    assert.equal(invocation.ok, true);
    assert.equal(invocation.value, runId);
    const logs = await expectStatus(await request(`/api/functions/${functionId}/logs`, { headers: controlHeaders }), 200, 'read Function logs');
    assert.ok(logs.some((entry: any) => String(entry.message || '').includes('platform-e2e-log')), 'Function runtime logs must return to the control plane');

    // Messaging works without an FCM account for device persistence and queued
    // message management. Provider delivery must fail closed until credentials
    // are deliberately supplied during the external acceptance step.
    const device = await client.messaging.registerDevice({
      token: `platform-e2e-device-token-${runId}-000000000000000000000000`,
      platform: 'web', locale: 'pt-BR', timezone: 'America/Sao_Paulo',
      metadata: { source: 'platform-completion-e2e' },
    }) as any;
    deviceId = device.id;
    assert.ok(deviceId, 'Messaging device registration must persist a device');
    const devices = await expectStatus(await request('/api/messaging/devices', { headers: controlHeaders }), 200, 'list Messaging devices');
    assert.ok(devices.some((item: any) => item.id === deviceId));
    const messagingStatus = await expectStatus(await request('/api/messaging/status', { headers: controlHeaders }), 200, 'Messaging provider status');
    assert.equal(messagingStatus.provider, 'fcm');
    assert.equal(messagingStatus.configured, false, 'local real-stack intentionally has no external FCM credential');

    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const message = await expectStatus(await request('/api/messaging/messages', {
      method: 'POST', headers: controlHeaders,
      body: JSON.stringify({ title: 'Acceptance', body: 'BrisaBase platform completion', audience: { userId }, scheduledAt }),
    }), 201, 'queue Messaging push');
    assert.equal(message.status, 'queued');
    await expectStatus(await request(`/api/messaging/messages/${message.id}`, { method: 'DELETE', headers: controlHeaders }), 204, 'cancel queued Messaging push');

    const schema = await client.graphql.schema();
    assert.ok(schema.includes(`type ${table}`), 'GraphQL schema endpoint must expose the live project table');

    console.log('✅ Platform completion real-stack E2E passed: GraphQL/RLS, official SDK, Preview DB clone, Hosting/S3, Functions/runtime logs, and Messaging persistence.');
  } finally {
    if (deviceId) {
      try { await client.messaging.removeDevice(deviceId); } catch { /* best-effort acceptance cleanup */ }
    }
    if (siteId) {
      try { await request(`/api/hosting/sites/${siteId}`, { method: 'DELETE', headers: controlHeaders }); } catch { /* best-effort acceptance cleanup */ }
    }
    if (previewId) {
      try { await request(`/api/previews/${previewId}`, { method: 'DELETE', headers: controlHeaders }); } catch { /* best-effort acceptance cleanup */ }
    }
    if (functionId) {
      try { await request(`/api/functions/${functionId}`, { method: 'DELETE', headers: controlHeaders }); } catch { /* best-effort acceptance cleanup */ }
    }
    try { await request(`/api/database/tables/${table}`, { method: 'DELETE', headers: controlHeaders }); } catch { /* best-effort acceptance cleanup */ }
  }
}

main().catch((error) => {
  console.error('Platform completion real-stack E2E failed:', error);
  process.exitCode = 1;
});
