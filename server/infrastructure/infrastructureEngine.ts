import { db } from '../db/database';
import { config } from '../config';
import { observability } from '../observability';
import { Autoscaler } from './autoscaler';
import { CacheManager } from './cacheManager';
import { ClusterManager } from './clusterManager';
import { DeploymentManager } from './deploymentManager';
import { FailoverManager } from './failoverManager';
import { InfrastructureHealthManager } from './healthManager';
import { LoadBalancer } from './loadBalancer';
import { NetworkManager } from './networkManager';
import { NodeManager } from './nodeManager';
import { RegionManager } from './regionManager';
import { ReplicationManager } from './replicationManager';
import { InfrastructureScheduler } from './scheduler';
import { ServiceDiscovery } from './serviceDiscovery';
import { InfrastructureTelemetry } from './telemetry';
import { InfrastructureContext, InfrastructureNode, ServiceName } from './types';

const SERVICES: ServiceName[] = ['database', 'api', 'auth', 'realtime', 'storage', 'functions', 'security', 'observability', 'backup'];
export class InfrastructureEngine {
  public readonly regions = new RegionManager();
  public readonly nodes = new NodeManager();
  public readonly cluster = new ClusterManager(this.nodes);
  public readonly services = new ServiceDiscovery();
  public readonly loadBalancer = new LoadBalancer(this.nodes, this.services);
  public readonly autoscaler = new Autoscaler();
  public readonly cache = new CacheManager(process.env.REDIS_URL ? 'redis' : 'memory');
  public readonly replication = new ReplicationManager();
  public readonly deployments = new DeploymentManager();
  public readonly health = new InfrastructureHealthManager(this.nodes, this.services);
  public readonly failover = new FailoverManager(this.nodes, this.regions, this.services);
  public readonly scheduler = new InfrastructureScheduler(this.loadBalancer);
  public readonly network = new NetworkManager(this.loadBalancer, this.regions);
  public readonly telemetry = new InfrastructureTelemetry();
  private started = false;
  private assertManage(context: InfrastructureContext): void { if (!['owner', 'admin', 'service', 'service_role'].includes(context.role)) throw new Error('Only owner, admin, or service roles can manage infrastructure.'); }
  private audit(context: InfrastructureContext, action: string, resourceId?: string, metadata: Record<string, unknown> = {}): void { db.logAudit({ organization_id: context.organizationId, project_id: context.projectId, environment_id: context.environmentId, user_id: context.userId || 'system', action, resource_type: 'infrastructure', resource_id: resourceId, metadata: { ...metadata, requestId: context.requestId }, ip_address: context.ip, user_agent: context.userAgent }); this.telemetry.event(action, context, metadata); }
  public start(): void {
    if (this.started) return;
    this.started = true;
    if (!config.testMode) {
      // No fabricated regions/nodes/services may be shown as a local Docker
      // cluster. The Phase 11 logical fixture is only exercised by its tests.
      observability.health.register('infrastructure', () => ({
        status: 'degraded',
        details: { mode: 'migration-required', reason: 'A persistent infrastructure control plane has not been provisioned.' },
      }));
      return;
    }
    const seed: Array<[string, string, string]> = [['sa-east-1', 'sa-east-1a', 'primary'], ['sa-east-1', 'sa-east-1b', 'secondary'], ['us-east-1', 'us-east-1a', 'secondary'], ['eu-west-1', 'eu-west-1a', 'dr']];
    seed.forEach(([region, zone, role], index) => {
      const node = this.nodes.register({ hostname: `bb-${region}-${index + 1}`, region, zone, status: 'healthy', cpuUsage: 18 + index * 7, memoryUsage: 25 + index * 6, storageUsage: 20 + index * 4, networkUsage: 12 + index * 5, activeConnections: 10 + index * 8, runningFunctions: index + 1, capacityWeight: role === 'primary' ? 100 : 70, latencyMs: 12 + index * 20, labels: { role, provider: 'logical' } });
      SERVICES.forEach((service, offset) => {
        if (index < 2 || ['api', 'functions', 'realtime'].includes(service)) this.services.register({ service, nodeId: node.id, region, status: 'healthy', endpoint: `https://${service}.${region}.internal`, version: 'v1', weight: node.capacityWeight - offset, activeConnections: node.activeConnections, capabilities: ['tls', 'service-auth', 'mtls-ready'] });
      });
    });
    observability.health.register('infrastructure', () => ({ status: this.health.check().status === 'unhealthy' ? 'unhealthy' : this.health.check().status, details: this.overview() }));
  }
  public stop(): void { this.started = false; }
  public addNode(context: InfrastructureContext, input: Omit<InfrastructureNode, 'id' | 'createdAt' | 'updatedAt' | 'uptimeSeconds'>): InfrastructureNode { this.assertManage(context); if (!this.regions.get(input.region)) throw new Error('Node region is not configured.'); const node = this.nodes.register(input); this.audit(context, 'node.joined', node.id, { region: node.region, zone: node.zone }); return node; }
  public evaluateScaling(context: InfrastructureContext, service: ServiceName, metrics: { cpuUsage: number; memoryUsage: number; activeConnections: number; queueDepth: number; requestsPerSecond: number }): ReturnType<Autoscaler['evaluate']> { this.assertManage(context); const current = this.services.list(service).filter((instance) => instance.status !== 'offline').length; const decision = this.autoscaler.evaluate(service, current, metrics); if (decision.desiredReplicas > current) { const region = this.regions.chooseAvailable(context); for (let index = current; index < decision.desiredReplicas; index += 1) { const node = this.nodes.register({ hostname: `auto-${service}-${Date.now().toString(36)}-${index}`, region, zone: `${region}a`, status: 'provisioning', cpuUsage: 0, memoryUsage: 0, storageUsage: 0, networkUsage: 0, activeConnections: 0, runningFunctions: 0, capacityWeight: 50, latencyMs: this.regions.get(region)?.latencyMs || 100, labels: { autoscaled: 'true', service } }); this.nodes.setStatus(node.id, 'healthy'); this.services.register({ service, nodeId: node.id, region, status: 'healthy', endpoint: `https://${service}.${region}.internal`, version: 'v1', weight: 50, activeConnections: 0, capabilities: ['tls', 'service-auth', 'mtls-ready'] }); } } const applied = this.autoscaler.markApplied(decision.id); this.audit(context, 'autoscaling.triggered', decision.id, { service, current, desired: decision.desiredReplicas, reason: decision.reason }); return applied; }
  public async deploy(context: InfrastructureContext, input: Parameters<DeploymentManager['deploy']>[1]) { this.assertManage(context); this.audit(context, 'deployment.started', undefined, { service: input.service, version: input.version, strategy: input.strategy || 'rolling' }); const deployment = await this.deployments.deploy(context, input); this.audit(context, 'deployment.finished', deployment.id, { service: deployment.service, version: deployment.version, status: deployment.status }); return deployment; }
  public async rollback(context: InfrastructureContext, id: string) { this.assertManage(context); const deployment = await this.deployments.rollback(context, id); this.audit(context, 'deployment.rollback', deployment.id, { rollbackOf: deployment.rollbackOf }); return deployment; }
  public failNode(context: InfrastructureContext, id: string, reason?: string) { this.assertManage(context); this.audit(context, 'failover.started', id, { type: 'node' }); const event = this.failover.failNode(context, id, reason); this.audit(context, 'failover.finished', event.id, { type: 'node', target: event.target }); return event; }
  public failRegion(context: InfrastructureContext, region: string, reason?: string) { this.assertManage(context); this.audit(context, 'failover.started', region, { type: 'region' }); const event = this.failover.failRegion(context, region, reason); this.audit(context, 'failover.finished', event.id, { type: 'region', target: event.target }); return event; }
  public configureReplication(context: InfrastructureContext, input: Parameters<ReplicationManager['configure']>[1]) { this.assertManage(context); const rule = this.replication.configure(context, input); this.replication.complete(rule.id); this.audit(context, 'replication.completed', rule.id, { resource: rule.resource, targets: rule.targetRegions, mode: rule.mode }); return this.replication.list(context).find((item) => item.id === rule.id)!; }
  public overview() { const cluster = this.cluster.summary(); return { started: this.started, regions: this.regions.list(), cluster, services: this.services.list(), health: this.health.check(), scaling: this.autoscaler.listDecisions().slice(0, 20), cache: this.cache.stats(), networking: this.network.getConfig() }; }
}

export const infrastructureEngine = new InfrastructureEngine();
export * from './types';
