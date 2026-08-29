import { RealtimeServerMessage } from './types';
import { RealtimeConnectionManager } from './connectionManager';
import { channelManager } from './channelManager';
import { logger } from '../logger';

export class RealtimeBroadcastManager {
  private connectionManager: RealtimeConnectionManager | null = null;

  public setConnectionManager(cm: RealtimeConnectionManager): void {
    this.connectionManager = cm;
  }

  /**
   * Broadcast an arbitrary message to all clients in a channel.
   * Returns the number of clients that received the message.
   */
  public broadcast(
    projectId: string,
    environmentId: string,
    channelName: string,
    eventName: string,
    payload: any,
    senderConnectionId?: string
  ): number {
    if (!this.connectionManager) return 0;

    const message: RealtimeServerMessage = {
      type: 'broadcast',
      channel: channelName,
      event: eventName,
      payload,
      timestamp: new Date().toISOString(),
    };

    const sent = this.connectionManager.broadcastToChannel(
      projectId,
      environmentId,
      channelName,
      message,
      senderConnectionId
    );

    return sent;
  }
}