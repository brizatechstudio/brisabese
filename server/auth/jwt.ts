import crypto from 'crypto';
import { config } from '../config';

const JWT_SECRET = process.env.JWT_SECRET || (config.testMode ? 'brisabase-test-jwt-secret-only' : '');
const JWT_SECRET_PREVIOUS = String(process.env.JWT_SECRET_PREVIOUS || '').split(',').map((value) => value.trim()).filter(Boolean);
const DEFAULT_ISSUER = config.jwtIssuer;
const DEFAULT_AUDIENCE = config.jwtAudience;

export interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

export interface JwtPayload {
  sub: string; // auth_user.id
  project_id: string;
  environment_id: string;
  session_id: string;
  role: string;
  email: string;
  iss?: string;
  aud?: string;
  iat: number;
  exp: number;
  [key: string]: any;
}

function base64UrlEncode(str: string | Buffer): string {
  const buf = typeof str === 'string' ? Buffer.from(str) : str;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = 900): string {
  if (!JWT_SECRET) throw new Error('[BRISABASE SECURITY ERROR] JWT_SECRET is required.');
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    sub: payload.sub,
    project_id: payload.project_id,
    environment_id: payload.environment_id,
    session_id: payload.session_id,
    role: payload.role,
    email: payload.email,
    ...payload,
    iss: payload.iss || DEFAULT_ISSUER,
    aud: payload.aud || DEFAULT_AUDIENCE,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  const encodedSignature = base64UrlEncode(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export function verifyJwt(token: string): JwtPayload {
  if (!JWT_SECRET) throw new Error('[BRISABASE SECURITY ERROR] JWT_SECRET is required.');
  if (!token || typeof token !== 'string') {
    throw new Error('Token não fornecido');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Formato JWT inválido');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header: JwtHeader;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader)) as JwtHeader;
  } catch {
    throw new Error('Cabeçalho JWT inválido');
  }
  if (header.typ !== 'JWT' || header.alg !== 'HS256') {
    throw new Error('Algoritmo JWT não permitido');
  }

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const validSignature = [JWT_SECRET, ...JWT_SECRET_PREVIOUS].some((secret) => {
    if (!secret) return false;
    const expectedSignature = base64UrlEncode(crypto.createHmac('sha256', secret).update(signatureInput).digest());
    return Buffer.byteLength(encodedSignature) === Buffer.byteLength(expectedSignature)
      && crypto.timingSafeEqual(Buffer.from(encodedSignature), Buffer.from(expectedSignature));
  });
  if (!validSignature) throw new Error('Assinatura JWT inválida');

  const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (!payload.sub || !payload.project_id || !payload.environment_id || !payload.session_id) {
    throw new Error('Claims JWT obrigatórios ausentes');
  }
  if (payload.iss !== DEFAULT_ISSUER || payload.aud !== DEFAULT_AUDIENCE) {
    throw new Error('Issuer ou audience JWT inválidos');
  }
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.iat > now + 60) {
    throw new Error('Tempos JWT inválidos');
  }
  if (payload.exp <= now) {
    throw new Error('Token JWT expirado');
  }

  return payload;
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}
