import assert from 'node:assert/strict';

if (process.env.BRISABASE_LOAD_SMOKE !== 'true') {
  console.log('Load smoke skipped. Set BRISABASE_LOAD_SMOKE=true against the isolated Docker stack.');
  process.exit(0);
}

const base = (process.env.BRISABASE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const serviceKey = process.env.BRISABASE_E2E_SERVICE_KEY || 'bb_srv_local_development_only';
const runId = Date.now().toString(36);
const table = `load_${runId}`;
const requests = Number(process.env.BRISABASE_LOAD_REQUESTS || 300);
const concurrency = Number(process.env.BRISABASE_LOAD_CONCURRENCY || 15);
const rounds = Number(process.env.BRISABASE_LOAD_ROUNDS || 2);
const p95BudgetMs = Number(process.env.BRISABASE_LOAD_P95_MS || 2_000);

async function read(res: Response): Promise<any> { const text = await res.text(); try { return text ? JSON.parse(text) : null; } catch { return text; } }
async function expect(res: Response, status: number, label: string): Promise<any> { const value = await read(res); assert.equal(res.status, status, `${label}: ${JSON.stringify(value)}`); return value; }
async function json(path: string, status: number, method = 'GET', value?: unknown, headers: Record<string, string> = {}): Promise<any> {
  return expect(await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) }), status, `${method} ${path}`);
}

async function adminHeaders(): Promise<Record<string, string>> {
  const email = 'owner@brisabase.local';
  const password = 'SuperSecretSmokePassword123!';
  const login = await json('/api/admin/auth/login', 200, 'POST', { email, password });
  return { authorization: `Bearer ${login.access_token}`, 'x-organization-id': 'org_local_1', 'x-project-id': projectId, 'x-environment-id': environmentId };
}

async function run(): Promise<void> {
  assert.ok(Number.isInteger(requests) && requests >= 50 && requests <= 10_000, 'BRISABASE_LOAD_REQUESTS must be between 50 and 10000.');
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 100, 'BRISABASE_LOAD_CONCURRENCY must be between 1 and 100.');
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 10, 'BRISABASE_LOAD_ROUNDS must be between 1 and 10.');
  const control = await adminHeaders();
  await json('/api/database/tables', 201, 'POST', { name: table, columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'value', type: 'integer', isNullable: false }] }, control);
  await json('/api/security/policies', 201, 'POST', { name: `Load smoke ${table}`, resourceType: 'table', resource: table, operation: '*', condition: 'true' }, control);

  const service = { apikey: serviceKey, 'x-project-id': projectId, 'x-environment-id': environmentId, 'x-brisabase-service-bypass': 'true', 'content-type': 'application/json' };
  for (let index = 0; index < 25; index += 1) await json(`/rest/v1/${table}`, 201, 'POST', { id: `seed-${index}`, value: index }, service);

  const latencies: number[] = [];
  const failures: string[] = [];
  let cursor = 0;
  const startedAt = performance.now();
  const worker = async (): Promise<void> => {
    while (true) {
      const current = cursor; cursor += 1;
      if (current >= requests * rounds) return;
      const started = performance.now();
      try {
        const res = await fetch(`${base}/rest/v1/${table}?select=id,value&order=value.desc&limit=25`, { headers: service });
        const value = await read(res);
        if (res.status !== 200 || !Array.isArray(value) || value.length !== 25) failures.push(`#${current}: HTTP ${res.status} ${value?.error?.code || value?.error?.message || ''}`.trim());
      } catch (error) {
        failures.push(`#${current}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        latencies.push(performance.now() - started);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  latencies.sort((left, right) => left - right);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] || 0;
  const elapsed = performance.now() - startedAt;
  assert.deepEqual(failures.slice(0, 10), [], `${failures.length} load requests failed.`);
  assert.ok(p95 <= p95BudgetMs, `p95 ${p95.toFixed(1)}ms exceeded ${p95BudgetMs}ms budget.`);
  await json(`/api/database/tables/${table}?confirm=${encodeURIComponent(table)}`, 200, 'DELETE', undefined, control);
  const totalRequests = requests * rounds;
  console.log(JSON.stringify({ gate: 'load-smoke', requests: totalRequests, rounds, concurrency, failures: failures.length, p50Ms: Number(p50.toFixed(1)), p95Ms: Number(p95.toFixed(1)), durationMs: Number(elapsed.toFixed(1)), requestsPerSecond: Number((totalRequests / (elapsed / 1000)).toFixed(1)) }));
}

run().catch((error) => { console.error('Docker load smoke failed:', error); process.exit(1); });
