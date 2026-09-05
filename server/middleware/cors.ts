import { NextFunction, Request, Response } from 'express';
import { config } from '../config';

function allowedOrigins(): string[] { return config.corsAllowedOrigins; }
function unsafe(method: string): boolean { return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()); }
function isAllowedOrigin(value: string | undefined): boolean { return Boolean(value && allowedOrigins().includes(value)); }

export function applyCors(req: Request, res: Response): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const allowed = allowedOrigins();
  if (!isDevelopment && !allowed.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  // Service bypass is intentionally not exposed as a browser CORS capability.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-apikey, x-organization-id, x-project-id, x-environment-id, x-request-id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
  return true;
}

function hasCookie(req: Request): boolean { return Boolean(req.headers.cookie); }

function rejectCrossSiteCookieWrite(req: Request): boolean {
  if (!unsafe(req.method) || !hasCookie(req)) return false;
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') return true;
  // Browsers that omit Fetch Metadata still send Origin on CORS/fetch writes.
  // For cookie-authenticated unsafe requests, reject an explicit foreign Origin.
  const origin = req.headers.origin;
  return Boolean(origin && !isAllowedOrigin(origin));
}

export function corsAndSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:");
  if (config.production && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (rejectCrossSiteCookieWrite(req)) {
    res.status(403).json({ error: { code: 'CROSS_SITE_REQUEST_DENIED', message: 'Cross-site cookie-authenticated write is not allowed.' } });
    return;
  }

  const bucketCorsRoute = /^\/storage\/v1\/object\/public\//.test(req.path);
  if (!bucketCorsRoute && !applyCors(req, res)) { res.status(403).json({ error: { code: 'CORS_ORIGIN_DENIED', message: 'Origin is not allowed.' } }); return; }
  if (req.method === 'OPTIONS' && !bucketCorsRoute) { res.status(204).end(); return; }
  next();
}
