export type ProjectStatus = 'active' | 'development' | 'maintenance' | 'paused';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  region: string;
  status: ProjectStatus;
  usersCount: string;
  databaseSize: string;
  storageSize: string;
  requestsCount: string;
  lastActivity: string;
  category: 'production' | 'development' | 'staging';
  iconColor: string;
  membersCount: number;
  /** Real local runtime metadata. Undefined for mock-only projects. */
  organizationId?: string;
  environmentId?: string;
  backendMode?: 'real' | 'mock';
  /** Compatibility metadata retained for migrated BrisaBase views. */
  environment?: 'production' | 'development' | 'staging';
  uptime?: number;
  storageUsedMb?: number;
}

export type AuthProvider = 'email' | 'google' | 'github' | 'apple';
export type UserStatus = 'active' | 'blocked' | 'inactive' | 'suspended' | 'invited';
export type UserRole = 'Owner' | 'Admin' | 'Developer' | 'Viewer';
export type TeamRole = UserRole | 'Billing';

export interface AuthUser {
  id: string;
  uid: string;
  name: string;
  email: string;
  avatar: string;
  provider: AuthProvider;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLogin: string;
  sessionsCount: number;
  location?: string;
  phone?: string;
}

export interface CollectionField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date';
  required: boolean;
}

export interface DatabaseCollection {
  id: string;
  name: string;
  description: string;
  count: number;
  size: string;
  fields: CollectionField[];
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseDocument {
  id: string;
  collectionId: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type StorageFolder = 'uploads' | 'images' | 'documents' | 'avatars' | 'backups' | 'products' | string;
export type FileType = 'image' | 'document' | 'video' | 'archive' | 'json' | 'code' | string;

export interface StorageFile {
  id: string;
  name: string;
  folder: StorageFolder;
  size: string;
  bytes: number;
  type: FileType;
  extension: string;
  mimeType: string;
  url: string;
  updatedAt: string;
}

export interface ServerlessFunction {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'deploying' | 'paused' | 'error';
  runtime: 'Node.js 20' | 'Python 3.11' | 'Go 1.22' | string;
  region: string;
  memory: string;
  timeout: number;
  executionsCount: string;
  executionsTotal: number;
  avgDuration: string;
  errorRate: string;
  lastExecuted: string;
  code: string;
  environmentVariables: { key: string; value: string }[];
}

export interface ApiEndpoint {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  description: string;
  status: 'active' | 'deprecated';
  headers?: Record<string, string>;
  mockResponse: Record<string, any>;
}

export interface ApiService {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  status: 'active' | 'degraded' | 'offline';
  requests: string;
  latency: string;
  errorRate: string;
  endpoints: ApiEndpoint[];
}

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG' | 'info' | 'warn' | 'error' | 'debug';
export type LogService = 'database' | 'auth' | 'storage' | 'functions' | 'apis' | 'system' | 'Database' | 'Auth' | 'Storage' | 'Functions' | 'Realtime' | 'ApiGateway' | string;

export interface LogItem {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: LogService;
  message: string;
  requestId?: string;
  duration?: string;
  status?: number;
  details?: Record<string, any>;
  timeAgo?: string;
  latency?: string;
  ip?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  service: string;
  read: boolean;
  timestamp: string;
  timeAgo: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  fullKey: string;
  role: 'Read' | 'Write' | 'Admin';
  createdAt: string;
  lastUsed: string;
}

export interface WebhookItem {
  id: string;
  name: string;
  event: string;
  url: string;
  status: 'active' | 'failed' | 'paused';
  lastDelivery: string;
  successRate: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: TeamRole;
  status: 'active' | 'invited';
  lastAccess: string;
  addedAt: string;
}

export interface RealtimeConnection {
  id: string;
  clientId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  channel: string;
  status: 'connected' | 'idle' | 'subscribed';
  connectedSince: string;
  lastEvent: string;
  ip: string;
  ping: number;
}
