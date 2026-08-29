const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const apiUrl = String(process.env.BRISABASE_API_URL || '').replace(/\/$/, '');
const projectName = process.env.COMPOSE_PROJECT_NAME || 'brisabase-release-local';

if (process.env.BRISABASE_BACKUP_RESTORE_CERTIFIED !== 'true') {
  throw new Error('Refusing to prepare a recovery certification fixture unless BRISABASE_BACKUP_RESTORE_CERTIFIED=true.');
}
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl)) {
  throw new Error(`Recovery certification fixture is restricted to a loopback API URL; received '${apiUrl || '<empty>'}'.`);
}
if (projectName !== 'brisabase-release-local') {
  throw new Error(`Recovery certification fixture is restricted to the disposable 'brisabase-release-local' Compose project; received '${projectName}'.`);
}

const drillId = `drill_release_gate_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
const evidence = JSON.stringify({
  source: 'docker-release-gate',
  fixture: true,
  disposable: true,
  purpose: 'Authorize the isolated destructive restore certification exercise.',
});
const sqlLiteral = (value) => String(value).replace(/'/g, "''");
const sql = `INSERT INTO backup_recovery_drills(id,provider,status,evidence,started_at,completed_at,created_by) VALUES('${sqlLiteral(drillId)}','local','passed','${sqlLiteral(evidence)}'::jsonb,now(),now(),'docker-release-gate');`;

execFileSync('docker', [
  'compose',
  '--project-name', projectName,
  '-f', 'docker-compose.local.yml',
  'exec', '-T',
  'postgres',
  'psql', '-U', 'brisabase', '-d', 'brisabase', '-v', 'ON_ERROR_STOP=1', '-c', sql,
], { cwd: process.cwd(), stdio: 'inherit' });

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function main() {
  const loginResponse = await fetch(`${apiUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@brisabase.local', password: 'SuperSecretSmokePassword123!' }),
  });
  const login = await readJson(loginResponse);
  assert.equal(loginResponse.status, 200, `Recovery certification admin login failed: ${JSON.stringify(login)}`);

  const headers = {
    authorization: `Bearer ${login.access_token}`,
    'x-organization-id': 'org_local_1',
    'x-project-id': 'proj_local_1',
    'x-environment-id': 'env_proj_local_1_development',
  };
  const statusResponse = await fetch(`${apiUrl}/api/backups/recovery/status`, { headers });
  const status = await readJson(statusResponse);
  assert.equal(statusResponse.status, 200, `Recovery certification status failed: ${JSON.stringify(status)}`);
  assert.equal(status.backupEnabled, true, 'Backup engine must be enabled in the disposable release stack.');
  assert.equal(status.restoreCertificationConfigured, true, 'BACKUP_RESTORE_CERTIFIED must be explicitly enabled for the disposable release stack.');
  assert.equal(status.restoreCertified, true, 'Restore must be certified only after the passed recovery-drill fixture exists.');
  assert.equal(status.latestPassedRecoveryDrill?.id, drillId, 'Recovery status must resolve the exact release-gate drill fixture.');

  console.log(JSON.stringify({
    gate: 'recovery-certification-precondition',
    restoreCertified: status.restoreCertified,
    drillId,
    provider: status.latestPassedRecoveryDrill?.provider,
    fixture: true,
    disposable: true,
  }));
}

main().catch((error) => {
  console.error('Local recovery certification preparation failed:', error);
  process.exit(1);
});
