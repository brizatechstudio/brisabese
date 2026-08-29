import dotenv from 'dotenv';
dotenv.config();

type DeploymentMode = 'managed' | 'self-hosted';

const testMode = process.env.BRISABASE_TEST_MODE === 'true' || process.argv.some((arg) => /server[\\/]tests[\\/]/.test(arg));
const nodeEnv = process.env.NODE_ENV || 'development';
const production = nodeEnv === 'production';
const integrationMode = process.env.BRISABASE_RUNTIME_MODE === 'integration';

function required(name: string, value: string | undefined): string {
  if (!value && !testMode) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} is required.`);
  return value || '';
}

function integer(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must be an integer between ${min} and ${max}.`);
  return parsed;
}

function durationSeconds(name: string, value: string | undefined, fallback: string, min: number, max: number): number {
  const source = value || fallback;
  const match = /^(\d+)(s|m|h|d)?$/i.exec(source.trim());
  if (!match) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must use a duration such as 15m or 30d.`);
  const unit = (match[2] || 's').toLowerCase();
  const multiplier = unit === 'd' ? 86_400 : unit === 'h' ? 3_600 : unit === 'm' ? 60 : 1;
  const seconds = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(seconds) || seconds < min || seconds > max) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must be between ${min} and ${max} seconds.`);
  return seconds;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

function deploymentMode(value: string | undefined): DeploymentMode {
  const mode = value || 'self-hosted';
  if (mode === 'managed' || mode === 'self-hosted') return mode;
  throw new Error('[BRISABASE CONFIGURATION ERROR] BRISABASE_DEPLOYMENT_MODE must be managed or self-hosted.');
}

function validPublicUrl(name: string, value: string, schemes: string[]): void {
  try {
    const url = new URL(value);
    if (!schemes.includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('scheme');
    if (production && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) throw new Error('host');
  } catch {
    throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must be a public ${schemes.join(' or ')} URL.`);
  }
}


function functionExecutorUrl(value: string, mode: DeploymentMode): URL {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || !url.hostname || (url.pathname && url.pathname !== '/')) throw new Error('invalid');
    if (url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) return url;
    if (mode === 'self-hosted' && url.protocol === 'http:' && url.hostname === 'functions-executor') return url;
    throw new Error('invalid');
  } catch {
    throw new Error('[BRISABASE CONFIGURATION ERROR] FUNCTIONS_EXECUTOR_URL must be a public HTTPS origin or http://functions-executor:<port> in self-hosted Compose mode.');
  }
}

function secureSecret(name: string, value: string | undefined): void {
  const secret = value || '';
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must contain at least 32 bytes of cryptographically random material.`);
  if (/^(?:brisabase|password|secret|change|replace|test|123456)/i.test(secret) || /(?:example|your[-_ ]?secret)/i.test(secret)) {
    throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} contains a placeholder or weak value.`);
  }
}

function securePassword(name: string, value: string | undefined): void {
  const secret = value || '';
  if (Buffer.byteLength(secret, 'utf8') < 16) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must contain at least 16 bytes of non-placeholder secret material.`);
  if (/^(?:brisabase|password|secret|change|replace|test|123456)/i.test(secret)) throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} contains a placeholder or weak value.`);
}

function postgresUrl(name: string, value: string | undefined): URL {
  try {
    const url = new URL(value || '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || !url.pathname || url.pathname === '/') throw new Error('invalid');
    return url;
  } catch {
    throw new Error(`[BRISABASE CONFIGURATION ERROR] ${name} must be a valid PostgreSQL URL with a database, username, and password.`);
  }
}

function redisUrl(value: string | undefined): URL {
  try {
    const url = new URL(value || '');
    if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || !url.password) throw new Error('invalid');
    return url;
  } catch {
    throw new Error('[BRISABASE CONFIGURATION ERROR] REDIS_URL must be a valid authenticated redis:// or rediss:// URL.');
  }
}

function databaseUrlUsesTls(value: string | undefined): boolean {
  try {
    const sslMode = new URL(value || '').searchParams.get('sslmode')?.toLowerCase();
    return ['require', 'verify-ca', 'verify-full'].includes(sslMode || '');
  } catch { return false; }
}

function validateCorsOrigins(source: string): void {
  const origins = source.split(',').map((value) => value.trim()).filter(Boolean);
  if (!origins.length) throw new Error('[BRISABASE CONFIGURATION ERROR] CORS_ALLOWED_ORIGINS is required in production.');
  if (origins.includes('*')) throw new Error('[BRISABASE CONFIGURATION ERROR] CORS_ALLOWED_ORIGINS cannot contain * in production.');
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('invalid');
    } catch {
      throw new Error('[BRISABASE CONFIGURATION ERROR] CORS_ALLOWED_ORIGINS must contain comma-separated public HTTPS origins only.');
    }
  }
}

function immutableRelease(value: string): boolean {
  return /^(?:v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?|[A-Fa-f0-9]{7,64}|[A-Za-z0-9][A-Za-z0-9._-]{6,127})$/.test(value)
    && !/^(?:latest|main|master|dev|local)$/i.test(value);
}

const mode = deploymentMode(process.env.BRISABASE_DEPLOYMENT_MODE);
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL || '';
const appUrl = process.env.APP_URL || renderExternalUrl;
const apiUrl = process.env.API_URL || appUrl;
const storagePublicUrl = process.env.STORAGE_PUBLIC_URL || appUrl;
const realtimePublicUrl = process.env.REALTIME_PUBLIC_URL || (() => {
  if (!renderExternalUrl) return '';
  try {
    const url = new URL('/realtime/v1/websocket', renderExternalUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch { return ''; }
})();
const corsAllowedOriginsRaw = process.env.CORS_ALLOWED_ORIGINS || renderExternalUrl;
const corsAllowedOrigins = corsAllowedOriginsRaw.split(',').map((value) => value.trim()).filter(Boolean);
const databaseUrl = process.env.DATABASE_URL || '';
const databaseMigrationUrl = process.env.DATABASE_MIGRATION_URL || databaseUrl;
const managedDatabaseTls = mode === 'managed' || databaseUrlUsesTls(databaseUrl);
const managedMigrationDatabaseTls = mode === 'managed' || databaseUrlUsesTls(databaseMigrationUrl);
const apiRequestsPerMinute = integrationMode
  ? integer('BRISABASE_TEST_RATE_LIMIT', process.env.BRISABASE_TEST_RATE_LIMIT, 100, 100, 100_000)
  : 100;
const alertWebhookConfigured = Boolean(process.env.ALERT_WEBHOOK_URL || process.env.ALERT_WEBHOOK_TOKEN);

export const config = {
  port: integer('PORT', process.env.PORT || process.env.API_PORT, 3000, 1, 65535),
  nodeEnv,
  production,
  deploymentMode: mode,
  release: process.env.BRISABASE_RELEASE || process.env.RENDER_GIT_COMMIT || '',
  databaseUrl,
  databaseMigrationUrl,
  redisUrl: process.env.REDIS_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtIssuer: process.env.JWT_ISSUER || 'brisabase',
  jwtAudience: process.env.JWT_AUDIENCE || 'brisabase-api',
  auth: {
    jwtAccessTokenTtlSeconds: durationSeconds('JWT_ACCESS_TOKEN_TTL', process.env.JWT_ACCESS_TOKEN_TTL, '15m', 60, 86_400),
    jwtRefreshTokenTtlSeconds: durationSeconds('JWT_REFRESH_TOKEN_TTL', process.env.JWT_REFRESH_TOKEN_TTL, '30d', 3_600, 31_536_000),
    bootstrapToken: process.env.ADMIN_BOOTSTRAP_TOKEN || '',
  },
  dataSource: process.env.VITE_DATA_SOURCE || 'api',
  testMode,
  integrationMode,
  rateLimits: { apiRequestsPerMinute },
  appUrl,
  apiUrl,
  corsAllowedOrigins,
  storagePublicUrl,
  realtimePublicUrl,
  trustProxy: integer('TRUST_PROXY', process.env.TRUST_PROXY, production ? 1 : 0, 0, 10),
  database: {
    poolMin: integer('DATABASE_POOL_MIN', process.env.DATABASE_POOL_MIN, 2, 0, 100),
    poolMax: integer('DATABASE_POOL_MAX', process.env.DATABASE_POOL_MAX, 20, 1, 100),
    // A Neon/managed connection must never be downgraded by an accidental
    // DATABASE_SSL=false when its deployment mode or URL requires TLS.
    ssl: bool(process.env.DATABASE_SSL) || managedDatabaseTls,
    sslRejectUnauthorized: bool(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, true),
    migrationSsl: bool(process.env.DATABASE_SSL) || managedMigrationDatabaseTls,
  },
  redis: { tls: bool(process.env.REDIS_TLS), prefix: process.env.REDIS_PREFIX || 'brisabase' },
  cookies: {
    secure: bool(process.env.COOKIE_SECURE, production),
    httpOnly: bool(process.env.COOKIE_HTTP_ONLY, true),
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
  functions: {
    // In production, execution is only allowed through the separate executor.
    enabled: bool(process.env.FUNCTIONS_ENABLED, !production),
    executorUrl: process.env.FUNCTIONS_EXECUTOR_URL || '',
    executorToken: process.env.FUNCTIONS_EXECUTOR_TOKEN || '',
    executionTimeoutMs: integer('FUNCTIONS_EXECUTION_TIMEOUT_MS', process.env.FUNCTIONS_EXECUTION_TIMEOUT_MS, 30_000, 1_000, 60_000),
    memoryLimitMb: integer('FUNCTIONS_MEMORY_LIMIT_MB', process.env.FUNCTIONS_MEMORY_LIMIT_MB, 256, 128, 1024),
    maxConcurrentExecutions: integer('FUNCTIONS_MAX_CONCURRENT_EXECUTIONS', process.env.FUNCTIONS_MAX_CONCURRENT_EXECUTIONS, 10, 1, 1_000),
  },
  observability: {
    enabled: bool(process.env.OBSERVABILITY_ENABLED, true), logLevel: process.env.LOG_LEVEL || 'info', logFormat: process.env.LOG_FORMAT || 'json', otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',
    prometheusEnabled: bool(process.env.PROMETHEUS_ENABLED), alertWebhookEnabled: bool(process.env.ALERT_WEBHOOK_ENABLED, alertWebhookConfigured), alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '', alertWebhookToken: process.env.ALERT_WEBHOOK_TOKEN || '',
    exportTimeoutMs: integer('OBSERVABILITY_EXPORT_TIMEOUT_MS', process.env.OBSERVABILITY_EXPORT_TIMEOUT_MS, 5_000, 500, 30_000),
    logRetentionDays: integer('OBSERVABILITY_LOG_RETENTION_DAYS', process.env.OBSERVABILITY_LOG_RETENTION_DAYS, 30, 1, 365_000),
    metricRetentionDays: integer('OBSERVABILITY_METRIC_RETENTION_DAYS', process.env.OBSERVABILITY_METRIC_RETENTION_DAYS, 30, 1, 365_000),
    traceRetentionDays: integer('OBSERVABILITY_TRACE_RETENTION_DAYS', process.env.OBSERVABILITY_TRACE_RETENTION_DAYS, 7, 1, 365_000),
  },
  backup: {
    enabled: bool(process.env.BACKUP_ENABLED, !production),
    certified: bool(process.env.BACKUP_RESTORE_CERTIFIED, !production),
    schedule: process.env.BACKUP_SCHEDULE || '0 3 * * *',
    retentionDays: integer('BACKUP_RETENTION_DAYS', process.env.BACKUP_RETENTION_DAYS, 30, 1, 3650),
    bucket: process.env.BACKUP_STORAGE_BUCKET || process.env.S3_BUCKET || '',
    pitrEnabled: bool(process.env.PITR_ENABLED, false),
    pitrProvider: process.env.PITR_PROVIDER || '',
  },
  hosting: {
    enabled: bool(process.env.HOSTING_ENABLED, true),
    customDomainsEnabled: bool(process.env.HOSTING_CUSTOM_DOMAINS_ENABLED, false),
    caddyAskToken: process.env.HOSTING_CADDY_ASK_TOKEN || '',
  },
  infrastructure: {
    previewEnabled: bool(process.env.INFRASTRUCTURE_PREVIEW_ENABLED, !production),
    region: process.env.BRISABASE_REGION || 'local-1',
    instanceId: process.env.BRISABASE_INSTANCE_ID || '',
    productionTier: process.env.BRISABASE_PRODUCTION_TIER || 'single-host',
    operationsToken: process.env.BRISABASE_OPERATIONS_TOKEN || '',
  },
  ecosystem: { previewEnabled: bool(process.env.ECOSYSTEM_PREVIEW_ENABLED, !production) },
  billing: {
    provider: (process.env.BILLING_PROVIDER || 'disabled').toLowerCase(),
    paddleApiKey: process.env.PADDLE_API_KEY || '',
    paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET || '',
    paddleEnvironment: (process.env.PADDLE_ENVIRONMENT || 'sandbox').toLowerCase(),
  },
  enterprise: { enabled: bool(process.env.ENTERPRISE_ENABLED, true) },
  realtime: {
    enabled: bool(process.env.REALTIME_ENABLED, true), logicalReplicationEnabled: process.env.REALTIME_LOGICAL_REPLICATION_ENABLED === 'true',
    logicalReplicationSlot: process.env.REALTIME_LOGICAL_REPLICATION_SLOT || process.env.REALTIME_REPLICATION_SLOT || '', logicalReplicationPublication: process.env.REALTIME_LOGICAL_REPLICATION_PUBLICATION || process.env.REALTIME_PUBLICATION || '',
    cdcOrganizationId: process.env.REALTIME_CDC_ORGANIZATION_ID || '', cdcProjectId: process.env.REALTIME_CDC_PROJECT_ID || '', cdcEnvironmentId: process.env.REALTIME_CDC_ENVIRONMENT_ID || '',
  },
  storage: {
    enabled: bool(process.env.STORAGE_ENABLED, true), provider: process.env.STORAGE_PROVIDER || (testMode ? 'local' : 'minio'), localDir: process.env.STORAGE_LOCAL_DIR,
    s3Endpoint: process.env.S3_ENDPOINT, s3Region: process.env.S3_REGION || 'us-east-1', s3Bucket: process.env.S3_BUCKET, s3AccessKey: process.env.S3_ACCESS_KEY, s3SecretKey: process.env.S3_SECRET_KEY,
    forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true), useSsl: bool(process.env.S3_USE_SSL),
  },
  smtp: { enabled: bool(process.env.SMTP_ENABLED, true), host: process.env.SMTP_HOST || '', port: Number(process.env.SMTP_PORT || '1025'), user: process.env.SMTP_USER || '', password: process.env.SMTP_PASSWORD || '', secure: process.env.SMTP_SECURE === 'true', from: process.env.SMTP_FROM || 'no-reply@brisabase.local' },
  publicUrl(pathname: string, target: 'app' | 'storage' = 'app'): string {
    const base = target === 'storage' ? storagePublicUrl : apiUrl;
    if (!base) return pathname;
    return new URL(pathname, base.endsWith('/') ? base : `${base}/`).toString();
  },
  assertRealRuntime(): void {
    if (testMode) return;
    required('DATABASE_URL', databaseUrl);
    required('REDIS_URL', process.env.REDIS_URL);
    required('JWT_SECRET', process.env.JWT_SECRET);
    required('AUTH_ENCRYPTION_KEY', process.env.AUTH_ENCRYPTION_KEY);
    if (config.storage.enabled) {
      required('S3_ENDPOINT', process.env.S3_ENDPOINT); required('S3_BUCKET', process.env.S3_BUCKET); required('S3_ACCESS_KEY', process.env.S3_ACCESS_KEY); required('S3_SECRET_KEY', process.env.S3_SECRET_KEY);
    }
    if (config.smtp.enabled) { required('SMTP_HOST', process.env.SMTP_HOST); required('SMTP_FROM', process.env.SMTP_FROM); }
    if (config.backup.enabled) required('BACKUP_ENCRYPTION_KEY', process.env.BACKUP_ENCRYPTION_KEY);
    if (config.backup.enabled && !config.storage.enabled) throw new Error('[BRISABASE CONFIGURATION ERROR] BACKUP_ENABLED requires STORAGE_ENABLED=true.');
    if (config.hosting.customDomainsEnabled && production) secureSecret('HOSTING_CADDY_ASK_TOKEN', process.env.HOSTING_CADDY_ASK_TOKEN);
    if (production) secureSecret('BRISABASE_OPERATIONS_TOKEN', process.env.BRISABASE_OPERATIONS_TOKEN);
    if (!['single-host','ha'].includes(config.infrastructure.productionTier)) throw new Error('[BRISABASE CONFIGURATION ERROR] BRISABASE_PRODUCTION_TIER must be single-host or ha.');
    if ((process.env.VITE_DATA_SOURCE || 'api') !== 'api') throw new Error('[BRISABASE CONFIGURATION ERROR] VITE_DATA_SOURCE must be api outside explicit test mode.');
    if (integrationMode && config.storage.enabled && (process.env.STORAGE_PROVIDER || 'minio').toLowerCase() === 'local') throw new Error('[BRISABASE CONFIGURATION ERROR] STORAGE_PROVIDER=local is forbidden in Docker integration mode.');
    if (process.env.API_KEY_HASH_ALGORITHM && process.env.API_KEY_HASH_ALGORITHM.toLowerCase() !== 'sha256') throw new Error('[BRISABASE CONFIGURATION ERROR] API_KEY_HASH_ALGORITHM must be sha256.');
    if (!production) return;

    if (process.env.BRISABASE_TEST_RATE_LIMIT || process.env.BRISABASE_LOAD_SMOKE) throw new Error('[BRISABASE CONFIGURATION ERROR] BRISABASE_TEST_RATE_LIMIT and BRISABASE_LOAD_SMOKE must not be set in production.');
    const database = postgresUrl('DATABASE_URL', databaseUrl);
    securePassword('DATABASE_URL password', decodeURIComponent(database.password));
    const migrationDatabase = postgresUrl('DATABASE_MIGRATION_URL', databaseMigrationUrl);
    securePassword('DATABASE_MIGRATION_URL password', decodeURIComponent(migrationDatabase.password));
    if (process.env.DATABASE_MIGRATION_URL && migrationDatabase.hostname.includes('-pooler')) throw new Error('[BRISABASE CONFIGURATION ERROR] DATABASE_MIGRATION_URL must be a direct PostgreSQL endpoint, not a pooler endpoint.');
    if (config.deploymentMode === 'managed' && !config.database.ssl) throw new Error('[BRISABASE CONFIGURATION ERROR] Managed deployments require DATABASE_SSL=true or sslmode=require in DATABASE_URL.');
    if (config.deploymentMode === 'managed' && !config.database.migrationSsl) throw new Error('[BRISABASE CONFIGURATION ERROR] Managed deployments require TLS for DATABASE_MIGRATION_URL.');
    const redis = redisUrl(process.env.REDIS_URL);
    securePassword('REDIS_URL password', decodeURIComponent(redis.password));
    if (config.deploymentMode === 'managed' && redis.protocol !== 'rediss:' && !config.redis.tls) throw new Error('[BRISABASE CONFIGURATION ERROR] Managed deployments require rediss:// or REDIS_TLS=true.');
    secureSecret('JWT_SECRET', process.env.JWT_SECRET); secureSecret('AUTH_ENCRYPTION_KEY', process.env.AUTH_ENCRYPTION_KEY); secureSecret('ADMIN_BOOTSTRAP_TOKEN', process.env.ADMIN_BOOTSTRAP_TOKEN);
    if (new Set([process.env.JWT_SECRET, process.env.AUTH_ENCRYPTION_KEY, process.env.ADMIN_BOOTSTRAP_TOKEN]).size !== 3) throw new Error('[BRISABASE CONFIGURATION ERROR] JWT_SECRET, AUTH_ENCRYPTION_KEY, and ADMIN_BOOTSTRAP_TOKEN must be distinct.');
    validPublicUrl('APP_URL', required('APP_URL', appUrl), ['https:']); validPublicUrl('API_URL', required('API_URL', apiUrl), ['https:']);
    if (config.storage.enabled) {
      securePassword('S3_SECRET_KEY', process.env.S3_SECRET_KEY);
      validPublicUrl('STORAGE_PUBLIC_URL', required('STORAGE_PUBLIC_URL', storagePublicUrl), ['https:']);
      if (config.deploymentMode === 'managed') {
        validPublicUrl('S3_ENDPOINT', required('S3_ENDPOINT', process.env.S3_ENDPOINT), ['https:']);
        if ((config.storage.provider || '').toLowerCase() === 'local') throw new Error('[BRISABASE CONFIGURATION ERROR] STORAGE_PROVIDER=local is forbidden in managed production.');
      }
    }
    if (config.realtime.enabled) validPublicUrl('REALTIME_PUBLIC_URL', required('REALTIME_PUBLIC_URL', realtimePublicUrl), ['wss:']);
    validateCorsOrigins(corsAllowedOriginsRaw);
    if (!config.cookies.secure || !config.cookies.httpOnly || !['lax', 'strict', 'none'].includes(config.cookies.sameSite)) throw new Error('[BRISABASE CONFIGURATION ERROR] Production cookies require COOKIE_SECURE=true, COOKIE_HTTP_ONLY=true, and a valid COOKIE_SAME_SITE value.');
    if (config.database.poolMin > config.database.poolMax) throw new Error('[BRISABASE CONFIGURATION ERROR] DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX.');
    if (!['disabled','paddle'].includes(config.billing.provider)) throw new Error('[BRISABASE CONFIGURATION ERROR] BILLING_PROVIDER must be disabled or paddle.');
    if (!['sandbox','live'].includes(config.billing.paddleEnvironment)) throw new Error('[BRISABASE CONFIGURATION ERROR] PADDLE_ENVIRONMENT must be sandbox or live.');
    if (config.billing.provider === 'paddle') {
      secureSecret('PADDLE_API_KEY', process.env.PADDLE_API_KEY);
      secureSecret('PADDLE_WEBHOOK_SECRET', process.env.PADDLE_WEBHOOK_SECRET);
      required('PADDLE_PRICE_PRO', process.env.PADDLE_PRICE_PRO);
      required('PADDLE_PRICE_TEAM', process.env.PADDLE_PRICE_TEAM);
      const paddleKey = String(process.env.PADDLE_API_KEY || '');
      const expectedPrefix = config.billing.paddleEnvironment === 'live' ? 'pdl_live_apikey_' : 'pdl_sdbx_apikey_';
      if (!paddleKey.startsWith(expectedPrefix)) throw new Error(`[BRISABASE CONFIGURATION ERROR] PADDLE_API_KEY must match PADDLE_ENVIRONMENT=${config.billing.paddleEnvironment}.`);
      if (!String(process.env.PADDLE_WEBHOOK_SECRET || '').startsWith('pdl_ntfset_')) throw new Error('[BRISABASE CONFIGURATION ERROR] PADDLE_WEBHOOK_SECRET must be a Paddle notification destination secret.');
      if (!String(process.env.PADDLE_PRICE_PRO || '').startsWith('pri_')) throw new Error('[BRISABASE CONFIGURATION ERROR] PADDLE_PRICE_PRO must be a Paddle price id.');
      if (!String(process.env.PADDLE_PRICE_TEAM || '').startsWith('pri_')) throw new Error('[BRISABASE CONFIGURATION ERROR] PADDLE_PRICE_TEAM must be a Paddle price id.');
    }

    if (config.functions.enabled) {
      const executorUrl = required('FUNCTIONS_EXECUTOR_URL', config.functions.executorUrl);
      const executorToken = required('FUNCTIONS_EXECUTOR_TOKEN', config.functions.executorToken);
      const parsedExecutorUrl = functionExecutorUrl(executorUrl, config.deploymentMode);
      secureSecret('FUNCTIONS_EXECUTOR_TOKEN', executorToken);
      if (parsedExecutorUrl.origin === new URL(apiUrl).origin) throw new Error('[BRISABASE CONFIGURATION ERROR] FUNCTIONS_EXECUTOR_URL must be a separate service origin from the BrisaBase API.');
      const callbackOrigin = required('FUNCTIONS_RPC_CALLBACK_ORIGIN', process.env.FUNCTIONS_RPC_CALLBACK_ORIGIN);
      const callback = new URL(callbackOrigin);
      const internalCallback = config.deploymentMode === 'self-hosted' && callback.protocol === 'http:' && callback.hostname === 'brisabase' && callback.pathname === '/';
      const publicCallback = callback.protocol === 'https:' && callback.hostname && !['localhost','127.0.0.1'].includes(callback.hostname) && callback.pathname === '/';
      if (!internalCallback && !publicCallback) throw new Error('[BRISABASE CONFIGURATION ERROR] FUNCTIONS_RPC_CALLBACK_ORIGIN must be a public HTTPS origin or http://brisabase:3000 in self-hosted Compose mode.');
      if ([process.env.JWT_SECRET, process.env.AUTH_ENCRYPTION_KEY, process.env.ADMIN_BOOTSTRAP_TOKEN].includes(executorToken)) throw new Error('[BRISABASE CONFIGURATION ERROR] FUNCTIONS_EXECUTOR_TOKEN must be distinct from authentication secrets.');
    }
    if (!config.observability.enabled) throw new Error('[BRISABASE CONFIGURATION ERROR] OBSERVABILITY_ENABLED must be true in production.');
    if (config.backup.enabled) {
      if (!process.env.BACKUP_ENCRYPTION_KEY) throw new Error('[BRISABASE CONFIGURATION ERROR] BACKUP_ENABLED=true requires BACKUP_ENCRYPTION_KEY.');
      if (!config.backup.bucket) throw new Error('[BRISABASE CONFIGURATION ERROR] Backup storage bucket is required.');
      secureSecret('BACKUP_ENCRYPTION_KEY', process.env.BACKUP_ENCRYPTION_KEY);
      if (config.backup.pitrEnabled && config.backup.pitrProvider !== 'neon') throw new Error('[BRISABASE CONFIGURATION ERROR] PITR_PROVIDER must be neon when PITR_ENABLED=true in this release.');
      if ([process.env.JWT_SECRET, process.env.AUTH_ENCRYPTION_KEY, process.env.ADMIN_BOOTSTRAP_TOKEN, process.env.FUNCTIONS_EXECUTOR_TOKEN].includes(process.env.BACKUP_ENCRYPTION_KEY)) throw new Error('[BRISABASE CONFIGURATION ERROR] BACKUP_ENCRYPTION_KEY must be distinct from authentication/executor secrets.');
    }
    if (config.infrastructure.productionTier === 'ha' && config.deploymentMode !== 'managed') throw new Error('[BRISABASE CONFIGURATION ERROR] BRISABASE_PRODUCTION_TIER=ha requires BRISABASE_DEPLOYMENT_MODE=managed; the bundled self-hosted Compose is intentionally single-host.');
        if (config.infrastructure.previewEnabled) throw new Error('[BRISABASE CONFIGURATION ERROR] INFRASTRUCTURE_PREVIEW_ENABLED=true is forbidden in production because the embedded infrastructure engine is a simulator.');
    if (config.ecosystem.previewEnabled) throw new Error('[BRISABASE CONFIGURATION ERROR] ECOSYSTEM_PREVIEW_ENABLED=true is forbidden in production because the embedded registry is not a persistent tenant control plane.');
    if (!immutableRelease(config.release)) throw new Error('[BRISABASE CONFIGURATION ERROR] BRISABASE_RELEASE or RENDER_GIT_COMMIT must be an immutable version or commit identifier.');
    if (config.observability.alertWebhookEnabled) {
      validPublicUrl('ALERT_WEBHOOK_URL', required('ALERT_WEBHOOK_URL', process.env.ALERT_WEBHOOK_URL), ['https:']); secureSecret('ALERT_WEBHOOK_TOKEN', process.env.ALERT_WEBHOOK_TOKEN);
      if ([process.env.JWT_SECRET, process.env.AUTH_ENCRYPTION_KEY, process.env.ADMIN_BOOTSTRAP_TOKEN].includes(process.env.ALERT_WEBHOOK_TOKEN)) throw new Error('[BRISABASE CONFIGURATION ERROR] ALERT_WEBHOOK_TOKEN must be distinct from authentication secrets.');
    } else if (alertWebhookConfigured) throw new Error('[BRISABASE CONFIGURATION ERROR] ALERT_WEBHOOK_ENABLED=false cannot be combined with alert webhook credentials.');
    if (config.observability.otlpEndpoint) validPublicUrl('OTEL_EXPORTER_OTLP_ENDPOINT', config.observability.otlpEndpoint, ['https:']);
  },
};
