import { RealtimeChannelDef } from './types';

export class RealtimeChannelManager {
  private channels = new Map<string, {
    id: string;
    name: string;
    projectId: string;
    environmentId: string;
    connections: Set<string>; // connectionIds
    eventsCount: number;
    createdAt: string;
  }>();

  public getChannelKey(projectId: string, environmentId: string, channelName: string): string {
    return `realtime:${projectId}:${environmentId}:${channelName.toLowerCase().trim()}`;
  }

  public joinChannel(projectId: string, environmentId: string, channelName: string, connectionId: string): void {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    let ch = this.channels.get(key);

    if (!ch) {
      ch = {
        id: `chan_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        name: channelName,
        projectId,
        environmentId,
        connections: new Set(),
        eventsCount: 0,
        createdAt: new Date().toISOString(),
      };
      this.channels.set(key, ch);
    }

    ch.connections.add(connectionId);
  }

  public leaveChannel(projectId: string, environmentId: string, channelName: string, connectionId: string): void {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    const ch = this.channels.get(key);

    if (ch) {
      ch.connections.delete(connectionId);
      if (ch.connections.size === 0) {
        this.channels.delete(key);
      }
    }
  }

  public removeConnectionFromAllChannels(connectionId: string): void {
    for (const [key, ch] of this.channels.entries()) {
      ch.connections.delete(connectionId);
      if (ch.connections.size === 0) {
        this.channels.delete(key);
      }
    }
  }

  public incrementEventCount(projectId: string, environmentId: string, channelName: string): void {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    const ch = this.channels.get(key);
    if (ch) {
      ch.eventsCount += 1;
    }
  }

  public listChannels(projectId?: string, environmentId?: string): RealtimeChannelDef[] {
    const list: RealtimeChannelDef[] = [];

    for (const ch of this.channels.values()) {
      if (projectId && ch.projectId !== projectId) continue;
      if (environmentId && ch.environmentId !== environmentId) continue;

      list.push({
        id: ch.id,
        name: ch.name,
        projectId: ch.projectId,
        environmentId: ch.environmentId,
        activeConnections: ch.connections.size,
        eventsPerMin: ch.eventsCount,
        status: 'online',
        createdAt: ch.createdAt,
      });
    }

    return list;
  }

  public getChannelConnections(projectId: string, environmentId: string, channelName: string): Set<string> {
    const key = this.getChannelKey(projectId, environmentId, channelName);
    const ch = this.channels.get(key);
    return ch ? ch.connections : new Set();
  }

  public getActiveChannelsCount(projectId?: string, environmentId?: string): number {
    return this.listChannels(projectId, environmentId).length;
  }
}

export const channelManager = new RealtimeChannelManager();
