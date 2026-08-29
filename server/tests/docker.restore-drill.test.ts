import assert from 'node:assert/strict';

if (process.env.BRISABASE_RESTORE_DRILL !== 'true') {
  console.log('Restore drill skipped. Set BRISABASE_RESTORE_DRILL=true against the isolated Docker stack.');
  process.exit(0);
}

const base = (process.env.BRISABASE_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const projectId = process.env.BRISABASE_E2E_PROJECT_ID || 'proj_local_1';
const environmentId = process.env.BRISABASE_E2E_ENVIRONMENT_ID || 'env_proj_local_1_development';
const runId = Date.now().toString(36);
const table = `restore_${runId}`;
const bucket = `restore-${runId}`;
const objectPath = 'proof.txt';
const expectedBytes = `restore-proof-${runId}`;

async function body(res: Response): Promise<any> { const text = await res.text(); try { return text ? JSON.parse(text) : null; } catch { return text; } }
async function expect(res: Response, status: number, label: string): Promise<any> { const value = await body(res); assert.equal(res.status, status, `${label}: ${JSON.stringify(value)}`); return value; }
async function json(path: string, status: number, method = 'GET', value?: unknown, headers: Record<string, string> = {}): Promise<any> {
  return expect(await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...headers }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) }), status, `${method} ${path}`);
}

async function controlHeaders(): Promise<Record<string, string>> {
  const email = 'owner@brisabase.local';
  const password = 'SuperSecretSmokePassword123!';
  const login = await json('/api/admin/auth/login', 200, 'POST', { email, password });
  return { authorization: `Bearer ${login.access_token}`, 'x-organization-id': 'org_local_1', 'x-project-id': projectId, 'x-environment-id': environmentId };
}

async function run(): Promise<void> {
  const control = await controlHeaders();
  await json('/api/database/tables', 201, 'POST', { name: table, columns: [{ name: 'id', type: 'text', isPrimaryKey: true, isNullable: false }, { name: 'value', type: 'text', isNullable: false }] }, control);
  const tablePolicy = await json('/api/security/policies', 201, 'POST', { name: `Restore table ${table}`, resourceType: 'table', resource: table, operation: '*', condition: 'true' }, control);
  const storagePolicy = await json('/api/security/policies', 201, 'POST', { name: `Restore bucket ${bucket}`, resourceType: 'storage', resource: `${bucket}/*`, operation: '*', condition: 'true' }, control);
  await json(`/api/database/tables/${table}/rows`, 201, 'POST', { id: 'proof', value: expectedBytes }, control);
  await json('/api/storage/buckets', 201, 'POST', { name: bucket, versioningEnabled: false }, control);
  await expect(await fetch(`${base}/api/storage/buckets/${bucket}/upload`, { method: 'POST', headers: { ...control, 'content-type': 'text/plain', 'x-storage-path': objectPath }, body: expectedBytes }), 201, 'upload restore proof');

  const backup = await json('/api/backups', 201, 'POST', { type: 'full', components: ['database', 'storage', 'security'] }, control);
  assert.deepEqual(backup.components, ['database', 'storage', 'security']);
  const verified = await json(`/api/backups/${backup.id}/verify`, 200, 'GET', undefined, control);
  assert.equal(verified.valid, true);

  await json(`/api/database/tables/${table}?confirm=${encodeURIComponent(table)}`, 200, 'DELETE', undefined, control);
  await expect(await fetch(`${base}/api/storage/buckets/${bucket}/objects/${objectPath}?soft=false`, { method: 'DELETE', headers: control }), 200, 'purge restore proof');
  await json(`/api/storage/buckets/${bucket}`, 200, 'DELETE', undefined, control);
  await expect(await fetch(`${base}/api/security/policies/${tablePolicy.id}`, { method: 'DELETE', headers: control }), 204, 'delete table policy');
  await expect(await fetch(`${base}/api/security/policies/${storagePolicy.id}`, { method: 'DELETE', headers: control }), 204, 'delete storage policy');
  await json(`/api/database/tables/${table}`, 404, 'GET', undefined, control);

  const preview = await json(`/api/backups/${backup.id}/preview`, 200, 'GET', undefined, control);
  assert.equal(preview.requiresConfirm, true);
  await json(`/api/backups/${backup.id}/restore`, 200, 'POST', { components: ['database', 'storage', 'security'], confirm: true }, control);

  const rows = await json(`/api/database/tables/${table}/rows`, 200, 'GET', undefined, control);
  assert.equal(rows.rows.find((row: any) => row.id === 'proof')?.value, expectedBytes);
  const restored = await fetch(`${base}/api/storage/buckets/${bucket}/download/${objectPath}`, { headers: control });
  assert.equal(restored.status, 200, `restored object returned ${restored.status}`);
  assert.equal(await restored.text(), expectedBytes);
  const policies = await json('/api/security/policies', 200, 'GET', undefined, control);
  assert.ok(policies.some((policy: any) => policy.id === tablePolicy.id));
  assert.ok(policies.some((policy: any) => policy.id === storagePolicy.id));
  console.log(JSON.stringify({ gate: 'restore-drill', backupId: backup.id, components: backup.components, database: 'restored', storage: 'restored', security: 'restored' }));
}

run().catch((error) => { console.error('Docker restore drill failed:', error); process.exit(1); });
