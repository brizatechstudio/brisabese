import crypto from 'crypto';
import { generateRandomToken, hashToken } from './cryptoUtils';

/**
 * Generate a random 20-byte base32 TOTP secret
 */
export function generateTotpSecret(): { secret: string; otpauthUrl: string } {
  const bytes = crypto.randomBytes(20);
  const secret = base32Encode(bytes);
  return {
    secret,
    otpauthUrl: `otpauth://totp/BrisaBase?secret=${secret}&issuer=BrisaBase`,
  };
}

/**
 * Base32 Encoding for TOTP secrets
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Base32 Decoding for TOTP secrets
 */
function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = base32.toUpperCase().replace(/=/g, '').replace(/[^A-Z2-7]/g, '');

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const index = alphabet.indexOf(cleaned[i]);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate TOTP code for a secret at a specific timestamp counter
 */
export function generateTotpCode(secret: string, timeStepWindow = 0): string {
  const key = base32Decode(secret);
  const timeStep = 30; // 30 seconds interval
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / timeStep) + timeStepWindow;

  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verify TOTP code allowing ±1 time window drift (30s before/after)
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  if (!code || code.length !== 6) return false;

  for (const window of [0, -1, 1]) {
    const validCode = generateTotpCode(secret, window);
    if (crypto.timingSafeEqual(Buffer.from(validCode), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

/**
 * Generate 10 random MFA Recovery Codes (formatted as XXXX-XXXX)
 */
export function generateMfaRecoveryCodes(count = 10): { rawCodes: string[]; hashedCodes: string[] } {
  const rawCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const part1 = generateRandomToken(2).toUpperCase();
    const part2 = generateRandomToken(2).toUpperCase();
    const code = `${part1}-${part2}`;
    rawCodes.push(code);
    hashedCodes.push(hashToken(code));
  }

  return { rawCodes, hashedCodes };
}
