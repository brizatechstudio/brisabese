export type Environment = 'production' | 'staging' | 'development';

export interface Project {
  id: string;
  organizationId?: string;
  name: string;
  slug: string;
  description: string;
  environment: Environment;
  region: string;
  status: 'online' | 'deploying' | 'maintenance' | 'offline';
  requests24h: number;
  usersCount: number;
  storageUsedMb: number;
  functionsCount: number;
  uptime: number;
  createdAt: string;
  updatedAt: string;
  databaseUrl: string;
  anonKey: string;
  serviceKey: string;
}

export interface ColumnDefinition {
  name: string;
  type: 'uuid' | 'text' | 'varchar' | 'char' | 'integer' | 'bigint' | 'numeric' | 'decimal' | 'real' | 'double precision' | 'boolean' | 'date' | 'timestamp' | 'timestamptz' | 'json' | 'jsonb';
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
}

export interface TableSchema {
  name: string;
  schema?: string;
  rowCount: number;
  sizeBytes: number;
  columns: ColumnDefinition[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TableRow {
  id: string;
  [key: string]: any;
}

export interface DbSchema {
  name: string;
  isSystem: boolean;
  tableCount: number;
  createdAt: string;
}

export interface DbIndex {
  id: string;
  name: string;
  tableName: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'brin';
  isUnique: boolean;
  sizeKb: number;
  createdAt?: string;
}

export interface DbFunction {
  id: string;
  name: string;
  schema: string;
  arguments: string;
  returnType: string;
  language: 'plpgsql' | 'sql';
  definition: string;
  createdAt: string;
}

export interface DbTrigger {
  id: string;
  name: string;
  tableName: string;
  event: string;
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
  functionName: string;
  enabled: boolean;
  createdAt?: string;
}

export interface SqlQueryHistory {
  id: string;
  query: string;
  executionTimeMs: number;
  rowCount: number;
  status: 'success' | 'error';
  executedAt: string;
  errorMessage?: string;
}

export interface DatabaseOverview {
  status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'maintenance';
  version: string;
  sizeMb: number;
  versioningEnabled?: boolean;
  tableCount: number;
  schemaCount?: number;
  activeConnections: number;
  maxConnections: number;
  totalRows?: number;
}

export interface DbRelationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
}

export interface DbMigration {
  id: string;
  version: string;
  name: string;
  sqlUp?: string;
  sqlDown?: string;
  appliedAt: string;
  executionTimeMs: number;
  status: 'success' | 'failed' | 'pending' | 'rolled_back';
  checksum?: string;
  rolledBackAt?: string;
}

export interface DbView {
  name: string;
  definition: string;
  createdAt?: string;
}


export interface DbMaterializedView {
  name: string;
  definition: string;
  populated: boolean;
  createdAt?: string;
}

export interface DatabaseRowFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'contains' | 'starts_with' | 'ends_with' | 'in' | 'isnull' | 'is';
  value: unknown;
}

export interface DatabaseRowSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface DbEnum {
  name: string;
  values: string[];
}

export interface DbSequence {
  name: string;
  startValue: number;
  minimumValue?: number;
  maximumValue?: number;
  increment: number;
  cycle: boolean;
}

export interface DbExtension {
  name: string;
  installedVersion?: string;
  defaultVersion?: string;
  installed: boolean;
  description?: string;
}

export interface SqlSavedQuery {
  id: string;
  name: string;
  query: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SqlExplainResult {
  queryId: string;
  executionTimeMs: number;
  analyze: boolean;
  plan: unknown;
}

export interface SqlMetrics {
  total: number;
  successCount: number;
  errorCount: number;
  avgExecutionTimeMs: number;
  p95ExecutionTimeMs: number;
  avgRowCount: number;
  last24hCount: number;
}

export interface DatabasePolicy {
  id: string;
  name: string;
  resourceType: 'table';
  resource: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  condition: string;
  enabled: boolean;
  updatedAt: string;
}

export interface DatabaseSchemaSnapshot {
  generatedAt: string;
  tables: TableSchema[];
  relationships: DbRelationship[];
  indexes: DbIndex[];
  views: DbView[];
  materializedViews: DbMaterializedView[];
  enums: DbEnum[];
  sequences: DbSequence[];
}

export interface DatabaseSchemaDiff {
  hasChanges: boolean;
  changes: Array<{ kind: string; object: string; detail: string }>;
  migrationSql: string[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  provider: 'email' | 'google' | 'github' | 'apple' | 'microsoft' | 'discord' | 'phone' | 'anonymous' | 'passkey' | 'magic_link';
  status: 'active' | 'blocked' | 'unverified';
  role: string;
  lastSignInAt: string;
  createdAt: string;
  phone?: string;
  phoneVerified?: boolean;
  isAnonymous?: boolean;
  customClaims?: Record<string, unknown>;
}

export interface AuthSessionInfo {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
  authMethod?: string;
  mfaVerified?: boolean;
}

export interface AuthSettings {
  require_email_verification: boolean;
  allow_signups: boolean;
  minimum_password_length: number;
  require_mfa: boolean;
  maximum_sessions: number;
  session_lifetime_seconds: number;
  jwt_access_lifetime_seconds: number;
  refresh_token_lifetime_seconds: number;
  magic_link_enabled: boolean;
  email_otp_enabled: boolean;
  phone_otp_enabled: boolean;
  anonymous_auth_enabled: boolean;
  passkeys_enabled: boolean;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_number: boolean;
  password_require_symbol: boolean;
  otp_lifetime_seconds: number;
  login_attempt_limit: number;
  login_lockout_seconds: number;
  allowed_redirect_origins: string[];
}

export interface AuthCustomRole {
  id: string;
  name: string;
  description: string;
  claims: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuthProviderConfig {
  id: string;
  name: string;
  provider: 'email' | 'google' | 'github' | 'apple' | 'microsoft' | 'discord' | 'phone' | 'anonymous' | 'passkey' | 'magic_link';
  enabled: boolean;
  clientId?: string;
  clientSecretConfigured?: boolean;
  redirectUrl: string;
}

export interface StorageBucket {
  id: string;
  name: string;
  isPublic: boolean;
  fileCount: number;
  sizeMb: number;
  allowedMimeTypes?: string[];
  versioningEnabled?: boolean;
  fileSizeLimitBytes?: number;
  corsConfig?: Array<{ allowedOrigins: string[]; allowedMethods: Array<'GET'|'HEAD'|'POST'|'PUT'|'DELETE'>; allowedHeaders?: string[]; exposedHeaders?: string[]; maxAgeSeconds?: number }>;
  lifecycleRules?: Array<{ id: string; enabled: boolean; prefix?: string; expireAfterDays?: number; abortIncompleteMultipartAfterDays?: number }>;
  createdAt: string;
}

export interface StorageFile {
  id: string;
  bucketId: string;
  name: string;
  path?: string;
  sizeBytes: number;
  mimeType: string;
  updatedAt: string;
  publicUrl: string;
  visibility: 'public' | 'private';
  etag?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
  version?: number;
}

export interface RealtimeChannel {
  id: string;
  name: string;
  activeConnections: number;
  eventsPerMin: number;
  status: 'online' | 'degraded' | 'offline';
  description: string;
}

export interface ServerlessFunction {
  id: string;
  name: string;
  slug: string;
  endpointUrl?: string;
  runtime: 'nodejs20' | 'python311' | 'go121';
  status: 'active' | 'deploying' | 'failed';
  invocationsTotal: number;
  successRate: number;
  avgDurationMs: number;
  lastExecutedAt: string;
  version: string;
  codeSnippet: string;
  envVars: Record<string, string>;
  memoryMb?: number;
  cpuProfile?: 'shared' | 'standard' | 'performance';
  access?: 'public' | 'authenticated' | 'service' | 'internal';
}

export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  service: 'database' | 'auth' | 'storage' | 'functions';
  requests24h: number;
  avgLatencyMs: number;
  successRate: number;
  description?: string;
  authRequired?: boolean;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  type: 'public' | 'secret' | 'service';
  keyPrefix: string;
  fullKeyMock: string;
  createdAt: string;
  lastUsedAt: string;
  status?: 'active' | 'inactive';
}

export interface WebhookItem {
  id: string;
  name: string;
  targetUrl: string;
  events: string[];
  status: 'active' | 'disabled' | 'failing';
  lastTriggeredAt: string;
  successRate: number;
  secret?: string;
}

export interface WebhookDeliveryItem {
  id: string;
  webhookId: string;
  eventType: string;
  status: 'pending' | 'processing' | 'failed' | 'delivered' | 'dead_letter';
  attemptCount: number;
  responseStatus?: number;
  responseTimeMs?: number;
  lastError?: string;
  createdAt: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  service: 'api' | 'auth' | 'database' | 'functions' | 'storage' | 'realtime';
  level: 'info' | 'warn' | 'error' | 'debug';
  method: string;
  statusCode: number;
  message: string;
  durationMs: number;
  ip: string;
  path?: string;
  userAgent?: string;
  payloadMock?: string;
}

export interface SystemMetrics {
  cpuUsagePct: number;
  memoryUsagePct: number;
  requestsPerSec: number;
  avgLatencyMs: number;
  errorRatePct: number;
  activeDbConnections: number;
  storageTotalGb: number;
  storageUsedGb: number;
}

export interface BackupItem {
  id: string;
  timestamp: string;
  sizeMb: number;
  type: 'automated' | 'manual' | 'full' | 'incremental' | 'differential';
  status: 'completed' | 'restoring' | 'failed' | 'verifying';
  downloadUrl: string;
  integrity?: 'verified' | 'failed' | 'pending';
  components?: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: 'Owner' | 'Admin' | 'Developer' | 'Viewer' | 'Billing';
  status: 'active' | 'pending';
  lastActive: string;
  addedAt?: string;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
}
