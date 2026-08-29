/*
 * Durable local-stack proof. It talks only to BrisaBase's public API, then
 * restarts the BrisaBase container and proves Function/telemetry state was
 * retained by PostgreSQL (Redis is used only as the operational queue wakeup).
 *
 * Run: BRISABASE_REAL_RESTART_E2E=true npm.cmd run test:docker:restart
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

if (process.env.BRISABASE_REAL_RESTART_E2E !== 'true') {
  console.log('Docker restart persistence test skipped. Set BRISABASE_REAL_RESTART_E2E=true after the local stack is healthy.');
  process.exit(0);
}

const api = (process.env.BRISABASE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const run = `restart-${Date.now().toString(36)}`;
const serviceHeaders = { apikey: process.env.BRISABASE_E2E_SERVICE_KEY || 'bb_srv_local_development_only', 'x-brisabase-service-bypass': 'true', 'x-project-id': projectId, 'x-environment-id': environmentId, 'content-type': 'application/json' };
let controlHeaders: Record<string, string> = {};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function response(path: string, init: RequestInit = {}): Promise<Response> { return fetch(`${api}${path}`, init); }
async function body(res: Response): Promise<any> { const raw = await res.text(); try { return raw ? JSON.parse(raw) : null; } catch { return raw; } }
async function json(path: string, method: string, value?: unknown, headers: HeadersInit = serviceHeaders, expected = 200): Promise<any> { const effectiveHeaders = headers === serviceHeaders && path.startsWith('/api/') && !path.startsWith('/api/auth/') ? controlHeaders : headers; const res = await response(path, { method, headers: effectiveHeaders, ...(value === undefined ? {} : { body: JSON.stringify(value) }) }); const result = await body(res); assert.equal(res.status, expected, `${method} ${path}: ${JSON.stringify(result)}`); return result; }
async function waitFor(path: string, predicate: (value: any) => boolean, timeoutMs = 35_000, headers?: HeadersInit): Promise<any> { const deadline = Date.now() + timeoutMs; let last: any; const effectiveHeaders = headers === serviceHeaders && path.startsWith('/api/') ? controlHeaders : headers; while (Date.now() < deadline) { try { const res = await response(path, effectiveHeaders ? { headers: effectiveHeaders } : {}); last = await body(res); if (res.ok && predicate(last)) return last; } catch { /* service is expected to be unavailable while restarting */ } await sleep(500); } throw new Error(`Timed out waiting for ${path}: ${JSON.stringify(last)}`); }

async function runTest(): Promise<void> {
  const health = await json('/health', 'GET', undefined, undefined, 200); assert.equal(health.status, 'healthy');
  const adminEmail = 'owner@brisabase.local'; const adminPassword = 'SuperSecretSmokePassword123!';
  const loginResponse = await response('/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
  const login = await body(loginResponse); assert.equal(loginResponse.status, 200, `admin login failed: ${JSON.stringify(login)}`);
  controlHeaders = { authorization: `Bearer ${login.access_token}`, 'x-organization-id': 'org_local_1', 'x-project-id': projectId, 'x-environment-id': environmentId, 'content-type': 'application/json' };
  assert.equal((await response('/api/database/overview', { headers: serviceHeaders })).status, 403, 'service API key must not enter the control plane');
  const requestId = `restart-proof-${run}`;
  const backupTable = `backup_restart_${run.replace(/-/g, '_')}`;
  await json('/api/database/tables', 'POST', { name: backupTable, columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'value', type: 'text', isNullable: false }] }, serviceHeaders, 201);
  await json('/api/security/policies', 'POST', { name: `Restart table ${backupTable}`, resourceType: 'table', resource: backupTable, operation: '*', condition: 'true' }, serviceHeaders, 201);
  await json(`/api/database/tables/${backupTable}/rows`, 'POST', { id: 'restart-proof', value: 'before-restart' }, serviceHeaders, 201);
  const backup = await json('/api/backups', 'POST', { type: 'full', components: ['database'] }, serviceHeaders, 201);
  assert.equal(backup.encryption, 'aes-256-gcm');
  assert.equal((await json(`/api/backups/${backup.id}/verify`, 'GET', undefined, serviceHeaders)).valid, true, 'MinIO-backed backup artifact must verify before restart');
  const alertRule = await json('/api/observability/alerts', 'POST', { name: `Invocation alert ${run}`, metric: 'functions.invocations', operator: '>=', threshold: 1, severity: 'warning', channels: ['webhook'], enabled: true }, serviceHeaders, 201);
  const created = await json('/api/functions', 'POST', { name: `Restart ${run}`, slug: run, access: 'service', code: 'export default async (req, ctx) => ({ status: 200, body: { version: 1, persisted: ctx.env.RESTART_FLAG, secret: Boolean(ctx.secrets.RESTART_SECRET) } });' }, serviceHeaders, 201);
  await json(`/api/functions/${created.id}/deploy`, 'POST', {});
  const second = await json(`/api/functions/${created.id}`, 'PATCH', { code: 'export default async () => ({ status: 200, body: { version: 2 } });', changeSummary: 'restart persistence proof' }, serviceHeaders, 201);
  await json(`/api/functions/${created.id}/deploy`, 'POST', { version: second.version });
  await json(`/api/functions/${created.id}/rollback`, 'POST', { version: 1 });
  await json('/api/functions/secrets/RESTART_SECRET', 'PUT', { value: `secret-${run}` }, serviceHeaders, 201);
  await json('/api/functions/environment/RESTART_FLAG', 'PUT', { value: 'stored-in-postgresql' }, serviceHeaders);
  await json(`/api/functions/${created.id}/crons`, 'POST', { expression: '*/5 * * * *' }, serviceHeaders, 201);
  const queue = await json('/api/functions/queues', 'POST', { name: `restart-${run}` }, serviceHeaders, 201);
  const delayed = await json(`/api/functions/queues/${queue.name}/jobs`, 'POST', { functionId: created.id, payload: { source: 'restart' }, options: { delayMs: 15_000, maxAttempts: 3 } }, serviceHeaders, 201);
  const failing = await json('/api/functions', 'POST', { name: `DLQ ${run}`, slug: `dlq-${run}`, access: 'service', code: "export default async () => { throw new Error('persistent queue retry proof'); };" }, serviceHeaders, 201);
  await json(`/api/functions/${failing.id}/deploy`, 'POST', {});
  const deadLetter = await json(`/api/functions/queues/${queue.name}/jobs`, 'POST', { functionId: failing.id, payload: { source: 'dlq' }, options: { maxAttempts: 2 } }, serviceHeaders, 201);
  const timeout = await json('/api/functions', 'POST', { name: `Timeout ${run}`, slug: `timeout-${run}`, access: 'service', limits: { timeoutMs: 5000 }, code: 'export default async () => await new Promise(() => {});' }, serviceHeaders, 201);
  await json(`/api/functions/${timeout.id}/deploy`, 'POST', {});
  await json(`/functions/v1/timeout-${run}`, 'POST', {}, serviceHeaders, 504);
  const invocation = await json(`/functions/v1/${run}`, 'POST', { source: 'persistence' }, { ...serviceHeaders, 'x-request-id': requestId });
  assert.equal(invocation.persisted, 'stored-in-postgresql'); assert.equal(invocation.secret, true);
  await sleep(500);

  execFileSync('docker', ['compose', '-f', 'docker-compose.local.yml', 'restart', 'brisabase'], { cwd: process.cwd(), stdio: 'inherit' });
  const restoredHealth = await waitFor('/health', (value) => value?.status === 'healthy');
  assert.equal(restoredHealth.details.functions.status, 'healthy'); assert.equal(restoredHealth.details.observability.status, 'healthy');

  const backupsAfterRestart = await json('/api/backups', 'GET', undefined, serviceHeaders);
  assert.ok(backupsAfterRestart.some((item: any) => item.id === backup.id), 'backup catalog must be read from persistent PostgreSQL after restart');
  assert.equal((await json(`/api/backups/${backup.id}/verify`, 'GET', undefined, serviceHeaders)).valid, true, 'MinIO-backed backup artifact must remain available after restart');
  await json(`/api/database/tables/${backupTable}/rows/restart-proof`, 'PATCH', { value: 'after-restart' }, serviceHeaders);
  await json(`/api/backups/${backup.id}/restore`, 'POST', { confirm: true }, serviceHeaders);
  const restoredBackupRows = await json(`/api/database/tables/${backupTable}/rows`, 'GET', undefined, serviceHeaders);
  assert.equal(restoredBackupRows.rows.find((row: any) => row.id === 'restart-proof')?.value, 'before-restart', 'pg_restore must recover the persisted row after restart');

  const restored = await json(`/api/functions/${created.id}`, 'GET');
  assert.equal(restored.currentVersion, 1, 'deployed rollback must survive restart');
  assert.ok(restored.versions.some((item: any) => item.version === 1) && restored.versions.some((item: any) => item.version === 2), 'Function versions must survive restart');
  const crons = await json(`/api/functions/${created.id}/crons`, 'GET'); assert.ok(crons.length >= 1, 'cron schedule must survive restart');
  const secretList = await json('/api/functions/secrets/list', 'GET'); assert.ok(secretList.some((item: any) => item.name === 'RESTART_SECRET') && secretList.every((item: any) => !('encryptedValue' in item)), 'encrypted secrets must persist without being exposed');
  const variables = await json('/api/functions/environment/list', 'GET'); assert.equal(variables.RESTART_FLAG, 'stored-in-postgresql');
  const logs = await json(`/api/functions/${created.id}/logs`, 'GET'); assert.ok(logs.length >= 1, 'execution logs must survive restart');
  const metrics = await json(`/api/functions/${created.id}/metrics`, 'GET'); assert.ok(metrics.invocations >= 1, 'execution metrics must survive restart');
  const completed = await waitFor(`/api/functions/queues/${queue.name}/jobs`, (items) => Array.isArray(items) && items.some((item) => item.id === delayed.id && item.status === 'completed') && items.some((item) => item.id === deadLetter.id && item.status === 'dead_letter'), 35_000, serviceHeaders);
  assert.ok(completed.some((item: any) => item.id === delayed.id && item.status === 'completed'), 'persistent delayed job must be processed after restart');
  assert.ok(completed.some((item: any) => item.id === deadLetter.id && item.status === 'dead_letter' && item.attempts === 2), 'persistent queue must retry with backoff and preserve its dead-letter state');
  const traces = await waitFor(`/api/observability/traces?requestId=${encodeURIComponent(requestId)}`, (items) => Array.isArray(items) && items.length > 0, 35_000, serviceHeaders);
  assert.ok(traces[0].spans.length > 0, 'trace must survive restart');
  const telemetry = await waitFor('/api/observability/metrics?name=functions.invocations', (value) => Array.isArray(value?.points) && value.points.length > 0, 35_000, serviceHeaders);
  assert.ok(telemetry.points.some((item: any) => item.name === 'functions.invocations'), 'metric must survive restart');
  const persistentAlerts = await json('/api/observability/alerts', 'GET', undefined, serviceHeaders);
  assert.ok(persistentAlerts.rules.some((item: any) => item.id === alertRule.id), 'alert rule must survive restart');
  assert.ok(persistentAlerts.events.some((item: any) => item.ruleId === alertRule.id), 'alert event must survive restart');
  // Retention needs an aged record; seed only that synthetic telemetry row in
  // PostgreSQL, invoke the public retention API, then verify it was deleted.
  const retentionId = `met_retention_${Date.now().toString(36)}`;
  execFileSync('docker', ['compose', '-f', 'docker-compose.local.yml', 'exec', '-T', 'postgres', 'psql', '-U', 'brisabase', '-d', 'brisabase', '-v', 'ON_ERROR_STOP=1', '-c', `INSERT INTO observability_metrics(id,name,value,kind,labels,timestamp) VALUES('${retentionId}','retention.test',1,'counter','{}',now() - interval '2 days');`], { cwd: process.cwd(), stdio: 'inherit' });
  await json('/api/observability/retention', 'PATCH', { logsDays: 30, metricsDays: 1, tracesDays: 7, alertsDays: 90, maxEntries: 10_000 });
  const remaining = execFileSync('docker', ['compose', '-f', 'docker-compose.local.yml', 'exec', '-T', 'postgres', 'psql', '-U', 'brisabase', '-d', 'brisabase', '-tAc', `SELECT count(*) FROM observability_metrics WHERE id='${retentionId}'`], { cwd: process.cwd(), encoding: 'utf8' }).trim();
  assert.equal(remaining, '0', 'persistent retention must delete only telemetry older than the configured policy');
  await json('/api/observability/retention', 'PATCH', { logsDays: 30, metricsDays: 30, tracesDays: 7, alertsDays: 90, maxEntries: 10_000 });
  await json(`/api/observability/alerts/${alertRule.id}`, 'DELETE', undefined, serviceHeaders, 204);
  await json(`/api/database/tables/${backupTable}?confirm=${encodeURIComponent(backupTable)}`, 'DELETE', undefined, serviceHeaders, 200);
  await json(`/api/backups/${backup.id}`, 'DELETE', undefined, serviceHeaders, 204);
  console.log('Docker restart persistence passed: Functions, backups, alert rules/events and PostgreSQL-backed metrics/traces survived API restart.');
}

runTest().catch((error) => { console.error('Docker restart persistence failed:', error); process.exit(1); });
