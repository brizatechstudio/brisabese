export type BackupType = 'full' | 'incremental' | 'differential';
export type BackupComponent = 'database' | 'storage' | 'auth' | 'functions' | 'security' | 'config';
export type BackupStatus = 'completed' | 'failed' | 'verifying' | 'restoring';

export interface BackupContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface BackupRecord {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  type: BackupType;
  status: BackupStatus;
  components: BackupComponent[];
  baseBackupId?: string;
  walPosition: string;
  createdAt: string;
  completedAt?: string;
  sizeBytes: number;
  checksum: string;
  cipherChecksum: string;
  signature: string;
  encryption: 'aes-256-gcm';
  integrity: 'verified' | 'failed' | 'pending';
  createdBy: string;
}

export interface BackupManifest {
  schemaVersion: '2.0';
  backupId: string;
  createdAt: string;
  organization: string;
  project: string;
  environment: string;
  database: {
    format: 'pg_dump-custom';
    schema: string;
    dumpFile: string;
    checksum: string;
    restoredAt?: string;
  } | null;
  storage: {
    buckets: number;
    objects: number;
    versions: number;
    checksum: string;
  } | null;
  checksums: Record<string, string>;
}

export interface BackupPayload {
  schemaVersion: '2.0';
  createdAt: string;
  scope: Pick<BackupContext, 'organizationId' | 'projectId' | 'environmentId'>;
  manifest: BackupManifest;
  components: Partial<Record<BackupComponent, unknown>>;
  baseBackupId?: string;
  walPosition: string;
}

export interface BackupArtifact {
  record: BackupRecord;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  payloadChecksum: string;
}

export interface RestoreOptions {
  components?: BackupComponent[];
  tableName?: string;
  bucketName?: string;
  functionId?: string;
  dryRun?: boolean;
  confirm?: boolean;
}

export interface RestorePreview {
  backupId: string;
  type: BackupType;
  components: BackupComponent[];
  impact: Record<string, unknown>;
  pointInTime: string;
  requiresConfirm: boolean;
}

export interface BackupRetentionPolicy { maxBackups: number; maxAgeDays: number; }
export interface BackupSchedule { id: string; organizationId: string; projectId: string; environmentId: string; type: BackupType; expression: string; enabled: boolean; components: BackupComponent[]; lastRunAt?: string; createdAt: string; }