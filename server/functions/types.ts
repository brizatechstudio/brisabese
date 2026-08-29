export type FunctionRuntime = 'nodejs20';
export type FunctionStatus = 'draft' | 'active' | 'failed' | 'disabled';
export type FunctionAccess = 'public' | 'authenticated' | 'service' | 'internal';
export type FunctionExecutionMode = 'user' | 'service';
export type FunctionInvocationSource = 'http' | 'cron' | 'queue' | 'internal';
export type FunctionLogLevel = 'info' | 'warn' | 'error';

export interface FunctionLimits {
  timeoutMs: 5_000 | 15_000 | 30_000 | 60_000;
  memoryMb: 128 | 256 | 512 | 1024;
  cpuProfile: 'shared' | 'standard' | 'performance';
}

export interface FunctionDefinition {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  slug: string;
  runtime: FunctionRuntime;
  status: FunctionStatus;
  access: FunctionAccess;
  /** Service mode is a deliberate, auditable RLS bypass for trusted backend work. */
  executionMode: FunctionExecutionMode;
  limits: FunctionLimits;
  currentVersion: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface FunctionVersion {
  id: string;
  functionId: string;
  version: number;
  code: string;
  status: 'draft' | 'published' | 'superseded';
  createdAt: string;
  createdBy: string;
  changeSummary?: string;
}

export interface FunctionSecret {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FunctionExecutionRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body?: unknown;
  userId?: string;
  role: string;
  source: FunctionInvocationSource;
  requestId?: string;
}

export interface FunctionExecutionResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface FunctionLog {
  id: string;
  functionId: string;
  version: number;
  executionId: string;
  level: FunctionLogLevel;
  message: string;
  data?: unknown;
  createdAt: string;
}

export interface FunctionExecution {
  id: string;
  functionId: string;
  version: number;
  source: FunctionInvocationSource;
  status: 'success' | 'error' | 'timeout';
  responseStatus?: number;
  durationMs: number;
  memoryMb: number;
  cpuProfile: FunctionLimits['cpuProfile'];
  error?: string;
  createdAt: string;
}

export interface FunctionMetrics {
  invocations: number;
  errors: number;
  timeouts: number;
  avgDurationMs: number;
  successRate: number;
  configuredMemoryMb: number;
  cpuProfile: FunctionLimits['cpuProfile'];
}

export interface FunctionCronJob {
  id: string;
  functionId: string;
  expression: string;
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface FunctionQueue {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  name: string;
  createdAt: string;
}

export interface FunctionQueueJob {
  id: string;
  queueId: string;
  functionId: string;
  payload: unknown;
  status: 'queued' | 'processing' | 'completed' | 'dead_letter';
  attempts: number;
  maxAttempts: number;
  priority: number;
  availableAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunctionOperationContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  claims?: Record<string, unknown>;
}

export interface CreateFunctionInput {
  name: string;
  slug?: string;
  code: string;
  access?: FunctionAccess;
  limits?: Partial<FunctionLimits>;
  changeSummary?: string;
  executionMode?: FunctionExecutionMode;
}
