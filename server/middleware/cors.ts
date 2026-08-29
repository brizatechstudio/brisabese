import { NextFunction, Request, Response } from 'express';
import { config } from '../config';

function allowedOrigins(): string[] { return config.corsAllowedOrigins; }
export function applyCors(req: Request, res: Response): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const allowed = allowedOrigins();
  if (!isDevelopment && !allowed.includes(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-apikey, x-organization-id, x-project-id, x-environment-id, x-request-id, x-brisabase-service-bypass');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
  return true;
}

function isCrossSiteAdminRefresh(req: Request): boolean {
  if (req.method !== 'POST' || req.path !== '/api/admin/auth/refresh') return false;
  return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
}

export function corsAndSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:");
  if (config.production && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // The admin refresh endpoint can fall back to an HttpOnly cookie. Fetch
  // Metadata provides a browser-native CSRF boundary without affecting CLI,
  // mobile, server-to-server or other clients that do not send Sec-Fetch-Site.
  if (isCrossSiteAdminRefresh(req)) {
    res.status(403).json({ error: { code: 'CROSS_SITE_REQUEST_DENIED', message: 'Cross-site administrative refresh is not allowed.' } });
    return;
  }

  // Public object delivery has bucket-level CORS. Let the storage route evaluate
  // that policy instead of forcing the control-plane global origin allowlist.
  const bucketCorsRoute = /^\/storage\/v1\/object\/public\//.test(req.path);
  if (!bucketCorsRoute && !applyCors(req, res)) { res.status(403).json({ error: { code: 'CORS_ORIGIN_DENIED', message: 'Origin is not allowed.' } }); return; }
  if (req.method === 'OPTIONS' && !bucketCorsRoute) { res.status(204).end(); return; }
  next();
}
