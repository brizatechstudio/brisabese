import { RealtimeSubscription, RealtimeCdcEvent, RealtimeConnection } from './types';
import { EventFilterEngine } from './filters';

export class RealtimeSubscriptionManager {
  private subscriptions = new Map<string, RealtimeSubscription>(); // subId -> subscription

  public addSubscription(sub: RealtimeSubscription): void {
    this.subscriptions.set(sub.id, sub);
  }

  public removeSubscription(subId: string): boolean {
    return this.subscriptions.delete(subId);
  }

  public removeConnectionSubscriptions(connectionId: string): void {
    for (const [id, sub] of this.subscriptions.entries()) {
      if (sub.connectionId === connectionId) {
        this.subscriptions.delete(id);
      }
    }
  }

  public getMatchingSubscriptions(
    event: RealtimeCdcEvent,
    connectionsMap: Map<string, RealtimeConnection>
  ): { subscription: RealtimeSubscription; connection: RealtimeConnection }[] {
    const matches: { subscription: RealtimeSubscription; connection: RealtimeConnection }[] = [];

    for (const sub of this.subscriptions.values()) {
      // 1. Strict Project & Environment isolation
      if (
        sub.projectId !== event.projectId ||
        sub.environmentId !== event.environmentId
      ) {
        continue;
      }

      // 2. Filter check
      if (EventFilterEngine.matches(sub, event)) {
        const conn = connectionsMap.get(sub.connectionId);
        if (conn && conn.isAlive) {
          matches.push({ subscription: sub, connection: conn });
        }
      }
    }

    return matches;
  }

  public listSubscriptions(projectId?: string, environmentId?: string): RealtimeSubscription[] {
    let list = Array.from(this.subscriptions.values());
    if (projectId) list = list.filter((s) => s.projectId === projectId);
    if (environmentId) list = list.filter((s) => s.environmentId === environmentId);
    return list;
  }

  public getCount(projectId?: string, environmentId?: string): number {
    return this.listSubscriptions(projectId, environmentId).length;
  }
}

export const subscriptionManager = new RealtimeSubscriptionManager();
