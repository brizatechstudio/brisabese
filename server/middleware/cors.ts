import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { redisClient } from '../redis';

function allowedOrigins(): string[] { return config.corsAllowedOrigins; }
function unsafe(method: string): boolean { return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()); }
function isAllowedOrigin(value: string | undefined): boolean { return Boolean(value && allowedOrigins().includes(value)); }

function rateLimitClass(req: Request): { bucket: string; limit: number; ttl: number } | null {
  if (req.method === 'OPTIONS') return null;
  if (/^\/api\/auth\/(login|signup|password-reset\/request|password-reset\/confirm|email-otp|phone-otp|magic-link|mfa\/challenge|oauth)/.test(req.path)) {
    return { bucket: 'auth', limit: 20, ttl: 60 };
  }
  if (/^\/api\/admin\/auth\/(login|signup|password-reset\/request|password-reset\/confirm|mfa\/verify)/.test(req.path)) {
    // The disposable real-stack browser suite runs after integration/load
    // suites against the same Redis instance. Integration mode is explicitly
    // test-only and never permitted by the production validator, so keep the
    // production/admin-auth policy strict while avoiding cross-suite coupling
    // in the local certification environment.
    return { bucket: 'admin-auth', limit: config.integrationMode ? 100 : 10, ttl: 60 };
  }
  if (/^(?:\/api|\/rest|\/graphql|\/storage\/v1|\/functions\/v1)(?:\/|$)/.test(req.path)) {
    return { bucket: 'api', limit: config.rateLimits.apiRequestsPerMinute, ttl: 60 };
  }
  return null;
}

async function enforceRateLimit(req: Request, res: Response): Promise<boolean> {
  const policy = rateLimitClass(req);
  if (!policy) return true;
  const ip = String(req.ip || req.socket.remoteAddress || 'unknown').replace(/[^A-Za-z0-9:._-]/g, '_').slice(0, 100);
  const key = `ratelimit:${policy.bucket}:${ip}`;
  try {
    const count = await redisClient.increment(key, policy.ttl);
    const remaining = Math.max(0, policy.limit - count);
    res.setHeader('X-RateLimit-Limit', String(policy.limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + policy.ttl));
    if (count > policy.limit) {
      res.setHeader('Retry-After', String(policy.ttl));
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } });
      return false;
    }
    return true;
  } catch {
    // Redis is a required runtime dependency in production. Never silently
    // turn a Redis outage into an unbounded public API.
    if (config.production) {
      res.status(503).json({ error: { code: 'RATE_LIMIT_UNAVAILABLE', message: 'Request protection is temporarily unavailable.' } });
      return false;
    }
    return true;
  }
}

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
  const origin = req.headers.origin;
  return Boolean(origin && !isAllowedOrigin(origin));
}

export async function corsAndSecurityMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:");
  if (config.production && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (!(await enforceRateLimit(req, res))) return;
  if (rejectCrossSiteCookieWrite(req)) {
    res.status(403).json({ error: { code: 'CROSS_SITE_REQUEST_DENIED', message: 'Cross-site cookie-authenticated write is not allowed.' } });
    return;
  }

  const bucketCorsRoute = /^\/storage\/v1\/object\/public\//.test(req.path);
  if (!bucketCorsRoute && !applyCors(req, res)) { res.status(403).json({ error: { code: 'CORS_ORIGIN_DENIED', message: 'Origin is not allowed.' } }); return; }
  if (req.method === 'OPTIONS' && !bucketCorsRoute) { res.status(204).end(); return; }
  next();
}
