import { Router } from 'express';
import { db } from '../db/database';
import { postgres } from '../db/postgres';
import { emailService } from '../auth/emailService';
import { redisClient } from '../redis';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { postgresCdc } from '../realtime/postgresCdc';
import { storageEngine } from '../storage/storageEngine';
import { observability } from '../observability';
import { infrastructureEngine } from '../infrastructure/infrastructureEngine';
import { config } from '../config';
import { persistentFunctionEngine } from '../functions/persistentFunctionEngine';

export const healthRouter = Router();

const requiredDockerServices = new Set(['database', 'redis', 'storage', 'mail', 'realtime']);
const platformServices = new Set(['database', 'redis', 'mail', 'storage', 'realtime', 'functions', 'security', 'observability']);
const unavailable = (status: 'ok' | 'degraded', service: string): 'healthy' | 'degraded' | 'unhealthy' => {
  if (status === 'ok') return 'healthy';
  // Integration mode is intentionally strict: an unavailable real dependency
  // must fail the container health check instead of looking merely degraded.
  return config.integrationMode && requiredDockerServices.has(service) ? 'unhealthy' : 'degraded';
};

observability.health.register('database', async () => {
  const database = await postgres.healthCheck();
  if (config.testMode) return { status: database.status === 'ok' ? 'healthy' as const : 'degraded' as const, details: { database, migrationVersion: db.migrationVersion, source: 'test-fixture' } };
  const migrations = await postgres.query<{ version: string; applied_at: string }>('SELECT version, applied_at FROM brisabase_schema_migrations ORDER BY version');
  return {
    status: unavailable(database.status, 'database'),
    details: {
      database,
      migrations: { applied: migrations.length, latest: migrations.at(-1)?.version || null },
    },
  };
});
observability.health.register('redis', async () => { const redis = await redisClient.healthCheck(); return { status: unavailable(redis.status, 'redis'), details: redis }; });
observability.health.register('mail', async () => { const mail = await emailService.healthCheck(); return { status: unavailable(mail.status, 'mail'), details: mail }; });
observability.health.register('storage', async () => {
  if (!config.storage.enabled) return { status: 'healthy' as const, details: { mode: 'disabled', reason: 'STORAGE_ENABLED=false' } };
  const health = await storageEngine.getHealth();
  return { status: unavailable(health.status === 'ok' ? 'ok' : 'degraded', 'storage'), details: health };
});
observability.health.register('realtime', async () => {
  if (!config.realtime.enabled) return { status: 'healthy' as const, details: { mode: 'disabled', reason: 'REALTIME_ENABLED=false' } };
  const status = await realtimeEngine.getStatus();
  const cdc = postgresCdc.getStatus();
  // API mutation capture remains a valid local Realtime transport when WAL is
  // deliberately disabled.  If an operator explicitly enables WAL/pgoutput
  // and it cannot start, surface a degraded service instead of silently
  // presenting the application capture path as logical replication.
  const healthy = status.status === 'ok' && cdc.started && cdc.logicalReplication.status !== 'degraded';
  return { status: healthy ? 'healthy' as const : unavailable('degraded', 'realtime'), details: { realtime: status, cdc } };
});
observability.health.register('functions', async () => {
  if (!config.functions.enabled) return { status: 'healthy' as const, details: { mode: 'disabled', reason: 'No isolated production executor is configured.' } };
  if (config.testMode) return { status: 'healthy' as const, details: { mode: 'test-fixture', running: true } };
  const health = await persistentFunctionEngine.health();
  return { status: health.status === 'ok' ? 'healthy' as const : 'degraded' as const, details: health.details };
});
observability.health.register('security', () => ({ status: 'healthy' as const, details: { policyEngine: 'compiled-cache-ready' } }));
observability.health.register('infrastructure', () => config.testMode
  ? ({ status: infrastructureEngine.health.check().status, details: infrastructureEngine.overview() })
  : ({ status: 'degraded' as const, details: { mode: 'migration-required', reason: 'The logical Infrastructure engine is not a Docker cluster control plane and is not reported as real local infrastructure.' } }));

observability.health.register('observability', async () => {
  if (config.testMode) return { status: 'healthy' as const, details: { mode: 'test-fixture' } };
  const health = await observability.persistenceHealth();
  return { status: health.status === 'ok' ? 'healthy' as const : 'degraded' as const, details: health.details };
});

async function respond(res: any, service?: string, requiredOnly = false) {
  const checked = await observability.checkHealth(service);
  const results = (service ? [checked] : checked).filter((item: any) => service || (requiredOnly ? requiredDockerServices.has(item.service) : platformServices.has(item.service)));
  const status = results.some((item: any) => item.status === 'unhealthy') ? 'unhealthy' : results.some((item: any) => item.status === 'degraded') ? 'degraded' : 'healthy';
  const httpStatus = requiredOnly && status !== 'healthy' ? 503 : status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json(service ? results[0] : { status, latencyMs: Math.max(...results.map((item: any) => item.latencyMs), 0), details: Object.fromEntries(results.map((item: any) => [item.service, item])) });
}

// Liveness endpoint for PaaS providers such as Render. It intentionally does
// not disclose dependency state, connection details, or tenant information.
healthRouter.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', service: 'brisabase' }));

healthRouter.get('/health', async (_req, res) => respond(res));

// Used by the Docker HEALTHCHECK. It has no fallback path and succeeds only
// when every required local dependency is connected to a real service.
healthRouter.get('/health/required', async (_req, res) => respond(res, undefined, true));

healthRouter.get('/health/database', async (_req, res) => respond(res, 'database'));

healthRouter.get('/health/redis', async (_req, res) => respond(res, 'redis'));

healthRouter.get('/health/mail', async (_req, res) => respond(res, 'mail'));

healthRouter.get('/health/realtime', async (_req, res) => respond(res, 'realtime'));

healthRouter.get('/health/storage', async (_req, res) => respond(res, 'storage'));
healthRouter.get('/health/functions', async (_req, res) => respond(res, 'functions'));
healthRouter.get('/health/security', async (_req, res) => respond(res, 'security'));
healthRouter.get('/health/observability', async (_req, res) => respond(res, 'observability'));
healthRouter.get('/health/infrastructure', async (_req, res) => respond(res, 'infrastructure'));
