import { randomUUID } from 'node:crypto';
import { ServiceInstance, ServiceName } from './types';

export class ServiceDiscovery {
  private instances = new Map<string, ServiceInstance>();
  public register(input: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeatAt'> & { id?: string }): ServiceInstance { const now = new Date().toISOString(); const instance: ServiceInstance = { ...input, id: input.id || `svc_${randomUUID().replace(/-/g, '').slice(0, 16)}`, registeredAt: now, lastHeartbeatAt: now }; this.instances.set(instance.id, instance); return structuredClone(instance); }
  public heartbeat(id: string, status: ServiceInstance['status'] = 'healthy', activeConnections?: number): ServiceInstance { const current = this.instances.get(id); if (!current) throw new Error('Service instance not found.'); const next = { ...current, status, ...(activeConnections === undefined ? {} : { activeConnections }), lastHeartbeatAt: new Date().toISOString() }; this.instances.set(id, next); return structuredClone(next); }
  public list(service?: ServiceName, region?: string): ServiceInstance[] { return Array.from(this.instances.values()).filter((instance) => (!service || instance.service === service) && (!region || instance.region === region)).map((instance) => structuredClone(instance)); }
  public remove(id: string): boolean { return this.instances.delete(id); }
  public byNode(nodeId: string): ServiceInstance[] { return this.list().filter((instance) => instance.nodeId === nodeId); }
}
