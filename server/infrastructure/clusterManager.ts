import { InfrastructureNode } from './types';
import { NodeManager } from './nodeManager';

export class ClusterManager {
  constructor(private readonly nodes: NodeManager) {}
  public summary(): { nodes: InfrastructureNode[]; healthy: number; degraded: number; offline: number; capacity: { cpu: number; memory: number; storage: number; network: number } } { const nodes = this.nodes.list(); const total = Math.max(1, nodes.length); return { nodes, healthy: nodes.filter((node) => node.status === 'healthy').length, degraded: nodes.filter((node) => node.status === 'degraded').length, offline: nodes.filter((node) => node.status === 'offline').length, capacity: { cpu: Number((nodes.reduce((sum, node) => sum + node.cpuUsage, 0) / total).toFixed(2)), memory: Number((nodes.reduce((sum, node) => sum + node.memoryUsage, 0) / total).toFixed(2)), storage: Number((nodes.reduce((sum, node) => sum + node.storageUsage, 0) / total).toFixed(2)), network: Number((nodes.reduce((sum, node) => sum + node.networkUsage, 0) / total).toFixed(2)) } }; }
}
