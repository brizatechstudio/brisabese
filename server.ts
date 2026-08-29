import 'express-async-errors';
import express from 'express';
import path from 'path';
import type { Server } from 'node:http';

import { config } from './server/config';
import { logger } from './server/logger';
import { requestLogger } from './server/middleware/logger';
import { authMiddleware, controlPlaneAuthorizationMiddleware } from './server/middleware/auth';
import { errorHandler } from './server/middleware/error';
import { corsAndSecurityMiddleware } from './server/middleware/cors';

import { healthRouter } from './server/routes/health';
import { docsRouter } from './server/routes/docs';
import { adminAuthRouter } from './server/routes/adminAuth';
import { organizationsRouter } from './server/routes/organizations';
import { projectsRouter } from './server/routes/projects';
import { environmentsRouter } from './server/routes/environments';
import { apiKeysRouter } from './server/routes/apiKeys';
import { membersRouter } from './server/routes/members';
import { auditLogsRouter } from './server/routes/auditLogs';
import { settingsRouter } from './server/routes/settings';
import { databaseRouter } from './server/routes/database';
import { realDatabaseRouter } from './server/routes/realDatabase';
import { authEngineRouter } from './server/routes/authEngine';
import { realAuthRouter } from './server/routes/realAuth';
import { passwordRecoveryRouter } from './server/routes/passwordRecovery';
import { restApiRouter } from './server/routes/restApi';
import { realRestApiRouter } from './server/routes/realRestApi';
import { graphqlRouter } from './server/routes/graphql';
import { graphqlManagementRouter } from './server/routes/graphqlManagement';
import { realtimeRouter } from './server/routes/realtime';
import { realtimeEngine } from './server/realtime/realtimeEngine';
import { postgresCdc } from './server/realtime/postgresCdc';
import { PostgresLogicalReplicationSource } from './server/realtime/postgresLogicalReplication';
import { realtimeWebSocketServer } from './server/realtime/websocketServer';
import { storageRouter } from './server/routes/storage';
import { realStorageRouter } from './server/routes/realStorage';
import { realStorageEngine } from './server/storage/realStorageEngine';
import { functionsRouter } from './server/routes/functions';
import { functionExecutorRpcRouter } from './server/routes/functionExecutorRpc';
import { platformPitrRouter } from './server/routes/platformPitr';
import { functionEngine } from './server/functions/functionEngine';
import { persistentFunctionEngine } from './server/functions/persistentFunctionEngine';
import { securityRouter } from './server/routes/security';
import { realSecurityRouter } from './server/routes/realSecurity';
import { observabilityRouter } from './server/routes/observability';
import { realObservabilityRouter } from './server/routes/realObservability';
import { backupRouter } from './server/routes/backup';
import { backupEngine } from './server/backup/backupEngine';
import { infrastructureRouter } from './server/routes/infrastructure';
import { infrastructureEngine } from './server/infrastructure/infrastructureEngine';
import { productionInfrastructureEngine } from './server/infrastructure/productionInfrastructureEngine';
import { productionInfrastructureRouter, publicStatusRouter } from './server/routes/productionInfrastructure';
import { ecosystemRouter } from './server/routes/ecosystem';
import { billingRouter, billingWebhookRouter } from './server/routes/billing';
import { enterpriseManagementRouter, enterprisePublicRouter, scimRouter } from './server/routes/enterprise';
import { iacRouter } from './server/routes/iac';
import { previewDatabaseRouter } from './server/routes/previewDatabase';
import { hostingPublicRouter, hostingManagementRouter, hostingCustomDomainRouter, hostingInternalRouter } from './server/routes/hosting';
import { messagingDataRouter, messagingManagementRouter } from './server/routes/messaging';
import { messagingEngine } from './server/platform/messagingEngine';
import { postgres } from './server/db/postgres';
import { redisClient } from './server/redis';
import { storageEngine } from './server/storage/storageEngine';
import { emailService } from './server/auth/emailService';
import { securityEngine } from './server/security/securityEngine';
import { observability } from './server/observability';
import { webhooksRouter } from './server/routes/webhooks';
import { webhookEngine } from './server/webhooks/webhookEngine';
import { developerRouter } from './server/routes/developer';
import { advancedDataRouter, advancedManagementRouter } from './server/routes/advancedPlatform';
import { advancedPlatformEngine } from './server/platform/advancedPlatformEngine';
import { safeErrorMetadata } from './server/diagnostics';

class BootStepError extends Error {
  public readonly cause: unknown;

  constructor(public readonly step: string, cause: unknown) {
    super(`${step} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'BootStepError';
    this.cause = cause;
  }
}

async function bootStep<T>(step: string, action: () => Promise<T> | T): Promise<T> {
  logger.info(`[BOOT] ${step}`);
  try {
    const result = await action();
    logger.info(`[BOOT] ${step} complete`);
    return result;
  } catch (error) {
    logger.error(`[BOOT] ${step} failed.`, safeErrorMetadata(error));
    throw new BootStepError(step, error);
  }
}

async function listen(app: express.Express, port: number): Promise<Server> {
  return new Promise<Server>((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0');
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}

async function startServer() {
  await bootStep('Validating runtime configuration', () => config.assertRealRuntime());
  await bootStep('Connecting to PostgreSQL and applying migrations', () => postgres.initialize());
  await bootStep('Hydrating security state', () => securityEngine.hydrate());
  await bootStep('Connecting to Redis', () => redisClient.connect());
  if (config.storage.enabled) {
    await bootStep('Initializing storage', async () => {
      if (!config.testMode) realStorageEngine.startLifecycleScheduler();
      const storageHealth = await storageEngine.getHealth();
      if (storageHealth.status !== 'ok') throw new Error('[BRISABASE STORAGE ERROR] MinIO/S3 is unavailable or bucket configuration is invalid.');
    });
  } else logger.info('[BOOT] Storage disabled by STORAGE_ENABLED=false');
  if (config.smtp.enabled) {
    await bootStep('Checking SMTP', async () => {
      const mailHealth = await emailService.healthCheck();
      if (mailHealth.status !== 'ok') throw new Error('[BRISABASE MAIL ERROR] SMTP service is unavailable.');
    });
  } else logger.info('[BOOT] SMTP disabled by SMTP_ENABLED=false');
  if (config.functions.enabled) {
    await bootStep('Starting Functions runtime', async () => {
      if (config.testMode) functionEngine.start();
      else await persistentFunctionEngine.start();
    });
  } else logger.info('[BOOT] Functions disabled by FUNCTIONS_ENABLED=false');
  if (config.observability.enabled) await bootStep('Starting observability', () => observability.start());
  else logger.info('[BOOT] Observability disabled by OBSERVABILITY_ENABLED=false');
  await bootStep('Starting background services', () => {
    webhookEngine.start();
    messagingEngine.start();
    advancedPlatformEngine.start();
  });
  const app = express();
  const PORT = config.port;

  app.set('trust proxy', config.trustProxy);
  if (!config.testMode) app.use(hostingCustomDomainRouter);
  app.use(corsAndSecurityMiddleware);
  // Stripe requires the exact raw request body for signature verification.
  app.use(billingWebhookRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  app.use(healthRouter);
  app.use(publicStatusRouter);
  if (config.hosting.enabled) app.use(hostingInternalRouter);
  else app.use('/internal/hosting', (_req, res) => res.status(503).json({ error: { code: 'HOSTING_DISABLED', message: 'Hosting is disabled by configuration.' } }));
  app.use(docsRouter);
  app.use(config.testMode ? restApiRouter : realRestApiRouter);
  if (!config.testMode) app.use(graphqlRouter);
  if (config.storage.enabled) app.use(config.testMode ? storageRouter : realStorageRouter);
  else app.use(['/api/storage', '/storage/v1'], (_req, res) => res.status(503).json({ error: { code: 'STORAGE_DISABLED', message: 'Storage is disabled by configuration.' } }));
  app.use(functionsRouter);
  app.use(functionExecutorRpcRouter);
  // Platform PITR is deliberately not part of the tenant control plane. A
  // separate operator token protects a whole-database recovery operation.
  app.use(platformPitrRouter);
  if (!config.testMode) {
    // Password recovery is a public data-plane flow. Mount its hardened handler
    // before control-plane auth so applications can request/confirm reset links.
    app.use(passwordRecoveryRouter);
    app.use(messagingDataRouter);
    app.use(advancedDataRouter);
    if (config.hosting.enabled) app.use(hostingPublicRouter);
  }
  if (config.enterprise.enabled) { app.use(enterprisePublicRouter); app.use(scimRouter); }
  else app.use(['/enterprise/v1','/scim/v2'], (_req,res)=>res.status(503).json({error:{code:'ENTERPRISE_DISABLED',message:'Enterprise features are disabled by configuration.'}}));
  app.use(adminAuthRouter);

  const isFrontendRequest = (req: express.Request) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    return !/^\/(?:api|rest|graphql|storage|functions|internal|messaging|hosting|realtime|health|config|experiments|analytics|quality|search|ai|billing|enterprise|scim)(?:\/|$)/.test(req.path);
  };
  if (process.env.NODE_ENV !== 'production' && process.env.SERVE_STATIC !== 'true') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use((req, res, next) => {
      if (!isFrontendRequest(req)) return next();
      return vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist', 'client');
    app.use('/assets', express.static(path.join(distPath, 'assets'), { fallthrough: true, index: false, dotfiles: 'deny' }));
    app.get('*', (req, res, next) => {
      if (!isFrontendRequest(req) || path.extname(req.path) || path.basename(req.path).startsWith('.')) return next();
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((req, res, next) => {
    const basename = path.basename(req.path);
    if (isFrontendRequest(req) && (Boolean(path.extname(req.path)) || basename.startsWith('.'))) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      return;
    }
    next();
  });

  app.use(authMiddleware);
  app.use(controlPlaneAuthorizationMiddleware);
  if (config.realtime.enabled) app.use(realtimeRouter);
  else app.use('/api/realtime', (_req, res) => res.status(503).json({ error: { code: 'REALTIME_DISABLED', message: 'Realtime is disabled by configuration.' } }));
  app.use(organizationsRouter);
  app.use(projectsRouter);
  app.use(environmentsRouter);
  app.use(apiKeysRouter);
  app.use(webhooksRouter);
  app.use(membersRouter);
  app.use(auditLogsRouter);
  app.use(settingsRouter);
  app.use(config.testMode ? databaseRouter : realDatabaseRouter);
  app.use(config.testMode ? authEngineRouter : realAuthRouter);
  app.use(config.testMode ? securityRouter : realSecurityRouter);
  app.use(config.testMode ? observabilityRouter : realObservabilityRouter);
  app.use(backupRouter);
  if (!config.testMode) {
    app.use(graphqlManagementRouter);
    app.use(developerRouter);
    app.use(previewDatabaseRouter);
    if (config.hosting.enabled) app.use(hostingManagementRouter);
    else app.use(['/api/hosting', '/hosting/v1'], (_req, res) => res.status(503).json({ error: { code: 'HOSTING_DISABLED', message: 'Hosting is disabled by configuration.' } }));
    app.use(messagingManagementRouter);
    app.use(advancedManagementRouter);
    if (config.enterprise.enabled) app.use(enterpriseManagementRouter);
    else app.use('/api/enterprise', (_req,res)=>res.status(503).json({error:{code:'ENTERPRISE_DISABLED',message:'Enterprise features are disabled by configuration.'}}));
    app.use(iacRouter);
  }
  if (config.infrastructure.previewEnabled) app.use(infrastructureRouter);
  else app.use(productionInfrastructureRouter);
  if (config.ecosystem.previewEnabled) app.use(ecosystemRouter);
  else app.use('/api/ecosystem', (_req, res) => res.status(503).json({ error: { code: 'ECOSYSTEM_PREVIEW_DISABLED', message: 'The embedded developer ecosystem preview is disabled in this environment.' } }));
  app.use(billingRouter);
  app.use(errorHandler);

  const server = await bootStep('Starting HTTP server', () => listen(app, PORT));
  server.on('error', (error) => logger.error('[HTTP] Server error.', safeErrorMetadata(error)));
  try {
    logger.info('[BOOT] HTTP server listening', { host: '0.0.0.0', port: PORT });

  if (config.realtime.enabled) {
    await bootStep('Starting Realtime', async () => {
      if (config.realtime.logicalReplicationEnabled) {
        const realtime = config.realtime;
        if (!config.databaseUrl || !realtime.logicalReplicationSlot || !realtime.logicalReplicationPublication
          || !realtime.cdcOrganizationId || !realtime.cdcProjectId || !realtime.cdcEnvironmentId) {
          logger.warn('Logical replication is enabled but its slot, publication, or project scope is incomplete; falling back to Database Engine capture.');
        } else {
          postgresCdc.setChangeSource(new PostgresLogicalReplicationSource({
            connectionString: config.databaseUrl,
            slotName: realtime.logicalReplicationSlot,
            publicationName: realtime.logicalReplicationPublication,
            organizationId: realtime.cdcOrganizationId,
            projectId: realtime.cdcProjectId,
            environmentId: realtime.cdcEnvironmentId,
          }));
        }
      }
      await realtimeEngine.start();
      await postgresCdc.start();
    });
  } else logger.info('[BOOT] Realtime disabled by REALTIME_ENABLED=false');
  if (config.backup.enabled) await bootStep('Starting backup scheduler', () => backupEngine.start());
  else logger.info('[BOOT] Backups disabled by BACKUP_ENABLED=false');
  if (config.infrastructure.previewEnabled) await bootStep('Starting infrastructure preview', () => infrastructureEngine.start());
  else await bootStep('Starting production infrastructure integration', () => productionInfrastructureEngine.start());
  if (config.realtime.enabled) await bootStep('Attaching Realtime WebSocket server', () => realtimeWebSocketServer.attach(server));
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
  logger.info('[BOOT] BrisaBase ready', { port: PORT });

  const shutdown = async () => {
    logger.info('🛑 Iniciando desligamento gracioso...');
    if (config.realtime.enabled) {
      await realtimeEngine.stop();
      await postgresCdc.stop();
    }
    if (config.functions.enabled) {
      if (config.testMode) functionEngine.stop();
      else await persistentFunctionEngine.stop();
    }
    messagingEngine.stop();
    advancedPlatformEngine.stop();
    webhookEngine.stop();
    if (config.observability.enabled) await observability.stop();
    if (config.backup.enabled) backupEngine.stop();
    if (config.infrastructure.previewEnabled) infrastructureEngine.stop();
    else await productionInfrastructureEngine.stop();
    if (config.realtime.enabled) realtimeWebSocketServer.close();
    if (config.storage.enabled && !config.testMode) realStorageEngine.stopLifecycleScheduler();
    await redisClient.close();
    await postgres.close();
    server.close(() => {
      logger.info('✅ Servidor encerrado com sucesso.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  logger.error('[BOOT] BrisaBase server failed to start.', safeErrorMetadata(err));
  process.exitCode = 1;
});
