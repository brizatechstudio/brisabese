import { WebSocket } from 'ws';
import { RealtimeConnection, RealtimeServerMessage } from './types';
import { channelManager } from './channelManager';
import { subscriptionManager } from './subscriptionManager';
import { logger } from '../logger';

const MAX_BUFFERED_MESSAGES = 100;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 60_000;

type DisconnectHook = (connection: RealtimeConnection, reason: string) => void;
type SentHook = () => void;

export class RealtimeConnectionManager {
  private connections = new Map<string, RealtimeConnection>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private disconnectHook?: DisconnectHook;
  private sentHook?: SentHook;

  public setLifecycleHooks(hooks: { onDisconnect?: DisconnectHook; onMessageSent?: SentHook }): void {
    this.disconnectHook = hooks.onDisconnect;
    this.sentHook = hooks.onMessageSent;
  }

  public addConnection(connection: RealtimeConnection): void {
    this.connections.set(connection.id, connection);
  }

  public getConnection(connectionId: string): RealtimeConnection | undefined {
    return this.connections.get(connectionId);
  }

  public removeConnection(connectionId: string, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.connections.delete(connectionId);
    channelManager.removeConnectionFromAllChannels(connectionId);
    subscriptionManager.removeConnectionSubscriptions(connectionId);
    this.disconnectHook?.(connection, reason);
    logger.info(`Realtime connection ${connectionId} removed (${reason})`);
  }

  public disconnectAll(reason: string): void {
    for (const connection of [...this.connections.values()]) {
      this.forceClose(connection, 'SERVER_SHUTDOWN', 'Server is shutting down.', 1001, reason);
    }
  }

  public sendToConnection(connection: RealtimeConnection, message: RealtimeServerMessage): boolean {
    if (!connection.isAlive || !this.connections.has(connection.id)) return false;
    const socket = connection.socket as { send?: (payload: string) => void; bufferedAmount?: number; readyState?: number } | null;
    if (!socket || typeof socket.send !== 'function') return false;

    const pendingBytes = Number(socket.bufferedAmount || 0);
    if (connection.bufferedMessages >= MAX_BUFFERED_MESSAGES || pendingBytes >= MAX_BUFFERED_BYTES) {
      this.forceClose(connection, 'SLOW_CLIENT', 'Client is not consuming messages fast enough.', 1008, 'slow_client');
      return false;
    }

    try {
      // ws.OPEN is 1. Test transports do not expose readyState, so they remain supported.
      if (socket.readyState !== undefined && socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(message));
      connection.bufferedMessages += 1;
      this.sentHook?.();
      setTimeout(() => {
        if (this.connections.has(connection.id)) connection.bufferedMessages = Math.max(0, connection.bufferedMessages - 1);
      }, 50).unref?.();
      return true;
    } catch (error) {
      logger.error('Failed to send realtime message:', error);
      this.removeConnection(connection.id, 'send_error');
      return false;
    }
  }

  public broadcastToChannel(
    projectId: string,
    environmentId: string,
    channelName: string,
    message: RealtimeServerMessage,
    excludeConnectionId?: string,
  ): number {
    let sent = 0;
    for (const connectionId of channelManager.getChannelConnections(projectId, environmentId, channelName)) {
      if (connectionId === excludeConnectionId) continue;
      const connection = this.connections.get(connectionId);
      if (connection && this.sendToConnection(connection, message)) sent += 1;
    }
    return sent;
  }

  public markAlive(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.isAlive = true;
      connection.lastSeen = new Date().toISOString();
    }
  }

  public getConnections(projectId?: string, environmentId?: string): RealtimeConnection[] {
    return [...this.connections.values()].filter((connection) =>
      (!projectId || connection.projectId === projectId) && (!environmentId || connection.environmentId === environmentId)
    );
  }

  public getConnectionsMap(): Map<string, RealtimeConnection> {
    return this.connections;
  }

  public getActiveConnectionsCount(projectId?: string, environmentId?: string): number {
    return this.getConnections(projectId, environmentId).length;
  }

  public startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const connection of [...this.connections.values()]) {
        if (now - Date.parse(connection.lastSeen) > CONNECTION_TIMEOUT_MS) {
          this.forceClose(connection, 'HEARTBEAT_TIMEOUT', 'Connection timed out.', 1001, 'heartbeat_timeout');
          continue;
        }
        this.sendToConnection(connection, { type: 'ping', timestamp: new Date().toISOString() });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private forceClose(connection: RealtimeConnection, code: string, message: string, closeCode: number, reason: string): void {
    const socket = connection.socket as { send?: (payload: string) => void; close?: (code?: number, reason?: string) => void; readyState?: number } | null;
    try {
      if (socket?.send && (socket.readyState === undefined || socket.readyState === WebSocket.OPEN)) {
        socket.send(JSON.stringify({ type: 'error', error: { code, message }, timestamp: new Date().toISOString() }));
      }
      socket?.close?.(closeCode, reason);
    } catch {
      // The connection still needs local cleanup after a failed close.
    }
    this.removeConnection(connection.id, reason);
  }
}
