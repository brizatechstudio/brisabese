import { test, expect } from '@playwright/test';
import { ensureReleaseAdmin, firstReleaseOrganization } from './helpers/releaseAdmin';

const API_URL = process.env.ADMIN_UI_URL || 'http://localhost:3000';
const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const table = `backup_proof_${runId}`;
const bucket = `backup-proof-${runId}`;
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, init);
}

async function json(response: Response): Promise<any> {
  const body = await response.text();
  try { return body ? JSON.parse(body) : null; } catch { return body; }
}

test.describe('Backup and Restore E2E', () => {
  // Restore wipes the project schema, so this test must run serially.
  test.describe.configure({ mode: 'serial' });

  test('Create real PostgreSQL data, backup, verify, restore, and confirm persistence', async () => {
    const admin = await ensureReleaseAdmin(API_URL);
    const organizationId = await firstReleaseOrganization(admin.access_token, API_URL);
    const organizationHeaders = {
      authorization: `Bearer ${admin.access_token}`,
      'x-organization-id': organizationId,
      'content-type': 'application/json',
    };
    // Create a dedicated project to avoid interfering with other tests.
    const projectName = `backup-project-${runId}`;
    const createProject = await request('/api/projects', {
      method: 'POST',
      headers: organizationHeaders,
      body: JSON.stringify({ organization_id: organizationId, name: projectName, description: 'Backup E2E project', region: 'us-east-1', environment: 'development' }),
    });
    expect(createProject.status).toBe(201);
    const projectData = await json(createProject);
    const projectId = projectData.id;
    // List environments for the new project to get the actual environment ID.
    const envList = await request(`/api/projects/${projectId}/environments`, { headers: { ...organizationHeaders, 'x-project-id': projectId } });
    const envData = await json(envList);
    const environmentId = Array.isArray(envData) && envData[0]?.id ? envData[0].id : `env_${projectId}_development`;
    // Create a new service API key scoped to the new project.
    const createKey = await request(`/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      headers: { ...organizationHeaders, 'x-project-id': projectId },
      body: JSON.stringify({ name: 'backup-e2e-service', type: 'service', environment_id: environmentId }),
    });
    expect(createKey.status).toBe(201);
    const keyData = await json(createKey);
    const newServiceKey = keyData.fullSecretKey;
    const adminProjectHeaders = {
      authorization: `Bearer ${admin.access_token}`,
      'x-organization-id': organizationId,
      'x-project-id': projectId,
      'x-environment-id': environmentId,
      'content-type': 'application/json',
    };
    const serviceHeaders = {
      apikey: newServiceKey,
      'x-brisabase-service-bypass': 'true',
      'x-project-id': projectId,
      'x-environment-id': environmentId,
      'content-type': 'application/json',
    };

    // Create a real table
    const createTable = await request('/api/database/tables', {
      method: 'POST',
      headers: adminProjectHeaders,
      body: JSON.stringify({
        name: table,
        columns: [
          { name: 'id', type: 'text', isPrimaryKey: true, isNullable: false },
          { name: 'value', type: 'text', isNullable: false },
        ],
      }),
    });
    expect(createTable.status).toBe(201);

    // Insert real data
    const insert = await request(`/api/database/tables/${table}/rows`, {
      method: 'POST',
      headers: adminProjectHeaders,
      body: JSON.stringify({ id: 'backup-row', value: 'original-data' }),
    });
    expect(insert.status).toBe(201);

    // Create a real MinIO object
    const createBucket = await request('/api/storage/buckets', {
      method: 'POST',
      headers: adminProjectHeaders,
      body: JSON.stringify({ name: bucket, versioningEnabled: false }),
    });
    expect(createBucket.status).toBe(201);

    const upload = await request(`/storage/v1/object/${bucket}/proof.txt`, {
      method: 'POST',
      headers: { ...serviceHeaders, 'content-type': 'text/plain' },
      body: 'original MinIO object',
    });
    expect(upload.status).toBe(201);

    // Create a real backup
    const backup = await request('/api/backups', {
      method: 'POST',
      headers: adminProjectHeaders,
      body: JSON.stringify({ type: 'full' }),
    });
    expect(backup.status).toBe(201);
    const backupData = await json(backup);
    expect(backupData.id).toBeTruthy();
    expect(backupData.encryption).toBe('aes-256-gcm');
    expect(backupData.integrity).toBe('verified');

    // Verify the backup
    const verify = await request(`/api/backups/${backupData.id}/verify`, { headers: adminProjectHeaders });
    expect(verify.status).toBe(200);
    const verifyData = await json(verify);
    expect(verifyData.valid).toBe(true);

    // Modify the data
    await request(`/api/database/tables/${table}/rows/backup-row`, {
      method: 'PATCH',
      headers: adminProjectHeaders,
      body: JSON.stringify({ value: 'modified-data' }),
    });
    await request(`/storage/v1/object/${bucket}/proof.txt`, {
      method: 'POST',
      headers: { ...serviceHeaders, 'content-type': 'text/plain' },
      body: 'modified MinIO object',
    });

    // Preview restore
    const preview = await request(`/api/backups/${backupData.id}/preview`, { headers: adminProjectHeaders });
    expect(preview.status).toBe(200);
    const previewData = await json(preview);
    expect(previewData.requiresConfirm).toBe(true);

    // Restore with explicit confirmation
    const restore = await request(`/api/backups/${backupData.id}/restore`, {
      method: 'POST',
      headers: adminProjectHeaders,
      body: JSON.stringify({ confirm: true }),
    });
    expect(restore.status).toBe(200);

    // Verify restored PostgreSQL data
    const rows = await request(`/api/database/tables/${table}/rows`, { headers: adminProjectHeaders });
    expect(rows.status).toBe(200);
    const rowsData = await json(rows);
    const restoredRow = rowsData.rows.find((r: any) => r.id === 'backup-row');
    expect(restoredRow.value).toBe('original-data');

    // Verify restored MinIO object
    const download = await request(`/storage/v1/object/${bucket}/proof.txt`, { headers: serviceHeaders });
    expect(download.status).toBe(200);
    expect(await download.text()).toBe('original MinIO object');

    // Cleanup
    await request(`/api/database/tables/${table}`, { method: 'DELETE', headers: adminProjectHeaders });
    await request(`/storage/v1/object/${bucket}/proof.txt?soft=false`, { method: 'DELETE', headers: serviceHeaders });
    await request(`/api/storage/buckets/${bucket}`, { method: 'DELETE', headers: adminProjectHeaders });
    await request(`/api/backups/${backupData.id}`, { method: 'DELETE', headers: adminProjectHeaders });
    await request(`/api/projects/${projectId}`, { method: 'DELETE', headers: { ...organizationHeaders, 'x-project-id': projectId } });
  });
});
