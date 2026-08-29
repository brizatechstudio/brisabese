import { InfrastructureHealth } from './types';
import { NodeManager } from './nodeManager';
import { ServiceDiscovery } from './serviceDiscovery';

export class InfrastructureHealthManager {
  constructor(private readonly nodes: NodeManager, private readonly services: ServiceDiscovery) {}
  public check(): InfrastructureHealth { const nodes = this.nodes.list(); const instances = this.services.list(); const nodeCounts = { healthy: nodes.filter((node) => node.status === 'healthy').length, degraded: nodes.filter((node) => node.status === 'degraded' || node.status === 'maintenance').length, offline: nodes.filter((node) => node.status === 'offline').length }; const serviceCounts = { healthy: instances.filter((service) => service.status === 'healthy').length, degraded: instances.filter((service) => service.status === 'degraded').length, offline: instances.filter((service) => service.status === 'offline').length }; const status = nodeCounts.offline || serviceCounts.offline ? (nodeCounts.healthy || serviceCounts.healthy ? 'degraded' : 'unhealthy') : nodeCounts.degraded || serviceCounts.degraded ? 'degraded' : 'healthy'; return { status, nodes: nodeCounts, services: serviceCounts, checkedAt: new Date().toISOString() }; }
}
