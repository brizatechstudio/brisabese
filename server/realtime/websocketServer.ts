import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { logger } from '../logger';
import { realtimeEngine } from './realtimeEngine';
import { RealtimeConnection, RealtimeClientMessage, RealtimeServerMessage } from './types';
import { RealtimePermissionEngine } from './authorization';
import { EventFilterEngine } from './filters';
import { channelManager } from './channelManager';
import { subscriptionManager } from './subscriptionManager';
import { webhookEngine } from '../webhooks/webhookEngine';

const MAX_MESSAGE_SIZE = 64 * 1024;
const MAX_CHANNELS_PER_CONNECTION = 20;

export class RealtimeWebSocketServer {
  private wss: WebSocketServer | null = null;

  public attach(server: any): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: '/realtime/v1/websocket', maxPayload: MAX_MESSAGE_SIZE, perMessageDeflate: false });
    this.wss.on('connection', (socket: WebSocket, request: IncomingMessage) => this.handleConnection(socket, request));
    logger.info('Realtime WebSocket server attached at /realtime/v1/websocket');
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const ip = request.socket.remoteAddress || 'unknown';
    const rate = realtimeEngine.rateLimiter.checkConnection(ip);
    if (!rate.allowed) {
      this.sendError(socket, 'CONNECTION_LIMIT_EXCEEDED', 'Connection rate limit exceeded.');
      socket.close(1008, 'rate_limited');
      return;
    }

    const connection: RealtimeConnection = {
      id: `conn_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      organizationId: '',
      projectId: '',
      environmentId: '',
      role: 'anon',
      channels: new Set(),
      subscriptions: new Map(),
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      ip,
      userAgent: String(request.headers['user-agent'] || 'unknown'),
      socket,
      isAlive: true,
      bufferedMessages: 0,
    };
    realtimeEngine.connectionManager.addConnection(connection);

    const url = new URL(request.url || '/', 'http://localhost');
    const authorization = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined;
    const apiKeyHeader = request.headers.apikey || request.headers['x-apikey'];
    const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : url.searchParams.get('apikey') || undefined;
    const token = authorization || url.searchParams.get('access_token') || undefined;
    const projectId = typeof request.headers['x-project-id'] === 'string' ? request.headers['x-project-id'] : url.searchParams.get('project') || undefined;
    const environmentId = typeof request.headers['x-environment-id'] === 'string' ? request.headers['x-environment-id'] : url.searchParams.get('environment') || undefined;
    if (token || apiKey) void this.authenticate(connection, { token, apiKey, projectId, environmentId });
    else this.send(socket, { type: 'connected', ref: 'transport', timestamp: new Date().toISOString() });

    socket.on('message', (data) => {
      const raw = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (raw.byteLength > MAX_MESSAGE_SIZE) {
        this.sendError(socket, 'MESSAGE_TOO_LARGE', `Messages cannot exceed ${MAX_MESSAGE_SIZE / 1024} KB.`);
        return;
      }
      try {
        const message = JSON.parse(raw.toString('utf8')) as RealtimeClientMessage;
        if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
          throw new Error('invalid message');
        }
        void this.handleMessage(connection, message).catch(() => this.sendError(socket, 'AUTH_FAILED', 'Realtime authentication failed.'));
      } catch {
        this.sendError(socket, 'INVALID_MESSAGE', 'Message must be a JSON protocol object.');
      }
    });
    socket.on('pong', () => realtimeEngine.connectionManager.markAlive(connection.id));
    socket.on('close', () => realtimeEngine.connectionManager.removeConnection(connection.id, 'client_closed'));
    socket.on('error', (error) => {
      realtimeEngine.metrics.recordError();
      logger.error('Realtime WebSocket error:', error);
    });
  }

  private async handleMessage(connection: RealtimeConnection, message: RealtimeClientMessage): Promise<void> {
    const socket = connection.socket as WebSocket;
    realtimeEngine.connectionManager.markAlive(connection.id);
    const messageRate = connection.projectId ? await realtimeEngine.rateLimiter.checkMessageDistributed(connection.projectId, connection.environmentId) : realtimeEngine.rateLimiter.checkMessage(connection.ip, connection.id);
    if (!messageRate.allowed) {
      this.sendError(socket, 'MESSAGE_RATE_LIMITED', 'Message rate limit exceeded.');
      return;
    }

    if (message.type === 'connect') {
      await this.authenticate(connection, message);
      return;
    }
    if (!connection.projectId) {
      this.sendError(socket, 'NOT_AUTHENTICATED', 'Authenticate before using Realtime.');
      return;
    }

    switch (message.type) {
      case 'join':
        this.join(connection, message);
        return;
      case 'leave':
        this.leave(connection, message);
        return;
      case 'subscribe':
        this.subscribe(connection, message);
        return;
      case 'unsubscribe':
        this.unsubscribe(connection, message);
        return;
      case 'broadcast':
        await this.broadcast(connection, message);
        return;
      case 'presence':
        this.presence(connection, message);
        return;
      case 'heartbeat':
      case 'ping':
        this.send(socket, { type: 'pong', ref: message.ref, timestamp: new Date().toISOString() });
        return;
      default:
        this.sendError(socket, 'UNKNOWN_MESSAGE_TYPE', `Unsupported message type '${message.type}'.`);
    }
  }

  private async authenticate(connection: RealtimeConnection, message: Pick<RealtimeClientMessage, 'token' | 'apiKey' | 'projectId' | 'environmentId' | 'ref'>): Promise<void> {
    const socket = connection.socket as WebSocket;
    if (connection.projectId) {
      this.send(socket, { type: 'connected', ref: message.ref, timestamp: new Date().toISOString() });
      return;
    }
    const context = await RealtimePermissionEngine.validateTokenOrKeyAsync(message.token, message.apiKey, message.projectId, message.environmentId);
    const permission = RealtimePermissionEngine.canConnect(context);
    if (!permission.allowed) {
      realtimeEngine.metrics.recordError();
      this.sendError(socket, 'AUTH_FAILED', permission.reason || context.reason || 'Authentication failed.');
      return;
    }
    connection.organizationId = context.organizationId;
    connection.projectId = context.projectId;
    connection.environmentId = context.environmentId;
    connection.userId = context.userId;
    connection.sessionId = context.sessionId;
    connection.claims = context.claims;
    connection.apiKeyType = context.apiKeyType;
    connection.role = context.role;
    realtimeEngine.logAudit('realtime.connected', {
      organizationId: context.organizationId,
      projectId: context.projectId,
      environmentId: context.environmentId,
      userId: context.userId,
      metadata: { connectionId: connection.id, role: context.role },
    });
    this.send(socket, { type: 'connected', ref: message.ref, timestamp: new Date().toISOString(), payload: { connectionId: connection.id } });
  }

  private join(connection: RealtimeConnection, message: RealtimeClientMessage): void {
    const channel = message.channel || '';
    if (!RealtimePermissionEngine.isValidChannel(channel)) return this.sendError(connection.socket, 'INVALID_CHANNEL', 'Invalid channel name.');
    if (!connection.channels.has(channel) && connection.channels.size >= MAX_CHANNELS_PER_CONNECTION) {
      return this.sendError(connection.socket, 'CHANNEL_LIMIT_EXCEEDED', `At most ${MAX_CHANNELS_PER_CONNECTION} channels are allowed per connection.`);
    }
    channelManager.joinChannel(connection.projectId, connection.environmentId, channel, connection.id);
    connection.channels.add(channel);
    this.send(connection.socket, { type: 'joined', channel, ref: message.ref, timestamp: new Date().toISOString() });
  }

  private leave(connection: RealtimeConnection, message: RealtimeClientMessage): void {
    const channel = message.channel || '';
    if (connection.channels.has(channel)) {
      channelManager.leaveChannel(connection.projectId, connection.environmentId, channel, connection.id);
      connection.channels.delete(channel);
      realtimeEngine.presenceManager.untrack(connection.projectId, connection.environmentId, channel, connection.id);
    }
    this.send(connection.socket, { type: 'left', channel, ref: message.ref, timestamp: new Date().toISOString() });
  }

  private subscribe(connection: RealtimeConnection, message: RealtimeClientMessage): void {
    const channel = message.channel || '';
    const schema = message.schema || 'public';
    const table = message.table || '';
    const event = message.event || '*';
    if (!RealtimePermissionEngine.isValidChannel(channel) || !table || !['INSERT', 'UPDATE', 'DELETE', '*'].includes(event)) {
      return this.sendError(connection.socket, 'INVALID_SUBSCRIPTION', 'Channel, table, and a valid event are required.');
    }
    if (!EventFilterEngine.isValidFilter(message.filter)) return this.sendError(connection.socket, 'INVALID_FILTER', 'Invalid realtime row filter.');
    const limit = realtimeEngine.rateLimiter.checkSubscription(connection.id, connection.subscriptions.size);
    if (!limit.allowed) return this.sendError(connection.socket, 'SUBSCRIPTION_LIMIT_EXCEEDED', limit.reason || 'Subscription limit exceeded.');
    const permission = RealtimePermissionEngine.canSubscribe(connection.projectId, connection.environmentId, schema, table, connection.role, event as 'INSERT' | 'UPDATE' | 'DELETE' | '*', connection.organizationId);
    if (!permission.allowed) {
      realtimeEngine.logAudit('realtime.authorization_denied', {
        organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId,
        metadata: { schema, table, event, reason: permission.reason },
      });
      return this.sendError(connection.socket, 'FORBIDDEN', permission.reason || 'Subscription is not permitted.');
    }
    if (!connection.channels.has(channel)) this.join(connection, { type: 'join', channel });
    const id = `sub_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const subscription = {
      id, connectionId: connection.id, channel, organizationId: connection.organizationId,
      projectId: connection.projectId, environmentId: connection.environmentId, schema, table,
      event: event as 'INSERT' | 'UPDATE' | 'DELETE' | '*', filter: message.filter,
      authorization: RealtimePermissionEngine.buildAuthorizationContext({
        valid: true, organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId,
        userId: connection.userId, sessionId: connection.sessionId, claims: connection.claims, apiKeyType: connection.apiKeyType, role: connection.role,
      }),
    };
    subscriptionManager.addSubscription(subscription);
    connection.subscriptions.set(id, subscription);
    realtimeEngine.logAudit('realtime.subscribed', {
      organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId,
      metadata: { channel, schema, table, event, subscriptionId: id },
    });
    this.send(connection.socket, { type: 'subscribed', channel, ref: message.ref, timestamp: new Date().toISOString() });
  }

  private unsubscribe(connection: RealtimeConnection, message: RealtimeClientMessage): void {
    const channel = message.channel || '';
    for (const [id, subscription] of connection.subscriptions) {
      if (subscription.channel === channel) {
        subscriptionManager.removeSubscription(id);
        connection.subscriptions.delete(id);
      }
    }
    this.send(connection.socket, { type: 'unsubscribed', channel, ref: message.ref, timestamp: new Date().toISOString() });
  }

  private async broadcast(connection: RealtimeConnection, message: RealtimeClientMessage): Promise<void> {
    const channel = message.channel || '';
    if (!connection.channels.has(channel)) return this.sendError(connection.socket, 'NOT_JOINED', 'Join a channel before broadcasting.');
    const permission = RealtimePermissionEngine.canBroadcast(RealtimePermissionEngine.buildAuthorizationContext({ valid: true, organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId, role: connection.role }), channel);
    if (!permission.allowed) return this.sendError(connection.socket, 'FORBIDDEN', permission.reason || 'Broadcast is not permitted.');
    const rate = await realtimeEngine.rateLimiter.checkBroadcastDistributed(connection.projectId, connection.environmentId);
    if (!rate.allowed) return this.sendError(connection.socket, 'BROADCAST_RATE_LIMITED', 'Broadcast rate limit exceeded.');
    const size = realtimeEngine.rateLimiter.checkMessageSize(message.payload);
    if (!size.allowed) return this.sendError(connection.socket, 'MESSAGE_TOO_LARGE', size.reason || 'Message is too large.');
    realtimeEngine.broadcastManager.broadcast(connection.projectId, connection.environmentId, channel, message.event || 'broadcast', message.payload, connection.id);
    realtimeEngine.metrics.recordBroadcast();
    void webhookEngine.emit({organizationId:connection.organizationId,projectId:connection.projectId,environmentId:connection.environmentId,userId:connection.userId},'realtime.broadcast',{channel,event:message.event||'broadcast',payload:message.payload});
    realtimeEngine.logAudit('realtime.broadcast', {
      organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId,
      metadata: { channel, event: message.event || 'broadcast' },
    });
  }

  private presence(connection: RealtimeConnection, message: RealtimeClientMessage): void {
    const channel = message.channel || '';
    if (!connection.channels.has(channel)) return this.sendError(connection.socket, 'NOT_JOINED', 'Join a channel before using presence.');
    const permission = RealtimePermissionEngine.canPresence(RealtimePermissionEngine.buildAuthorizationContext({ valid: true, organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId, role: connection.role }), channel);
    if (!permission.allowed) return this.sendError(connection.socket, 'FORBIDDEN', permission.reason || 'Presence is not permitted.');
    if (!['track', 'untrack', 'sync'].includes(message.event || 'sync')) return this.sendError(connection.socket, 'INVALID_PRESENCE_EVENT', 'Unsupported presence event.');
    if (message.event === 'track') {
      realtimeEngine.presenceManager.track(connection.projectId, connection.environmentId, channel, connection.id, connection.userId || 'anonymous', message.state || {});
      realtimeEngine.logAudit('realtime.presence_join', { organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId, metadata: { channel } });
    } else if (message.event === 'untrack') {
      realtimeEngine.presenceManager.untrack(connection.projectId, connection.environmentId, channel, connection.id);
      realtimeEngine.logAudit('realtime.presence_leave', { organizationId: connection.organizationId, projectId: connection.projectId, environmentId: connection.environmentId, userId: connection.userId, metadata: { channel } });
    } else {
      realtimeEngine.presenceManager.sync(connection.projectId, connection.environmentId, channel, connection.id);
    }
  }

  private send(socket: WebSocket, message: RealtimeServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private sendError(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { type: 'error', error: { code, message }, timestamp: new Date().toISOString() });
  }

  public close(): void {
    this.wss?.close();
    this.wss = null;
  }
}

export const realtimeWebSocketServer = new RealtimeWebSocketServer();
