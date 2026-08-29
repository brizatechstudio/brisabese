import { RealtimePresenceState, RealtimeServerMessage } from './types';
import { RealtimeConnectionManager } from './connectionManager';
import { channelManager } from './channelManager';
import { logger } from '../logger';

export class RealtimePresenceManager {
  private presenceMap = new Map<string, RealtimePresenceState[]>(); // channelKey -> states
  private connectionManager: RealtimeConnectionManager | null = null;

  public setConnectionManager(cm: RealtimeConnectionManager): void {
    this.connectionManager = cm;
  }

  private getChannelKey(projectId: string, environmentId: string, channelName: string): string {
    return `realtime:${projectId}:${environmentId}:${channelName.toLowerCase().trim()}`;
  }

  public track(
    projectId: string,
    environmentId: string,
    channelName: string,
    connectionId: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): void {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    const states = this.presenceMap.get(key) || [];

    // Remove existing state for this connection
    const filtered = states.filter((s) => s.connectionId !== connectionId);

    const newState: RealtimePresenceState = {
      userId,
      connectionId,
      status: 'online',
      metadata,
      joinedAt: new Date().toISOString(),
    };
    filtered.push(newState);
    this.presenceMap.set(key, filtered);

    // Broadcast presence_join to channel
    this.broadcastPresence(projectId, environmentId, channelName, 'presence_join', newState, connectionId);
  }

  public untrack(
    projectId: string,
    environmentId: string,
    channelName: string,
    connectionId: string
  ): void {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    const states = this.presenceMap.get(key) || [];
    const leaving = states.find((s) => s.connectionId === connectionId);
    const filtered = states.filter((s) => s.connectionId !== connectionId);
    this.presenceMap.set(key, filtered);

    if (leaving) {
      this.broadcastPresence(projectId, environmentId, channelName, 'presence_leave', leaving, connectionId);
    }
  }

  public removeConnectionFromAllChannels(connectionId: string): void {
    for (const [key, states] of this.presenceMap.entries()) {
      const leaving = states.find((state) => state.connectionId === connectionId);
      if (leaving) {
        const filtered = states.filter((state) => state.connectionId !== connectionId);
        if (filtered.length) this.presenceMap.set(key, filtered);
        else this.presenceMap.delete(key);
        const [, projectId, environmentId, ...channelParts] = key.split(':');
        this.broadcastPresence(projectId, environmentId, channelParts.join(':'), 'presence_leave', leaving, connectionId);
      }
    }
  }

  public getPresenceState(
    projectId: string,
    environmentId: string,
    channelName: string
  ): RealtimePresenceState[] {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    return [...(this.presenceMap.get(key) || [])];
  }

  public sync(
    projectId: string,
    environmentId: string,
    channelName: string,
    connectionId: string
  ): void {
    const states = this.getPresenceState(projectId, environmentId, channelName);
    if (!this.connectionManager) return;

    const conn = this.connectionManager.getConnection(connectionId);
    if (!conn) return;

    this.connectionManager.sendToConnection(conn, {
      type: 'presence_state',
      channel: channelName,
      state: states,
    });
  }

  private broadcastPresence(
    projectId: string,
    environmentId: string,
    channelName: string,
    type: 'presence_join' | 'presence_leave',
    state: RealtimePresenceState,
    excludeConnectionId: string
  ): void {
    if (!this.connectionManager) return;

    const message: RealtimeServerMessage = {
      type,
      channel: channelName,
      state: state,
      timestamp: new Date().toISOString(),
    };

    this.connectionManager.broadcastToChannel(
      projectId,
      environmentId,
      channelName,
      message,
      excludeConnectionId
    );
  }
}
