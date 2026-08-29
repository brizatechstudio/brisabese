import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { backupEngine } from '../backup/backupEngine';
import { decryptAndVerify } from '../backup/encryption';
import { BackupContext } from '../backup/types';
import { projectDbManager } from '../db/projectDatabase';
import { functionEngine } from '../functions/functionEngine';
import { securityEngine } from '../security/securityEngine';
import { storageEngine } from '../storage/storageEngine';

const context: BackupContext = {
  organizationId: 'org_core_1',
  projectId: 'proj_ecommerce_1',
  environmentId: 'env_proj_ecommerce_1_production',
  userId: 'usr_owner_1',
  role: 'owner',
};

function expect(value: unknown, message: string): asserts value {
  assert.ok(value, `TEST FAILED (Phase 10): ${message}`);
}

export async function runPhase10Tests() {
  console.log('Starting Phase 10 backup and recovery tests...\n');
  const suffix = Date.now().toString(36);
  const table = `backup_${suffix}`;
  const bucket = `backup-${suffix}`;
  const original = 'before-backup';

  projectDbManager.createTable(context.organizationId, context.projectId, context.environmentId, {
    name: table,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'value', type: 'text', isNullable: false },
    ],
  });
  projectDbManager.insertRow(context.organizationId, context.projectId, context.environmentId, table, { id: 'row-1', value: original });
  expect(storageEngine.createBucket({ ...context, role: 'admin' }, { name: bucket, isPublic: false, allowedMimeTypes: ['text/plain'] }).success, 'Test bucket must be created');
  expect((await storageEngine.uploadObject({ ...context, role: 'admin' }, bucket, 'proof.txt', Buffer.from(original), 'text/plain')).success, 'Test object must be uploaded');
  const fn = functionEngine.createFunction(context, { name: `backup-${suffix}`, access: 'internal', code: `export default async () => ({ value: '${original}' });` });
  functionEngine.deployFunction(context, fn.id);
  const policy = securityEngine.createPolicy(context as any, { name: `backup-policy-${suffix}`, resourceType: 'table', resource: table, operation: 'SELECT', condition: "auth.role() = 'owner'" });

  const full = await backupEngine.createBackup(context);
  expect(full.type === 'full' && full.encryption === 'aes-256-gcm' && full.integrity === 'verified', 'Full backup must be encrypted and verified');
  expect((await backupEngine.verifyBackup(context, full.id)).valid, 'Checksum and signature must verify');
  const encryptedArtifact = await backupEngine.exportArtifact(context, full.id);
  expect(!encryptedArtifact.toString('utf8').includes(original), 'Backup artifact must not contain plaintext payload data');
  const tampered = JSON.parse(encryptedArtifact.toString('utf8'));
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -4)}AAAA`;
  assert.throws(() => decryptAndVerify(tampered), /checksum|signature|Unsupported state|unable/i, 'Tampered artifacts must fail integrity validation');
  console.log('Test 1: AES-256-GCM encryption, checksum and signature verification.');

  projectDbManager.updateRow(context.organizationId, context.projectId, context.environmentId, table, 'row-1', { value: 'after-backup' });
  await storageEngine.uploadObject({ ...context, role: 'admin' }, bucket, 'proof.txt', Buffer.from('after-backup'), 'text/plain');
  const incremental = await backupEngine.createBackup(context, { type: 'incremental' });
  expect(incremental.baseBackupId === full.id, 'Incremental backup must retain its base snapshot');
  const preview = await backupEngine.previewRestore(context, full.id, { components: ['database', 'storage'], tableName: table, bucketName: bucket });
  expect(preview.impact.database && preview.impact.storage, 'Restore preview must show partial restore impact');

  await backupEngine.restoreBackup(context, full.id, { components: ['database'], tableName: table });
  expect(projectDbManager.getRow(context.organizationId, context.projectId, context.environmentId, table, 'row-1')?.value === original, 'Partial table restore must recover the selected table');
  await backupEngine.restoreBackup(context, full.id, { components: ['storage'], bucketName: bucket });
  const restoredObject = await storageEngine.getObject({ ...context, role: 'admin' }, bucket, 'proof.txt');
  expect(restoredObject.success && restoredObject.data?.content.toString('utf8') === original, 'Partial bucket restore must recover object bytes');
  functionEngine.deleteFunction(context, fn.id);
  await backupEngine.restoreBackup(context, full.id, { components: ['functions'], functionId: fn.id });
  expect(Boolean(functionEngine.getFunctionDefinition(context, fn.id)), 'Partial function restore must recover the selected function');
  console.log('Test 2: legacy in-memory snapshots and component restore behavior (development only).');

  projectDbManager.updateRow(context.organizationId, context.projectId, context.environmentId, table, 'row-1', { value: 'changed-after-pitr' });
  await backupEngine.restorePointInTime(context, full.createdAt, { components: ['database'], tableName: table });
  expect(projectDbManager.getRow(context.organizationId, context.projectId, context.environmentId, table, 'row-1')?.value === original, 'PITR must select the latest snapshot at or before the requested instant');
  console.log('Test 3: legacy snapshot selection by timestamp; this is not production PITR or WAL replay.');

  const retentionContext: BackupContext = { ...context, projectId: `proj_backup_${suffix}`, environmentId: `env_backup_${suffix}` };
  await backupEngine.createBackup(retentionContext, { type: 'full', components: ['database'] });
  await backupEngine.createBackup(retentionContext, { type: 'full', components: ['database'] });
  await backupEngine.setRetention(retentionContext, { maxBackups: 1, maxAgeDays: 30 });
  expect(backupEngine.listBackups(retentionContext).length === 1, 'Retention must remove snapshots beyond the configured maximum');
  await backupEngine.createSchedule(retentionContext, { expression: '0 * * * *', type: 'full', components: ['database'] });
  expect(await backupEngine.runDueSchedules(new Date('2030-01-01T00:00:00.000Z')) === 1, 'CRON scheduler must create due backups');
  console.log('Test 4: retention policy and scheduled backups.');

  await storageEngine.deleteObject({ ...context, role: 'admin' }, bucket, 'proof.txt', { softDelete: false });
  storageEngine.deleteBucket({ ...context, role: 'admin' }, bucket);
  functionEngine.deleteFunction(context, fn.id);
  securityEngine.deletePolicy(context as any, policy.id);
  projectDbManager.deleteTable(context.organizationId, context.projectId, context.environmentId, table);
  for (const record of backupEngine.listBackups(context)) await backupEngine.deleteBackup(context, record.id);
  for (const record of backupEngine.listBackups(retentionContext)) await backupEngine.deleteBackup(retentionContext, record.id);
  console.log('All Phase 10 backup and recovery tests passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPhase10Tests().catch((error) => { console.error(error); process.exitCode = 1; });
}
