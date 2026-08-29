import { randomUUID } from 'node:crypto';
import { ScheduledWork, ServiceName } from './types';
import { LoadBalancer } from './loadBalancer';

export class InfrastructureScheduler {
  private work: ScheduledWork[] = [];
  constructor(private readonly balancer: LoadBalancer) {}
  public enqueue(input: Omit<ScheduledWork, 'id' | 'attempts' | 'status' | 'createdAt' | 'updatedAt' | 'assignedNodeId'>): ScheduledWork { const now = new Date().toISOString(); const task: ScheduledWork = { ...input, id: `work_${randomUUID().replace(/-/g, '').slice(0, 18)}`, attempts: 0, status: 'queued', createdAt: now, updatedAt: now }; this.work.push(task); return structuredClone(task); }
  public dispatch(): ScheduledWork | undefined { const task = this.work.filter((item) => item.status === 'queued').sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0]; if (!task) return undefined; try { const instance = this.balancer.select(task.service, { preferredRegion: task.regionAffinity }); if (task.nodeAffinity && task.nodeAffinity !== instance.nodeId) throw new Error('Selected node does not satisfy affinity.'); task.assignedNodeId = instance.nodeId; task.attempts += 1; task.status = 'assigned'; task.updatedAt = new Date().toISOString(); return structuredClone(task); } catch (error) { task.attempts += 1; task.status = task.attempts >= task.maxAttempts ? 'dead_letter' : 'queued'; task.updatedAt = new Date().toISOString(); return structuredClone(task); } }
  public complete(id: string): ScheduledWork { const task = this.work.find((item) => item.id === id); if (!task) throw new Error('Scheduled work not found.'); task.status = 'completed'; task.updatedAt = new Date().toISOString(); return structuredClone(task); }
  public list(): ScheduledWork[] { return this.work.map((item) => structuredClone(item)); }
}
