import { RealtimeCdcEvent, RealtimeServerMessage } from './types';
import { subscriptionManager } from './subscriptionManager';
import { RealtimeConnectionManager } from './connectionManager';
import { RealtimePermissionEngine } from './authorization';
import { channelManager } from './channelManager';
import { logger } from '../logger';
import { securityEngine } from '../security/securityEngine';

export class RealtimeEventDispatcher {
  private connectionManager: RealtimeConnectionManager | null = null;

  public setConnectionManager(cm: RealtimeConnectionManager): void {
    this.connectionManager = cm;
  }

  /**
   * Dispatch a CDC event to all matching subscriptions.
   * Returns the number of messages dispatched.
   */
  public dispatch(event: RealtimeCdcEvent): number {
    if (!this.connectionManager) return 0;

    const matches = subscriptionManager.getMatchingSubscriptions(event, this.connectionManager.getConnectionsMap());

    let dispatched = 0;
    for (const { subscription, connection } of matches) {
      // Authorization check (re-verify at dispatch time)
      const auth = RealtimePermissionEngine.canReceive(subscription.authorization || {
        organizationId: subscription.organizationId,
        projectId: subscription.projectId,
        environmentId: subscription.environmentId,
        role: connection.role,
      },
        subscription.schema,
        subscription.table,
        subscription.event
      );

      if (!auth.allowed) {
        logger.warn(`Realtime dispatch denied: ${auth.reason}`);
        continue;
      }

      // Realtime is a read surface: a CDC event must never reveal a row that the
      // receiving principal cannot SELECT. Deletes use the old image.
      const securityContext = subscription.authorization || {
        organizationId: subscription.organizationId,
        projectId: subscription.projectId,
        environmentId: subscription.environmentId,
        role: connection.role,
        userId: connection.userId,
        ip: connection.ip,
        userAgent: connection.userAgent,
      };
      const row = event.operation === 'DELETE' ? event.old : event.new;
      const rls = securityEngine.evaluate({ ...securityContext, role: securityContext.role === 'anon' ? 'anonymous' : securityContext.role }, 'table', event.table, 'SELECT', row);
      if (!rls.allowed) {
        logger.warn(`Realtime RLS dispatch denied for ${event.table}.`);
        continue;
      }

      // Sanitize payload (remove sensitive fields)
      const sanitizedNew = RealtimePermissionEngine.sanitizeRecord(event.new);
      const sanitizedOld = RealtimePermissionEngine.sanitizeRecord(event.old);

      const message: RealtimeServerMessage = {
        type: 'event',
        channel: subscription.channel,
        event: event.operation,
        schema: event.schema,
        table: event.table,
        eventId: event.eventId,
        timestamp: event.timestamp,
        payload: {
          event: event.operation,
          schema: event.schema,
          table: event.table,
          new: sanitizedNew,
          old: sanitizedOld,
          eventId: event.eventId,
          timestamp: event.timestamp,
          organizationId: event.organizationId,
          projectId: event.projectId,
          environmentId: event.environmentId,
          transactionId: event.transactionId,
          requestId: event.requestId,
          sequence: event.sequence,
        },
      };

      if (this.connectionManager.sendToConnection(connection, message)) {
        dispatched += 1;
        channelManager.incrementEventCount(subscription.projectId, subscription.environmentId, subscription.channel);
      }
    }

    return dispatched;
  }
}
