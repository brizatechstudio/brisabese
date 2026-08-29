import { config } from '../config';
import { postgres } from '../db/postgres';

export type RecoveryCertificationStatus = {
  configured: boolean;
  certified: boolean;
  latestPassedDrill: null | {
    id: string;
    provider: string;
    status: string;
    started_at: string;
    completed_at?: string;
  };
};

export async function recoveryCertificationStatus(): Promise<RecoveryCertificationStatus> {
  if (config.testMode) {
    return {
      configured: config.backup.certified,
      certified: config.backup.certified,
      latestPassedDrill: config.backup.certified ? { id: 'test-drill', provider: 'test', status: 'passed', started_at: new Date(0).toISOString(), completed_at: new Date(0).toISOString() } : null,
    };
  }
  const row = (await postgres.query<any>(
    `SELECT id,provider,status,started_at,completed_at
     FROM backup_recovery_drills
     WHERE status='passed'
     ORDER BY completed_at DESC NULLS LAST,started_at DESC
     LIMIT 1`,
  ))[0] || null;
  return { configured: config.backup.certified, certified: Boolean(config.backup.certified && row), latestPassedDrill: row };
}

export async function assertRecoveryCertified(): Promise<RecoveryCertificationStatus> {
  const status = await recoveryCertificationStatus();
  if (!status.certified) {
    const error = new Error('Restore is disabled until BACKUP_RESTORE_CERTIFIED=true and a passed recovery drill is recorded.');
    (error as any).code = 'BACKUP_RESTORE_NOT_CERTIFIED';
    throw error;
  }
  return status;
}
