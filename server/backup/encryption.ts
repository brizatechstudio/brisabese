import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { BackupArtifact, BackupRecord } from './types';
import { config } from '../config';

function keyMaterial(): string {
  const key = process.env.BACKUP_ENCRYPTION_KEY || (config.testMode ? 'brisabase-test-backup-key' : '');
  if (!key) throw new Error('[BRISABASE BACKUP ERROR] BACKUP_ENCRYPTION_KEY is required.');
  return key;
}
function signingKey(): Buffer { return scryptSync(`${keyMaterial()}:signature`, 'brisabase-backup', 32); }
function digest(value: Buffer | string): string { return createHash('sha256').update(value).digest('hex'); }
function signature(record: BackupRecord, salt: string, iv: string, authTag: string, ciphertext: string): string { return createHmac('sha256', signingKey()).update(`${record.id}:${record.checksum}:${salt}:${iv}:${authTag}:${ciphertext}`).digest('hex'); }

export function encryptBackup(record: BackupRecord, payload: string): BackupArtifact {
  const salt = randomBytes(16); const iv = randomBytes(12); const key = scryptSync(keyMaterial(), salt, 32); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(payload, 'utf8')), cipher.final()]);
  const payloadChecksum = digest(payload);
  const artifact: BackupArtifact = {
    record: { ...record, checksum: payloadChecksum, cipherChecksum: digest(encrypted), signature: '' },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
    payloadChecksum,
  };
  artifact.record.signature = signature(artifact.record, artifact.salt, artifact.iv, artifact.authTag, artifact.ciphertext);
  return artifact;
}

export function decryptAndVerify(artifact: BackupArtifact): string {
  const cipher = Buffer.from(artifact.ciphertext, 'base64');
  if (digest(cipher) !== artifact.record.cipherChecksum) throw new Error('Backup ciphertext checksum mismatch.');
  const expected = Buffer.from(signature(artifact.record, artifact.salt, artifact.iv, artifact.authTag, artifact.ciphertext), 'hex');
  const actual = Buffer.from(artifact.record.signature, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Backup signature verification failed.');
  const key = scryptSync(keyMaterial(), Buffer.from(artifact.salt, 'base64'), 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(artifact.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(artifact.authTag, 'base64'));
  const payload = Buffer.concat([decipher.update(cipher), decipher.final()]).toString('utf8');
  if (digest(payload) !== artifact.record.checksum) throw new Error('Backup plaintext checksum mismatch.');
  return payload;
}