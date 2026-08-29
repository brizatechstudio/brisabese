import crypto from 'crypto';
import { config } from '../config';

const ENCRYPTION_KEY = process.env.AUTH_ENCRYPTION_KEY || (config.testMode ? 'brisabase-auth-test-key-32bytes!!' : '');
const PREVIOUS_ENCRYPTION_KEYS = String(process.env.AUTH_ENCRYPTION_KEY_PREVIOUS || '').split(',').map((value) => value.trim()).filter(Boolean);
const ALGORITHM = 'aes-256-gcm';
function deriveScrypt(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

function deriveLegacyPbkdf2(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100_000, 64, 'sha512', (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Hash password using PBKDF2 with SHA-512 and random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against salt:hash string
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

/** Non-blocking, memory-hard password hashing for real HTTP authentication. */
export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await deriveScrypt(password, salt);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPasswordAsync(password: string, storedHash: string): Promise<boolean> {
  try {
    if (storedHash.startsWith('scrypt$')) {
      const [, salt, expected] = storedHash.split('$');
      const derived = await deriveScrypt(password, salt);
      const expectedBuffer = Buffer.from(expected, 'hex');
      return expectedBuffer.length === derived.length && crypto.timingSafeEqual(derived, expectedBuffer);
    }
    const [salt, expected] = storedHash.split(':');
    if (!salt || !expected) return false;
    const derived = await deriveLegacyPbkdf2(password, salt);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return expectedBuffer.length === derived.length && crypto.timingSafeEqual(derived, expectedBuffer);
  } catch { return false; }
}

/**
 * Generate secure random token string
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash token using SHA-256 for secure database lookup
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Encrypt sensitive text (e.g. TOTP secrets, OAuth client secrets)
 */
export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive text
 */
export function decryptSecret(encryptedData: string): string {
  if (!encryptedData || !encryptedData.includes(':')) return '';
  const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  for (const secret of [ENCRYPTION_KEY, ...PREVIOUS_ENCRYPTION_KEYS]) {
    if (!secret) continue;
    try {
      const key = crypto.scryptSync(secret, 'salt', 32);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch { /* try previous rotation key */ }
  }
  throw new Error('Unable to decrypt auth secret with configured keyring.');
}

/**
 * Normalize email
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
