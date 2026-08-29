import assert from 'node:assert/strict';
import { parseGraphql, resolveGraphqlValue, GraphqlParseError } from '../graphql/parser';
import { RuntimeRpcRegistry } from '../functions/runtimeRpcRegistry';
import { createClient } from '../../developer/sdk/client';

async function testGraphqlParser() {
  const operations = parseGraphql(`
    query Tasks($limit: Int = 10, $owner: String!) {
      tasks(limit: $limit, where: { owner_id: { eq: $owner } }) {
        id
        title
      }
    }
  `);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].type, 'query');
  assert.equal(operations[0].name, 'Tasks');
  const field = operations[0].selections[0];
  assert.equal(field.name, 'tasks');
  assert.equal(resolveGraphqlValue(field.arguments.limit, { limit: 25, owner: 'usr_1' }), 25);
  assert.deepEqual(resolveGraphqlValue(field.arguments.where, { limit: 25, owner: 'usr_1' }), { owner_id: { eq: 'usr_1' } });

  assert.throws(() => parseGraphql('subscription Events { tasks { id } }'), (error: unknown) => error instanceof GraphqlParseError && /Realtime WebSocket/.test(error.message));
  assert.throws(() => parseGraphql('query Q { a { b { c { d { e { f { g { h { i { id } } } } } } } } } }'), GraphqlParseError);
}

async function testRuntimeRpcCapability() {
  const calls: Array<{ action: string; args: unknown }> = [];
  const registry = new RuntimeRpcRegistry();
  const capability = registry.register({
    async handleRpc(action, args) { calls.push({ action, args }); return { ok: true }; },
    onLog() {},
  }, 5_000);

  const value = await registry.invoke(capability.sessionId, capability.token, 'database.select', { table: 'tasks' });
  assert.deepEqual(value, { ok: true });
  assert.equal(calls.length, 1);

  await assert.rejects(() => registry.invoke(capability.sessionId, 'wrong-token', 'database.select', {}), /capability is invalid/i);
  registry.release(capability.sessionId);
  await assert.rejects(() => registry.invoke(capability.sessionId, capability.token, 'database.select', {}), /invalid or expired/i);
}

async function testSdkPrincipalPrecedence() {
  const requests: Array<{ url: string; headers: Headers; method: string }> = [];
  const fakeFetch: typeof globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers || {});
    requests.push({ url, headers, method: init?.method || 'GET' });

    if (url.endsWith('/api/auth/login')) {
      return new Response(JSON.stringify({
        user: { id: 'usr_1', email: 'user@example.com' },
        session: { access_token: 'jwt-user-token', refresh_token: 'refresh-user-token', expires_in: 900 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/rest/v1/tasks')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const client = createClient({
    url: 'https://brisabase.example',
    projectId: 'proj_test',
    environmentId: 'env_test',
    apiKey: 'bb_pub_public',
    fetch: fakeFetch,
  });

  await client.auth.signIn({ email: 'user@example.com', password: 'not-a-real-password' });
  await client.from('tasks').select('*').get();

  const dataRequest = requests.find((request) => request.url.includes('/rest/v1/tasks'));
  assert.ok(dataRequest);
  assert.equal(dataRequest.headers.get('authorization'), 'Bearer jwt-user-token');
  assert.equal(dataRequest.headers.has('apikey'), false, 'authenticated SDK requests must never send the public API key beside the JWT');
  assert.equal(dataRequest.headers.get('x-project-id'), 'proj_test');
  assert.equal(dataRequest.headers.get('x-environment-id'), 'env_test');
}

async function main() {
  await testGraphqlParser();
  await testRuntimeRpcCapability();
  await testSdkPrincipalPrecedence();
  console.log('✅ Platform completion contracts passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
