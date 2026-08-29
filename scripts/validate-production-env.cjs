/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

function parseEnvFile(filename) {
  const parsed = {};
  const content = fs.readFileSync(filename, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return parsed;
}

const file = process.argv[2] || process.env.BRISABASE_ENV_FILE || '.env';
const useProcessEnvironment = file === '--environment';
let parsed = {};
if (!useProcessEnvironment) {
  try { parsed = parseEnvFile(path.resolve(file)); }
  catch { console.error(`[BRISABASE CONFIGURATION ERROR] Cannot read ${file}.`); process.exit(1); }
}
const env = { ...process.env, ...parsed };
const failures = [];
const bool = (value, fallback = false) => value === undefined || value === '' ? fallback : value === 'true';
const required = (name) => { if (!env[name]) failures.push(`${name} is required`); };
const weak = (value, min = 32) => Buffer.byteLength(value || '', 'utf8') < min || /^(?:brisabase|password|secret|change|replace|test|123456)/i.test(value || '') || /(?:example|your[-_ ]?secret)/i.test(value || '');
const isPublicUrl = (value, protocol) => {
  try { const url = new URL(value); return url.protocol === protocol && Boolean(url.hostname) && !url.username && !url.password && !['localhost', '127.0.0.1'].includes(url.hostname); } catch { return false; }
};
const release = env.BRISABASE_RELEASE || env.RENDER_GIT_COMMIT || '';
const immutableRelease = (value) => /^(?:v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9._-]+)?|[A-Fa-f0-9]{7,64}|[A-Za-z0-9][A-Za-z0-9._-]{6,127})$/.test(value) && !/^(?:latest|main|master|dev|local)$/i.test(value);
const mode = env.BRISABASE_DEPLOYMENT_MODE || 'self-hosted';
const storageEnabled = bool(env.STORAGE_ENABLED, true);
const smtpEnabled = bool(env.SMTP_ENABLED, true);
const realtimeEnabled = bool(env.REALTIME_ENABLED, true);
const functionsEnabled = bool(env.FUNCTIONS_ENABLED, false);
const backupEnabled = bool(env.BACKUP_ENABLED, false);
const pitrEnabled = bool(env.PITR_ENABLED, false);
const customDomainsEnabled = bool(env.HOSTING_CUSTOM_DOMAINS_ENABLED, false);
const productionTier = env.BRISABASE_PRODUCTION_TIER || 'single-host';
const alertConfigured = Boolean(env.ALERT_WEBHOOK_URL || env.ALERT_WEBHOOK_TOKEN);
const alertWebhookEnabled = bool(env.ALERT_WEBHOOK_ENABLED, alertConfigured);
const renderExternalUrl = env.RENDER_EXTERNAL_URL || '';
const appUrl = env.APP_URL || renderExternalUrl;
const apiUrl = env.API_URL || appUrl;
const storagePublicUrl = env.STORAGE_PUBLIC_URL || appUrl;
const realtimePublicUrl = env.REALTIME_PUBLIC_URL || (() => {
  if (!renderExternalUrl) return '';
  try { const url = new URL('/realtime/v1/websocket', renderExternalUrl); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; return url.toString(); } catch { return ''; }
})();
const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS || renderExternalUrl;

function postgresConnection(name, value) {
  try {
    const url = new URL(value || '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password || !url.pathname || url.pathname === '/') throw new Error('invalid');
    return url;
  } catch { failures.push(`${name} must be a valid PostgreSQL URL with a database, username, and password`); return null; }
}

function redisConnection() {
  try {
    const url = new URL(env.REDIS_URL || '');
    if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || !url.password) throw new Error('invalid');
    return url;
  } catch { failures.push('REDIS_URL must be a valid authenticated redis:// or rediss:// URL'); return null; }
}


function validateAiProviderHosts() {
  const hosts = String(env.AI_PROVIDER_ALLOWED_HOSTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!hosts.length) { failures.push('AI_PROVIDER_ALLOWED_HOSTS must contain at least one approved public provider hostname'); return; }
  if (hosts.length > 50) { failures.push('AI_PROVIDER_ALLOWED_HOSTS cannot contain more than 50 hostnames'); return; }
  for (const host of hosts) {
    if (host === '*' || host === 'localhost' || /^https?:\/\//.test(host) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) {
      failures.push('AI_PROVIDER_ALLOWED_HOSTS must contain comma-separated public DNS hostnames only (no URLs, wildcards, localhost, or IP literals)'); return;
    }
  }
}
function validateRetention(name, fallback = 90) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 7 || value > 730) failures.push(`${name} must be an integer between 7 and 730 days`);
  return value;
}

function validateCors() {
  const origins = corsAllowedOrigins.split(',').map((value) => value.trim()).filter(Boolean);
  if (!origins.length) return;
  if (origins.includes('*')) { failures.push('CORS_ALLOWED_ORIGINS cannot contain *'); return; }
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('invalid');
    } catch { failures.push('CORS_ALLOWED_ORIGINS must contain comma-separated public HTTPS origins only'); return; }
  }
}

if (!['managed', 'self-hosted'].includes(mode)) failures.push('BRISABASE_DEPLOYMENT_MODE must be managed or self-hosted');
for (const name of ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'ADMIN_BOOTSTRAP_TOKEN']) required(name);
if (!appUrl) failures.push('APP_URL is required (or RENDER_EXTERNAL_URL on Render)');
if (!apiUrl) failures.push('API_URL is required (or RENDER_EXTERNAL_URL on Render)');
if (!corsAllowedOrigins) failures.push('CORS_ALLOWED_ORIGINS is required (or RENDER_EXTERNAL_URL on Render)');
if (storageEnabled) {
  for (const name of ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET']) required(name);
  if (!storagePublicUrl) failures.push('STORAGE_PUBLIC_URL is required (or RENDER_EXTERNAL_URL on Render)');
}
if (smtpEnabled) for (const name of ['SMTP_HOST', 'SMTP_FROM']) required(name);
if (realtimeEnabled && !realtimePublicUrl) failures.push('REALTIME_PUBLIC_URL is required (or RENDER_EXTERNAL_URL on Render)');
if (env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
if (env.VITE_DATA_SOURCE !== 'api') failures.push('VITE_DATA_SOURCE must be api');
if (env.BRISABASE_TEST_RATE_LIMIT || env.BRISABASE_LOAD_SMOKE) failures.push('BRISABASE_TEST_RATE_LIMIT and BRISABASE_LOAD_SMOKE must not be set in production');
for (const name of ['JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'ADMIN_BOOTSTRAP_TOKEN']) if (weak(env[name])) failures.push(`${name} must be at least 32 bytes of non-placeholder random material`);
if (new Set(['JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'ADMIN_BOOTSTRAP_TOKEN'].map((name) => env[name])).size !== 3) failures.push('JWT_SECRET, AUTH_ENCRYPTION_KEY, and ADMIN_BOOTSTRAP_TOKEN must be distinct');
for (const name of ['JWT_SECRET_PREVIOUS', 'AUTH_ENCRYPTION_KEY_PREVIOUS']) if (env[name] && weak(env[name])) failures.push(`${name} must be at least 32 bytes of non-placeholder random material when configured`);
if (env.JWT_SECRET_PREVIOUS && env.JWT_SECRET_PREVIOUS === env.JWT_SECRET) failures.push('JWT_SECRET_PREVIOUS must differ from JWT_SECRET');
if (env.AUTH_ENCRYPTION_KEY_PREVIOUS && env.AUTH_ENCRYPTION_KEY_PREVIOUS === env.AUTH_ENCRYPTION_KEY) failures.push('AUTH_ENCRYPTION_KEY_PREVIOUS must differ from AUTH_ENCRYPTION_KEY');
const twilioFields = ['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER'];
if (twilioFields.some((name)=>Boolean(env[name])) && !twilioFields.every((name)=>Boolean(env[name]))) failures.push('Twilio SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER together');
if (env.AUTH_WEBAUTHN_ORIGINS) for (const origin of env.AUTH_WEBAUTHN_ORIGINS.split(',').map((v)=>v.trim()).filter(Boolean)) if (!isPublicUrl(origin, 'https:')) failures.push('AUTH_WEBAUTHN_ORIGINS must contain public HTTPS origins in production');
if (functionsEnabled) {
  for (const name of ['FUNCTIONS_EXECUTOR_URL','FUNCTIONS_EXECUTOR_TOKEN','FUNCTIONS_RPC_CALLBACK_ORIGIN']) required(name);
  if (weak(env.FUNCTIONS_EXECUTOR_TOKEN)) failures.push('FUNCTIONS_EXECUTOR_TOKEN must be at least 32 bytes of non-placeholder random material');
  if ([env.JWT_SECRET, env.AUTH_ENCRYPTION_KEY, env.ADMIN_BOOTSTRAP_TOKEN].includes(env.FUNCTIONS_EXECUTOR_TOKEN)) failures.push('FUNCTIONS_EXECUTOR_TOKEN must be distinct from authentication secrets');
  try {
    const executor = new URL(env.FUNCTIONS_EXECUTOR_URL || '');
    const internal = mode === 'self-hosted' && executor.protocol === 'http:' && executor.hostname === 'functions-executor' && executor.pathname === '/' && !executor.search && !executor.hash;
    const publicHttps = executor.protocol === 'https:' && Boolean(executor.hostname) && !['localhost','127.0.0.1'].includes(executor.hostname) && executor.pathname === '/' && !executor.search && !executor.hash;
    if (!internal && !publicHttps) failures.push('FUNCTIONS_EXECUTOR_URL must be public HTTPS or http://functions-executor:<port> in self-hosted mode');
  } catch { failures.push('FUNCTIONS_EXECUTOR_URL must be a valid executor origin'); }
  try {
    const callback = new URL(env.FUNCTIONS_RPC_CALLBACK_ORIGIN || '');
    const internal = mode === 'self-hosted' && callback.protocol === 'http:' && callback.hostname === 'brisabase' && callback.pathname === '/' && !callback.search && !callback.hash;
    const publicHttps = callback.protocol === 'https:' && Boolean(callback.hostname) && !['localhost','127.0.0.1'].includes(callback.hostname) && callback.pathname === '/' && !callback.search && !callback.hash;
    if (!internal && !publicHttps) failures.push('FUNCTIONS_RPC_CALLBACK_ORIGIN must be public HTTPS or http://brisabase:3000 in self-hosted mode');
  } catch { failures.push('FUNCTIONS_RPC_CALLBACK_ORIGIN must be a valid API origin'); }
}
if (env.OBSERVABILITY_ENABLED !== 'true') failures.push('OBSERVABILITY_ENABLED must be true in production');
if (backupEnabled) {
  if (!storageEnabled) failures.push('BACKUP_ENABLED requires STORAGE_ENABLED=true');
  for (const name of ['BACKUP_ENCRYPTION_KEY','BACKUP_STORAGE_BUCKET']) required(name);
  if (weak(env.BACKUP_ENCRYPTION_KEY)) failures.push('BACKUP_ENCRYPTION_KEY must be at least 32 bytes of non-placeholder random material');
  if ([env.JWT_SECRET, env.AUTH_ENCRYPTION_KEY, env.ADMIN_BOOTSTRAP_TOKEN, env.FUNCTIONS_EXECUTOR_TOKEN].filter(Boolean).includes(env.BACKUP_ENCRYPTION_KEY)) failures.push('BACKUP_ENCRYPTION_KEY must be distinct from authentication/executor secrets');
}
if (pitrEnabled) {
  if ((env.PITR_PROVIDER || '') !== 'neon') failures.push('PITR_PROVIDER must be neon when PITR_ENABLED=true');
  for (const name of ['NEON_PROJECT_ID','NEON_API_KEY','BRISABASE_PITR_OPERATOR_TOKEN']) required(name);
  if (weak(env.NEON_API_KEY, 20)) failures.push('NEON_API_KEY must contain non-placeholder provider credentials');
  if (weak(env.BRISABASE_PITR_OPERATOR_TOKEN)) failures.push('BRISABASE_PITR_OPERATOR_TOKEN must be at least 32 bytes of non-placeholder random material');
}
required('BRISABASE_OPERATIONS_TOKEN');
if (weak(env.BRISABASE_OPERATIONS_TOKEN)) failures.push('BRISABASE_OPERATIONS_TOKEN must be at least 32 bytes of non-placeholder random material');
if ([env.JWT_SECRET,env.AUTH_ENCRYPTION_KEY,env.ADMIN_BOOTSTRAP_TOKEN,env.FUNCTIONS_EXECUTOR_TOKEN,env.BACKUP_ENCRYPTION_KEY,env.BRISABASE_PITR_OPERATOR_TOKEN].filter(Boolean).includes(env.BRISABASE_OPERATIONS_TOKEN)) failures.push('BRISABASE_OPERATIONS_TOKEN must be distinct from other platform secrets');
if (customDomainsEnabled) {
  required('HOSTING_CADDY_ASK_TOKEN');
  if (weak(env.HOSTING_CADDY_ASK_TOKEN)) failures.push('HOSTING_CADDY_ASK_TOKEN must be at least 32 bytes of non-placeholder random material');
}
if (!['single-host','ha'].includes(productionTier)) failures.push('BRISABASE_PRODUCTION_TIER must be single-host or ha');
if (productionTier === 'ha' && mode !== 'managed') failures.push('BRISABASE_PRODUCTION_TIER=ha requires BRISABASE_DEPLOYMENT_MODE=managed; bundled self-hosted Compose is intentionally single-host');
if (env.INFRASTRUCTURE_PREVIEW_ENABLED === 'true') failures.push('INFRASTRUCTURE_PREVIEW_ENABLED must remain false in production because the bundled engine is a simulator');
if (env.ECOSYSTEM_PREVIEW_ENABLED === 'true') failures.push('ECOSYSTEM_PREVIEW_ENABLED must remain false in production because the bundled registry is an in-memory preview');
if (!immutableRelease(release)) failures.push('BRISABASE_RELEASE or RENDER_GIT_COMMIT must be an immutable version or commit identifier');
if (!isPublicUrl(appUrl, 'https:')) failures.push('APP_URL must be a public https URL');
if (!isPublicUrl(apiUrl, 'https:')) failures.push('API_URL must be a public https URL');
if (storageEnabled && !isPublicUrl(storagePublicUrl, 'https:')) failures.push('STORAGE_PUBLIC_URL must be a public https URL');
if (realtimeEnabled && !isPublicUrl(realtimePublicUrl, 'wss:')) failures.push('REALTIME_PUBLIC_URL must be a public wss URL');
if (env.OTEL_EXPORTER_OTLP_ENDPOINT && !isPublicUrl(env.OTEL_EXPORTER_OTLP_ENDPOINT, 'https:')) failures.push('OTEL_EXPORTER_OTLP_ENDPOINT must be a public https URL when configured');
validateCors();
validateAiProviderHosts();
validateRetention('ANALYTICS_RETENTION_DAYS');
validateRetention('APP_QUALITY_RETENTION_DAYS');
validateRetention('AI_USAGE_RETENTION_DAYS');

const billingProvider = String(env.BILLING_PROVIDER || 'disabled').toLowerCase();
const paddleEnvironment = String(env.PADDLE_ENVIRONMENT || 'sandbox').toLowerCase();
if (!['disabled','paddle'].includes(billingProvider)) failures.push('BILLING_PROVIDER must be disabled or paddle');
if (!['sandbox','live'].includes(paddleEnvironment)) failures.push('PADDLE_ENVIRONMENT must be sandbox or live');
if (billingProvider === 'paddle') {
  for (const name of ['PADDLE_API_KEY','PADDLE_WEBHOOK_SECRET','PADDLE_PRICE_PRO','PADDLE_PRICE_TEAM']) required(name);
  const expectedPrefix = paddleEnvironment === 'live' ? 'pdl_live_apikey_' : 'pdl_sdbx_apikey_';
  if (!String(env.PADDLE_API_KEY || '').startsWith(expectedPrefix) || weak(env.PADDLE_API_KEY)) failures.push(`PADDLE_API_KEY must be a non-placeholder ${paddleEnvironment} Paddle API key with at least 32 bytes`);
  if (!String(env.PADDLE_WEBHOOK_SECRET || '').startsWith('pdl_ntfset_') || weak(env.PADDLE_WEBHOOK_SECRET)) failures.push('PADDLE_WEBHOOK_SECRET must be a non-placeholder Paddle notification destination secret with at least 32 bytes');
  if (env.PADDLE_PRICE_PRO && !String(env.PADDLE_PRICE_PRO).startsWith('pri_')) failures.push('PADDLE_PRICE_PRO must be a Paddle price id');
  if (env.PADDLE_PRICE_TEAM && !String(env.PADDLE_PRICE_TEAM).startsWith('pri_')) failures.push('PADDLE_PRICE_TEAM must be a Paddle price id');
}

if (env.COOKIE_SECURE !== 'true' || env.COOKIE_HTTP_ONLY !== 'true' || !['lax', 'strict', 'none'].includes(env.COOKIE_SAME_SITE || 'lax')) failures.push('Production cookies require COOKIE_SECURE=true, COOKIE_HTTP_ONLY=true, and a valid COOKIE_SAME_SITE value');
if (env.API_KEY_HASH_ALGORITHM && env.API_KEY_HASH_ALGORITHM.toLowerCase() !== 'sha256') failures.push('API_KEY_HASH_ALGORITHM must be sha256');

const database = postgresConnection('DATABASE_URL', env.DATABASE_URL);
if (database && weak(decodeURIComponent(database.password), 16)) failures.push('DATABASE_URL password must be at least 16 bytes and must not use a placeholder or default');
const migrationDatabase = postgresConnection('DATABASE_MIGRATION_URL', env.DATABASE_MIGRATION_URL || env.DATABASE_URL);
if (migrationDatabase && weak(decodeURIComponent(migrationDatabase.password), 16)) failures.push('DATABASE_MIGRATION_URL password must be at least 16 bytes and must not use a placeholder or default');
if (env.DATABASE_MIGRATION_URL && migrationDatabase?.hostname.includes('-pooler')) failures.push('DATABASE_MIGRATION_URL must use a direct PostgreSQL endpoint, not a pooler endpoint');
const redis = redisConnection();
if (redis && weak(decodeURIComponent(redis.password), 16)) failures.push('REDIS_URL password must be at least 16 bytes and must not use a placeholder or default');
if (storageEnabled && weak(env.S3_SECRET_KEY, 16)) failures.push('S3_SECRET_KEY must be at least 16 bytes and must not use a placeholder or default');

if (alertWebhookEnabled) {
  required('ALERT_WEBHOOK_URL'); required('ALERT_WEBHOOK_TOKEN');
  if (!isPublicUrl(env.ALERT_WEBHOOK_URL, 'https:')) failures.push('ALERT_WEBHOOK_URL must be a public https URL');
  if (weak(env.ALERT_WEBHOOK_TOKEN)) failures.push('ALERT_WEBHOOK_TOKEN must be at least 32 bytes of non-placeholder random material');
  if ([env.JWT_SECRET, env.AUTH_ENCRYPTION_KEY, env.ADMIN_BOOTSTRAP_TOKEN].includes(env.ALERT_WEBHOOK_TOKEN)) failures.push('ALERT_WEBHOOK_TOKEN must be distinct from authentication secrets');
} else if (alertConfigured) failures.push('ALERT_WEBHOOK_ENABLED=false cannot be combined with alert webhook credentials');

if (mode === 'managed') {
  if (database && env.DATABASE_SSL !== 'true' && !['require', 'verify-ca', 'verify-full'].includes(database.searchParams.get('sslmode')?.toLowerCase())) failures.push('Managed deployments require DATABASE_SSL=true or sslmode=require in DATABASE_URL');
  if (migrationDatabase && env.DATABASE_SSL !== 'true' && !['require', 'verify-ca', 'verify-full'].includes(migrationDatabase.searchParams.get('sslmode')?.toLowerCase())) failures.push('Managed deployments require TLS in DATABASE_MIGRATION_URL');
  if (redis && redis.protocol !== 'rediss:' && env.REDIS_TLS !== 'true') failures.push('Managed deployments require rediss:// or REDIS_TLS=true');
  if (storageEnabled) {
    if (!isPublicUrl(env.S3_ENDPOINT, 'https:')) failures.push('S3_ENDPOINT must be a public https URL in managed mode');
    if ((env.STORAGE_PROVIDER || '').toLowerCase() === 'local') failures.push('STORAGE_PROVIDER=local is forbidden in managed production');
  }
} else if (mode === 'self-hosted') {
  if (!storageEnabled) failures.push('STORAGE_ENABLED must remain true in self-hosted Compose mode');
  for (const name of ['APP_DOMAIN', 'STORAGE_DOMAIN', 'ACME_EMAIL', 'DATABASE_APP_USER', 'DATABASE_APP_PASSWORD', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD', 'NODE_IMAGE', 'POSTGRES_IMAGE', 'REDIS_IMAGE', 'MINIO_IMAGE', 'MINIO_MC_IMAGE', 'CADDY_IMAGE', ...(functionsEnabled ? ['FUNCTIONS_IMAGE'] : [])]) required(name);
  for (const name of ['POSTGRES_PASSWORD', 'DATABASE_APP_PASSWORD', 'REDIS_PASSWORD', 'MINIO_ROOT_PASSWORD']) if (weak(env[name], 16)) failures.push(`${name} must be at least 16 bytes and must not use a placeholder or default`);
  for (const name of ['NODE_IMAGE', 'POSTGRES_IMAGE', 'REDIS_IMAGE', 'MINIO_IMAGE', 'MINIO_MC_IMAGE', 'CADDY_IMAGE', ...(functionsEnabled ? ['FUNCTIONS_IMAGE'] : [])]) if (!/^[^\s@]+(?::[^\s@]+)?@sha256:[a-f0-9]{64}$/i.test(env[name] || '')) failures.push(`${name} must use an immutable image reference ending in @sha256:<64 hex>`);
  for (const name of ['APP_DOMAIN', 'STORAGE_DOMAIN']) if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(env[name] || '')) failures.push(`${name} must be a public domain name`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ACME_EMAIL || '')) failures.push('ACME_EMAIL must be a valid certificate contact address');
  if (env.MINIO_ROOT_USER === env.S3_ACCESS_KEY) failures.push('MINIO_ROOT_USER must be distinct from S3_ACCESS_KEY so the application never runs with the MinIO root identity');
  if (env.MINIO_ROOT_PASSWORD === env.S3_SECRET_KEY) failures.push('MINIO_ROOT_PASSWORD must be distinct from S3_SECRET_KEY so the application never receives the MinIO root secret');
  if (database) {
    if (decodeURIComponent(database.username) !== env.DATABASE_APP_USER) failures.push('DATABASE_URL must use DATABASE_APP_USER');
    if (decodeURIComponent(database.password) !== env.DATABASE_APP_PASSWORD) failures.push('DATABASE_URL password must match DATABASE_APP_PASSWORD');
    if (database.username === env.POSTGRES_USER) failures.push('DATABASE_URL must not use the PostgreSQL bootstrap administrator');
  }
}

if (failures.length) { console.error('[BRISABASE CONFIGURATION ERROR]'); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`[BRISABASE] production environment validation passed (${mode}).`);
