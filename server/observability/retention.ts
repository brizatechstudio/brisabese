import { RetentionPolicy } from './types';
import { config } from '../config';

export class RetentionEngine {
  private policy: RetentionPolicy = { logsDays: config.observability.logRetentionDays, metricsDays: config.observability.metricRetentionDays, tracesDays: config.observability.traceRetentionDays, alertsDays: 90, maxEntries: 10_000 };
  public get(): RetentionPolicy { return { ...this.policy }; }
  public set(input: Partial<RetentionPolicy>): RetentionPolicy {
    const next = { ...this.policy, ...input };
    for (const value of [next.logsDays, next.metricsDays, next.tracesDays, next.alertsDays, next.maxEntries]) if (!Number.isInteger(value) || value < 1 || value > 365_000) throw new Error('Invalid retention policy.');
    this.policy = next; return this.get();
  }
  public before(days: number): number { return Date.now() - days * 86_400_000; }
}
