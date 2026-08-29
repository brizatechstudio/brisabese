import { LoadBalancingStrategy, ServiceInstance, ServiceName } from './types';
import { NodeManager } from './nodeManager';
import { ServiceDiscovery } from './serviceDiscovery';

export class LoadBalancer {
  private strategy: LoadBalancingStrategy = 'latency_based';
  private cursor = new Map<ServiceName, number>();
  constructor(private readonly nodes: NodeManager, private readonly services: ServiceDiscovery) {}
  public setStrategy(strategy: LoadBalancingStrategy): void { this.strategy = strategy; }
  public getStrategy(): LoadBalancingStrategy { return this.strategy; }
  public select(service: ServiceName, options: { region?: string; preferredRegion?: string } = {}): ServiceInstance { let candidates = this.services.list(service).filter((instance) => instance.status !== 'offline' && this.nodes.get(instance.nodeId)?.status !== 'offline'); if (options.region) candidates = candidates.filter((instance) => instance.region === options.region); if (!candidates.length) throw new Error(`No healthy '${service}' service instance is available.`); if (this.strategy === 'region_based' && options.preferredRegion) { const regional = candidates.filter((instance) => instance.region === options.preferredRegion); if (regional.length) candidates = regional; }
    if (this.strategy === 'round_robin') { const index = this.cursor.get(service) || 0; this.cursor.set(service, (index + 1) % candidates.length); return structuredClone(candidates[index % candidates.length]); }
    if (this.strategy === 'least_connections') return structuredClone(candidates.sort((a, b) => a.activeConnections - b.activeConnections)[0]);
    if (this.strategy === 'weighted') return structuredClone(candidates.sort((a, b) => b.weight - a.weight)[0]);
    return structuredClone(candidates.sort((a, b) => (this.nodes.get(a.nodeId)?.latencyMs || Number.MAX_SAFE_INTEGER) - (this.nodes.get(b.nodeId)?.latencyMs || Number.MAX_SAFE_INTEGER))[0]);
  }
}
