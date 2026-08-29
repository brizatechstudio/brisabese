import { test, expect } from '@playwright/test';
import { WebSocket } from 'ws';
import { ensureReleaseScope } from './helpers/releaseAdmin';

const API_URL = process.env.ADMIN_UI_URL || 'http://localhost:3000';
const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const table = `realtime_scope_${runId}`;

function waitForSocketMessage(socket: WebSocket, predicate: (message: any) => boolean, timeoutMs = 10_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for a Realtime message.'));
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

async function responsePayload(response: Response): Promise<any> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function createManagedUser(
  email: string,
  password: string,
  projectId: string,
  environmentId: string,
  headers: Record<string, string>,
): Promise<any> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/environments/${environmentId}/auth/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_verified: true, role: 'user' }),
  });
  const data = await responsePayload(res);
  expect(res.status, `Managed test-user creation failed: ${JSON.stringify(data)}`).toBe(201);
  return data;
}

async function loginUser(email: string, password: string, projectId: string, environmentId: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, project_id: projectId, environment_id: environmentId }),
  });
  const data = await responsePayload(res);
  expect(res.status, `Project-user login failed: ${JSON.stringify(data)}`).toBe(200);
  return data;
}

async function createRealtimeScope(accessToken: string, organizationId: string) {
  const organizationHeaders = {
    authorization: `Bearer ${accessToken}`,
    'x-organization-id': organizationId,
    'content-type': 'application/json',
  };
  const projectResponse = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: organizationHeaders,
    body: JSON.stringify({ organization_id: organizationId, name: `Realtime Scope ${runId}`, region: 'us-east-1' }),
  });
  const project = await responsePayload(projectResponse);
  expect(projectResponse.status, `Realtime project creation failed: ${JSON.stringify(project)}`).toBe(201);
  const projectId = String(project.id);

  const environmentsResponse = await fetch(`${API_URL}/api/projects/${projectId}/environments`, {
    headers: { ...organizationHeaders, 'x-project-id': projectId },
  });
  const environments = await responsePayload(environmentsResponse);
  const environmentId = String(Array.isArray(environments) ? environments[0]?.id || '' : '');
  expect(environmentsResponse.status, `Realtime environment lookup failed: ${JSON.stringify(environments)}`).toBe(200);
  expect(environmentId).toBeTruthy();

  const keyResponse = await fetch(`${API_URL}/api/projects/${projectId}/api-keys`, {
    method: 'POST',
    headers: { ...organizationHeaders, 'x-project-id': projectId, 'x-environment-id': environmentId },
    body: JSON.stringify({ name: `realtime-e2e-${runId}`, type: 'service', environment_id: environmentId }),
  });
  const key = await responsePayload(keyResponse);
  expect(keyResponse.status, `Realtime service-key creation failed: ${JSON.stringify(key)}`).toBe(201);
  expect(key?.fullSecretKey).toBeTruthy();
  return { organizationHeaders, projectId, environmentId, serviceKey: String(key.fullSecretKey) };
}

type RealtimeScope = Awaited<ReturnType<typeof createRealtimeScope>>;
let activeScope: RealtimeScope | null = null;
let activeSocketA: WebSocket | null = null;
let activeSocketB: WebSocket | null = null;

test.describe('Realtime Authentication and Scope E2E', () => {
  test.afterEach(async () => {
    activeSocketA?.close();
    activeSocketB?.close();
    activeSocketA = null;
    activeSocketB = null;
    if (!activeScope) return;

    const adminProjectHeaders = {
      ...activeScope.organizationHeaders,
      'x-project-id': activeScope.projectId,
      'x-environment-id': activeScope.environmentId,
    };
    const encodedTable = encodeURIComponent(table);
    const tableCleanup = await fetch(`${API_URL}/api/database/tables/${encodedTable}?confirm=${encodedTable}`, {
      method: 'DELETE',
      headers: adminProjectHeaders,
    });
    const tableCleanupBody = await responsePayload(tableCleanup);
    expect([200, 404], `Realtime table cleanup failed: ${JSON.stringify(tableCleanupBody)}`).toContain(tableCleanup.status);
    const projectCleanup = await fetch(`${API_URL}/api/projects/${activeScope.projectId}`, {
      method: 'DELETE',
      headers: { ...activeScope.organizationHeaders, 'x-project-id': activeScope.projectId },
    });
    expect([204, 404]).toContain(projectCleanup.status);
    activeScope = null;
  });

  test('User A cannot access User B protected channels', async () => {
    const { session, scope: releaseScope } = await ensureReleaseScope(API_URL);
    const scope = await createRealtimeScope(session.access_token, releaseScope.organizationId);
    activeScope = scope;
    const adminProjectHeaders = {
      ...scope.organizationHeaders,
      'x-project-id': scope.projectId,
      'x-environment-id': scope.environmentId,
      'content-type': 'application/json',
    };
    const password = `Realtime-E2E-${runId}-Password!`;
    const userAEmail = `alice.${runId}@brisabase.local`;
    const userBEmail = `bob.${runId}@brisabase.local`;

    // Provision deterministic fixtures through the management API. Public
    // signup rate limits remain fully active and are not consumed by this test.
    await createManagedUser(userAEmail, password, scope.projectId, scope.environmentId, adminProjectHeaders);
    await createManagedUser(userBEmail, password, scope.projectId, scope.environmentId, adminProjectHeaders);
    const loginA = await loginUser(userAEmail, password, scope.projectId, scope.environmentId);
    const loginB = await loginUser(userBEmail, password, scope.projectId, scope.environmentId);
    const accessA = loginA.session.access_token as string;
    const accessB = loginB.session.access_token as string;

    // Create a table for the test
    const serviceHeaders = {
      apikey: scope.serviceKey,
      'x-brisabase-service-bypass': 'true',
      'x-project-id': scope.projectId,
      'x-environment-id': scope.environmentId,
      'content-type': 'application/json',
    };
    const createTable = await fetch(`${API_URL}/api/database/tables`, {
      method: 'POST',
      headers: adminProjectHeaders,
      body: JSON.stringify({
        name: table,
        columns: [
          { name: 'id', type: 'text', isPrimaryKey: true, isNullable: false },
          { name: 'owner_id', type: 'text', isNullable: false },
          { name: 'message', type: 'text', isNullable: false },
        ],
      }),
    });
    expect(createTable.status).toBe(201);

    // Add RLS policies
    for (const [operation, condition] of [
      ['SELECT', 'row.owner_id = auth.uid()'],
      ['INSERT', 'new.owner_id = auth.uid()'],
      ['UPDATE', 'row.owner_id = auth.uid() and new.owner_id = auth.uid()'],
      ['DELETE', 'row.owner_id = auth.uid()'],
    ]) {
      const policy = await fetch(`${API_URL}/api/security/policies`, {
        method: 'POST',
        headers: adminProjectHeaders,
        body: JSON.stringify({
          name: `${operation.toLowerCase()} own ${table}`,
          resourceType: 'table',
          resource: table,
          operation,
          condition,
        }),
      });
      expect(policy.status).toBe(201);
    }

    // User A connects with their JWT
    const socketA = activeSocketA = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/realtime/v1/websocket`);
    await new Promise<void>((resolve, reject) => { socketA.once('open', resolve); socketA.once('error', reject); });
    const connectedA = waitForSocketMessage(socketA, (message) => message.type === 'connected' && message.payload?.connectionId);
    socketA.send(JSON.stringify({ type: 'connect', token: accessA }));
    await connectedA;

    // User B connects with their JWT
    const socketB = activeSocketB = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/realtime/v1/websocket`);
    await new Promise<void>((resolve, reject) => { socketB.once('open', resolve); socketB.once('error', reject); });
    const connectedB = waitForSocketMessage(socketB, (message) => message.type === 'connected' && message.payload?.connectionId);
    socketB.send(JSON.stringify({ type: 'connect', token: accessB }));
    await connectedB;

    // User A subscribes to the table
    const subscribedA = waitForSocketMessage(socketA, (message) => message.type === 'subscribed' && message.channel === 'scope-proof');
    socketA.send(JSON.stringify({ type: 'subscribe', channel: 'scope-proof', schema: 'public', table, event: '*' }));
    await subscribedA;

    // User B subscribes to the table
    const subscribedB = waitForSocketMessage(socketB, (message) => message.type === 'subscribed' && message.channel === 'scope-proof');
    socketB.send(JSON.stringify({ type: 'subscribe', channel: 'scope-proof', schema: 'public', table, event: '*' }));
    await subscribedB;

    // Insert a row owned by User A
    const insertA = waitForSocketMessage(socketA, (message) => message.type === 'event' && message.table === table && message.payload?.event === 'INSERT');
    const insertB = waitForSocketMessage(socketB, (message) => message.type === 'event' && message.table === table && message.payload?.event === 'INSERT');
    const inserted = await fetch(`${API_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ id: 'alice-row', owner_id: loginA.user.id, message: 'private alice data' }),
    });
    expect(inserted.status).toBe(201);

    // User A should receive the INSERT event
    const eventA = await insertA;
    expect(eventA.payload.new.id).toBe('alice-row');

    // User B should NOT receive the INSERT event (RLS blocks it)
    let receivedByB = false;
    try {
      await Promise.race([
        insertB.then(() => { receivedByB = true; }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3_000)),
      ]);
    } catch {
      // Expected: User B should not receive User A's private data
    }
    expect(receivedByB).toBe(false);

  });
});
