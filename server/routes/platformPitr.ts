import crypto from 'node:crypto';
import { Router } from 'express';
import { neonPitrProvider } from '../backup/neonPitrProvider';
import { logger } from '../logger';
import { postgres } from '../db/postgres';
import { assertRecoveryCertified } from '../backup/recoveryCertification';

export const platformPitrRouter = Router();

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function operatorAuthorized(req: any): boolean {
  const expected = String(process.env.BRISABASE_PITR_OPERATOR_TOKEN || '');
  if (Buffer.byteLength(expected, 'utf8') < 32) return false;
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const received = authorization.slice(7).trim();
  return crypto.timingSafeEqual(digest(expected), digest(received));
}

function deny(res: any) {
  return res.status(401).json({ error: { code: 'PITR_OPERATOR_UNAUTHORIZED', message: 'Platform PITR operator authentication failed.' } });
}

platformPitrRouter.get('/internal/pitr/status', async (req, res) => {
  if (!operatorAuthorized(req)) return deny(res);
  try {
    return res.json(await neonPitrProvider.status());
  } catch (error: any) {
    return res.status(503).json({ error: { code: error?.code || 'PITR_STATUS_FAILED', message: error?.message || 'PITR status is unavailable.' } });
  }
});

platformPitrRouter.post('/internal/pitr/restore', async (req, res) => {
  if (!operatorAuthorized(req)) return deny(res);
  if (String(req.body?.confirm || '') !== 'RESTORE_ENTIRE_BRISABASE_DATABASE') {
    return res.status(400).json({
      error: {
        code: 'PITR_CONFIRMATION_REQUIRED',
        message: 'Platform PITR requires confirm=RESTORE_ENTIRE_BRISABASE_DATABASE.',
      },
    });
  }
  try { await assertRecoveryCertified(); } catch (error:any) { return res.status(503).json({ error: { code: error?.code || 'BACKUP_RESTORE_NOT_CERTIFIED', message: error?.message || 'Recovery certification is required.' } }); }
  const target = String(req.body?.target || '');
  logger.warn('Platform PITR requested.', { target, provider: 'neon', source: 'operator' });
  try {
    const result = await neonPitrProvider.restore(target);
    logger.warn('Platform PITR accepted by provider. The API service must restart before normal traffic resumes.', {
      target: result.restoredAt,
      branchId: result.branchId,
      preservedUnderName: result.preservedUnderName,
    });
    return res.json(result);
  } catch (error: any) {
    logger.error('Platform PITR failed.', { target, reason: error instanceof Error ? error.message : String(error) });
    const status = error?.code === 'PITR_TARGET_OUTSIDE_WINDOW' || error?.code === 'PITR_INVALID_TARGET' ? 400 : error?.code === 'PITR_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({ error: { code: error?.code || 'PITR_RESTORE_FAILED', message: error?.message || 'Platform PITR failed.' } });
  }
});


platformPitrRouter.post('/internal/recovery/drills', async (req, res) => {
  if (!operatorAuthorized(req)) return deny(res);
  const status = String(req.body?.status || '');
  if (!['passed','failed'].includes(status)) return res.status(400).json({ error: { code: 'RECOVERY_DRILL_STATUS_INVALID', message: 'status must be passed or failed.' } });
  const provider = String(req.body?.provider || 'docker-restore').slice(0,40);
  const evidence = req.body?.evidence && typeof req.body.evidence === 'object' ? req.body.evidence : {};
  const id = `drill_${crypto.randomUUID().replace(/-/g,'').slice(0,20)}`;
  const row = (await postgres.query<any>(`INSERT INTO backup_recovery_drills(id,provider,status,evidence,started_at,completed_at,created_by) VALUES($1,$2,$3,$4,now(),now(),'operator') RETURNING *`,[id,provider,status,JSON.stringify(evidence)]))[0];
  logger.info('Recovery drill evidence recorded.', { id, provider, status });
  return res.status(201).json(row);
});
