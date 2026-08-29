import { randomUUID } from 'node:crypto';
import { InfrastructureNode, NodeStatus } from './types';

export class NodeManager {
  private nodes = new Map<string, InfrastructureNode>();
  public register(input: Omit<InfrastructureNode, 'id' | 'createdAt' | 'updatedAt' | 'uptimeSeconds'> & { id?: string; uptimeSeconds?: number }): InfrastructureNode { const now = new Date().toISOString(); const node: InfrastructureNode = { ...input, id: input.id || `node_${randomUUID().replace(/-/g, '').slice(0, 16)}`, uptimeSeconds: input.uptimeSeconds || 0, createdAt: now, updatedAt: now }; this.nodes.set(node.id, node); return structuredClone(node); }
  public list(region?: string): InfrastructureNode[] { return Array.from(this.nodes.values()).filter((node) => !region || node.region === region).map((node) => structuredClone(node)); }
  public get(id: string): InfrastructureNode | undefined { const node = this.nodes.get(id); return node && structuredClone(node); }
  public update(id: string, updates: Partial<Omit<InfrastructureNode, 'id' | 'createdAt'>>): InfrastructureNode { const current = this.nodes.get(id); if (!current) throw new Error('Node not found.'); const next = { ...current, ...updates, updatedAt: new Date().toISOString() }; this.nodes.set(id, next); return structuredClone(next); }
  public setStatus(id: string, status: NodeStatus): InfrastructureNode { return this.update(id, { status }); }
  public remove(id: string): boolean { return this.nodes.delete(id); }
  public eligible(region?: string): InfrastructureNode[] { return this.list(region).filter((node) => node.status === 'healthy' || node.status === 'degraded'); }
}
