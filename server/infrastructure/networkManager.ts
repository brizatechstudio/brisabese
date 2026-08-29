import { InfrastructureContext, NetworkConfig, ServiceName } from './types';
import { LoadBalancer } from './loadBalancer';
import { RegionManager } from './regionManager';

export class NetworkManager {
  private config: NetworkConfig = { internalTls: true, mtlsPrepared: true, serviceAuthentication: true, credentialRotationPrepared: true, globalGateway: { enabled: true, strategy: 'region_based' } };
  constructor(private readonly balancer: LoadBalancer, private readonly regions: RegionManager) {}
  public getConfig(): NetworkConfig { return structuredClone(this.config); }
  public update(input: Partial<NetworkConfig>): NetworkConfig { this.config = { ...this.config, ...input, globalGateway: { ...this.config.globalGateway, ...(input.globalGateway || {}) } }; this.balancer.setStrategy(this.config.globalGateway.strategy); return this.getConfig(); }
  public route(context: InfrastructureContext, service: ServiceName): { service: ServiceName; region: string; endpoint: string; nodeId: string; tls: boolean; mtlsPrepared: boolean } { const region = this.regions.chooseAvailable(context); const instance = this.balancer.select(service, { preferredRegion: region }); return { service, region: instance.region, endpoint: instance.endpoint, nodeId: instance.nodeId, tls: this.config.internalTls, mtlsPrepared: this.config.mtlsPrepared }; }
}
