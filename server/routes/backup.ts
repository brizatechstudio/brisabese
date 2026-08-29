import { Router } from 'express';
import { backupEngine } from '../backup/backupEngine';
import { BackupContext } from '../backup/types';
import { config } from '../config';
import { neonPitrProvider } from '../backup/neonPitrProvider';
import { postgres } from '../db/postgres';
import { recoveryCertificationStatus } from '../backup/recoveryCertification';

export const backupRouter = Router();
backupRouter.use('/api/backups', (_req, res, next) => {
  if (!config.backup.enabled) {
    res.status(503).json({
      error: {
        code: 'BACKUP_DISABLED',
        message: 'The embedded backup engine is disabled. Configure and validate a recovery strategy before enabling it.',
      },
    });
    return;
  }
  next();
});

function context(req: any): BackupContext {
  if (!req.organizationId || !req.projectId || !req.environmentId || !req.user?.id || !req.user?.role) {
    throw new Error('Authenticated organization, project, environment, and user scope are required.');
  }
  return {
    organizationId: req.organizationId,
    projectId: req.projectId,
    environmentId: req.environmentId,
    userId: req.user.id,
    role: req.user.role,
    requestId: req.headers['x-request-id'] as string | undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function fail(res: any, error: any) {
  const detail = error?.message || 'Backup operation failed.';
  const status = /not found|not present/i.test(detail)
    ? 404
    : /already in progress/i.test(detail)
      ? 409
      : /only|invalid|cannot|unsupported|not implemented|disabled/i.test(detail)
        ? 400
        : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Backup operation failed.' : detail;
  return res.status(status).json({
    error: {
      code: status === 404 ? 'BACKUP_NOT_FOUND' : status === 409 ? 'BACKUP_RESTORE_IN_PROGRESS' : 'BACKUP_ERROR',
      message,
    },
  });
}

async function requireRestoreCertification(res: any): Promise<boolean> {
  const certification = await recoveryCertificationStatus();
  if (certification.certified) return true;
  res.status(503).json({
    error: {
      code: 'BACKUP_RESTORE_NOT_CERTIFIED',
      message: 'Restore is disabled until BACKUP_RESTORE_CERTIFIED=true and a passed recovery drill is recorded.',
    },
  });
  return false;
}


backupRouter.get('/api/backups', async (req, res) => {
  try { return res.json(await backupEngine.listBackupsAsync(context(req))); } catch (error) { return fail(res, error); }
});
backupRouter.post('/api/backups', async (req, res) => {
  try { return res.status(201).json(await backupEngine.createBackup(context(req), req.body || {})); } catch (error) { return fail(res, error); }
});
backupRouter.get('/api/backups/retention', (req, res) => res.json(backupEngine.getRetention(context(req))));
backupRouter.patch('/api/backups/retention', async (req, res) => {
  try { return res.json(await backupEngine.setRetention(context(req), req.body || {})); } catch (error) { return fail(res, error); }
});
backupRouter.get('/api/backups/schedules', (req, res) => res.json(backupEngine.listSchedules(context(req))));
backupRouter.post('/api/backups/schedules', async (req, res) => {
  try { return res.status(201).json(await backupEngine.createSchedule(context(req), req.body || {})); } catch (error) { return fail(res, error); }
});
backupRouter.patch('/api/backups/schedules/:id', async (req, res) => { try { return res.json(await backupEngine.updateSchedule(context(req), req.params.id, req.body || {})); } catch (error) { return fail(res, error); } });
backupRouter.delete('/api/backups/schedules/:id', async (req, res) => { try { return await backupEngine.deleteSchedule(context(req), req.params.id) ? res.status(204).end() : res.status(404).json({ error: { code: 'BACKUP_NOT_FOUND', message: 'Backup schedule not found.' } }); } catch (error) { return fail(res, error); } });
backupRouter.get('/api/backups/recovery/status', async (req, res) => {
  try { context(req); const pitr = await neonPitrProvider.status().catch(() => ({ provider: 'neon', configured: false })); const drill = config.testMode ? null : (await postgres.query<any>("SELECT id,provider,status,started_at,completed_at FROM backup_recovery_drills ORDER BY completed_at DESC NULLS LAST,started_at DESC LIMIT 1"))[0] || null; const certification=await recoveryCertificationStatus(); return res.json({ backupEnabled: config.backup.enabled, restoreCertified: certification.certified, restoreCertificationConfigured: certification.configured, pitr, latestRecoveryDrill: drill, latestPassedRecoveryDrill: certification.latestPassedDrill }); } catch (error) { return fail(res,error); }
});
backupRouter.post('/api/backups/pitr', async (req, res) => {
  if (!await requireRestoreCertification(res)) return;
  try { return res.json(await backupEngine.restorePointInTime(context(req), req.body?.timestamp, req.body?.options || {})); } catch (error) { return fail(res, error); }
});
backupRouter.get('/api/backups/:id/verify', async (req, res) => {
  try { return res.json(await backupEngine.verifyBackup(context(req), req.params.id)); } catch (error) { return fail(res, error); }
});
backupRouter.get('/api/backups/:id/preview', async (req, res) => {
  try {
    return res.json(await backupEngine.previewRestore(context(req), req.params.id, {
      components: req.query.components ? String(req.query.components).split(',') as any : undefined,
      tableName: req.query.tableName as string | undefined,
      bucketName: req.query.bucketName as string | undefined,
      functionId: req.query.functionId as string | undefined,
    }));
  } catch (error) { return fail(res, error); }
});
backupRouter.post('/api/backups/:id/restore', async (req, res) => {
  if (!await requireRestoreCertification(res)) return;
  try { return res.json(await backupEngine.restoreBackup(context(req), req.params.id, req.body || {})); } catch (error) { return fail(res, error); }
});
backupRouter.get('/api/backups/:id/export', async (req, res) => {
  try {
    const artifact = await backupEngine.exportArtifact(context(req), req.params.id);
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.bbbak"`);
    res.type('application/octet-stream').send(artifact);
  } catch (error) { return fail(res, error); }
});
backupRouter.delete('/api/backups/:id', async (req, res) => {
  try {
    return await backupEngine.deleteBackup(context(req), req.params.id)
      ? res.status(204).end()
      : res.status(404).json({ error: { code: 'BACKUP_NOT_FOUND', message: 'Backup not found.' } });
  } catch (error) { return fail(res, error); }
});
