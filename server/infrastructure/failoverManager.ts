import { randomUUID } from 'node:crypto';
import { FailoverEvent, InfrastructureContext } from './types';
import { NodeManager } from './nodeManager';
import { RegionManager } from './regionManager';
import { ServiceDiscovery } from './serviceDiscovery';

export class FailoverManager {
  private events: FailoverEvent[] = [];
  constructor(private readonly nodes: NodeManager, private readonly regions: RegionManager, private readonly services: ServiceDiscovery) {}
  public list(context?: Pick<InfrastructureContext, 'organizationId' | 'projectId' | 'environmentId'>): FailoverEvent[] { return this.events.filter((event) => !context || (event.organizationId === context.organizationId && event.projectId === context.projectId && event.environmentId === context.environmentId)).map((event) => structuredClone(event)); }
  public failNode(context: InfrastructureContext, nodeId: string, reason = 'Health check failed.'): FailoverEvent { const node = this.nodes.setStatus(nodeId, 'offline'); const target = this.nodes.eligible(node.region).filter((candidate) => candidate.id !== node.id)[0]; if (!target) throw new Error('No healthy node is available in the failed node region.'); for (const instance of this.services.byNode(nodeId)) this.services.heartbeat(instance.id, 'offline'); const event: FailoverEvent = { id: `fail_${randomUUID().replace(/-/g, '').slice(0, 18)}`, organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, type: 'node', source: nodeId, target: target.id, status: 'completed', reason, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }; this.events.unshift(event); return structuredClone(event); }
  public failRegion(context: InfrastructureContext, region: string, reason = 'Region health check failed.'): FailoverEvent { this.regions.setStatus(region, 'offline'); const target = this.regions.chooseAvailable(context, [region]); const event: FailoverEvent = { id: `fail_${randomUUID().replace(/-/g, '').slice(0, 18)}`, organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, type: 'region', source: region, target, status: 'completed', reason, startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }; this.events.unshift(event); return structuredClone(event); }
}
