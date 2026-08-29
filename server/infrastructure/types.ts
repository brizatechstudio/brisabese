export type NodeStatus = 'healthy' | 'degraded' | 'offline' | 'maintenance' | 'provisioning';
export type ServiceName = 'database' | 'api' | 'auth' | 'realtime' | 'storage' | 'functions' | 'security' | 'observability' | 'backup';
export type DeploymentStrategy = 'rolling' | 'blue-green' | 'canary' | 'immediate';
export type DeploymentStatus = 'pending' | 'deploying' | 'completed' | 'failed' | 'rolled_back';
export type LoadBalancingStrategy = 'round_robin' | 'least_connections' | 'weighted' | 'latency_based' | 'region_based';
export type ReplicationMode = 'sync' | 'async';
export type ReplicationStatus = 'healthy' | 'lagging' | 'failed' | 'paused';

export interface InfrastructureContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AvailabilityZone { id: string; region: string; status: 'available' | 'unavailable'; }
export interface InfrastructureRegion { id: string; code: string; name: string; continent: string; zones: AvailabilityZone[]; status: 'healthy' | 'degraded' | 'offline'; latencyMs: number; createdAt: string; }
export interface ProjectRegionConfig { organizationId: string; projectId: string; environmentId: string; primaryRegion: string; secondaryRegion: string; disasterRecoveryRegion: string; updatedAt: string; updatedBy: string; }

export interface InfrastructureNode {
  id: string;
  hostname: string;
  region: string;
  zone: string;
  status: NodeStatus;
  cpuUsage: number;
  memoryUsage: number;
  storageUsage: number;
  networkUsage: number;
  uptimeSeconds: number;
  activeConnections: number;
  runningFunctions: number;
  capacityWeight: number;
  latencyMs: number;
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInstance { id: string; service: ServiceName; nodeId: string; region: string; status: 'healthy' | 'degraded' | 'offline'; endpoint: string; version: string; weight: number; activeConnections: number; registeredAt: string; lastHeartbeatAt: string; capabilities: string[]; }
export interface DeploymentRecord { id: string; organizationId: string; projectId: string; environmentId: string; service: ServiceName; version: string; previousVersion?: string; strategy: DeploymentStrategy; status: DeploymentStatus; author: string; startedAt: string; completedAt?: string; durationMs?: number; canaryPercent?: number; provider: 'local' | 'docker' | 'kubernetes' | 'nomad'; rollbackOf?: string; }
export interface ScalingPolicy { id: string; service: ServiceName; minReplicas: number; maxReplicas: number; targetCpuPct: number; targetMemoryPct: number; targetConnections: number; enabled: boolean; }
export interface ScalingDecision { id: string; service: ServiceName; currentReplicas: number; desiredReplicas: number; reason: string; metrics: { cpuUsage: number; memoryUsage: number; activeConnections: number; queueDepth: number; requestsPerSecond: number; }; createdAt: string; applied: boolean; }
export interface ReplicationRule { id: string; organizationId: string; projectId: string; environmentId: string; resource: 'database' | 'storage' | 'secrets' | 'configuration' | 'policies' | 'functions' | 'metadata'; sourceRegion: string; targetRegions: string[]; mode: ReplicationMode; status: ReplicationStatus; lagMs: number; lastReplicatedAt?: string; }
export interface FailoverEvent { id: string; organizationId: string; projectId: string; environmentId: string; type: 'node' | 'region'; source: string; target: string; status: 'started' | 'completed' | 'failed'; reason: string; startedAt: string; completedAt?: string; }
export interface ScheduledWork { id: string; service: ServiceName; payload: unknown; priority: number; regionAffinity?: string; nodeAffinity?: string; maxAttempts: number; attempts: number; status: 'queued' | 'assigned' | 'completed' | 'dead_letter'; assignedNodeId?: string; createdAt: string; updatedAt: string; }
export interface CacheStats { namespace: string; entries: number; hits: number; misses: number; hitRate: number; provider: 'memory' | 'redis'; }
export interface NetworkConfig { internalTls: boolean; mtlsPrepared: boolean; serviceAuthentication: boolean; credentialRotationPrepared: boolean; globalGateway: { enabled: boolean; strategy: LoadBalancingStrategy; }; }
export interface InfrastructureHealth { status: 'healthy' | 'degraded' | 'unhealthy'; nodes: { healthy: number; degraded: number; offline: number }; services: { healthy: number; degraded: number; offline: number }; checkedAt: string; }
