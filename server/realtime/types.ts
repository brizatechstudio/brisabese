export type RealtimeOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeCdcEvent {
  eventId: string;
  timestamp: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  schema: string;
  table: string;
  operation: RealtimeOperation;
  new: Record<string, any> | null;
  old: Record<string, any> | null;
  transactionId?: string;
  requestId?: string;
  /** Monotonic capture sequence when the underlying source provides one. */
  sequence?: number;
}

/** Phase 8 can enrich this boundary with RLS policy information. */
export interface RealtimeAuthorizationContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  sessionId?: string;
  role: string;
  requestId?: string;
  apiKeyType?: 'public' | 'secret' | 'service';
  claims?: Record<string, unknown>;
  bypassRls?: boolean;
  ip?: string;
  userAgent?: string;
}

export type RealtimeMessageType =
  | 'connect'
  | 'connected'
  | 'join'
  | 'joined'
  | 'leave'
  | 'left'
  | 'subscribe'
  | 'subscribed'
  | 'unsubscribe'
  | 'unsubscribed'
  | 'event'
  | 'broadcast'
  | 'presence'
  | 'presence_state'
  | 'presence_join'
  | 'presence_leave'
  | 'heartbeat'
  | 'ping'
  | 'pong'
  | 'error';

export interface RealtimeClientMessage {
  type: RealtimeMessageType;
  channel?: string;
  event?: string;
  schema?: string;
  table?: string;
  filter?: string;
  token?: string;
  apiKey?: string;
  projectId?: string;
  environmentId?: string;
  payload?: any;
  ref?: string;
  state?: Record<string, any>;
}

export interface RealtimeServerMessage {
  type: RealtimeMessageType;
  channel?: string;
  event?: string;
  schema?: string;
  table?: string;
  payload?: any;
  ref?: string;
  error?: { code: string; message: string };
  eventId?: string;
  timestamp?: string;
  state?: Record<string, any>;
}

export interface RealtimeSubscription {
  id: string;
  connectionId: string;
  channel: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  schema: string;
  table: string;
  event: RealtimeOperation | '*';
  filter?: string;
  authorization?: RealtimeAuthorizationContext;
}

export interface RealtimeConnection {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  sessionId?: string;
  claims?: Record<string, unknown>;
  apiKeyType?: 'public' | 'secret' | 'service';
  role: string;
  channels: Set<string>;
  subscriptions: Map<string, RealtimeSubscription>;
  connectedAt: string;
  lastSeen: string;
  ip: string;
  userAgent: string;
  socket: any; // ws.WebSocket or SSE response
  isAlive: boolean;
  bufferedMessages: number;
}

export interface RealtimePresenceState {
  userId: string;
  connectionId: string;
  status: string;
  metadata: Record<string, any>;
  joinedAt: string;
}

export interface RealtimeChannelDef {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  activeConnections: number;
  eventsPerMin: number;
  status: 'online' | 'degraded' | 'offline';
  description?: string;
  createdAt: string;
}

export interface RealtimeMetrics {
  activeConnections: number;
  activeChannels: number;
  subscriptionsCount: number;
  eventsPerSecond: number;
  messagesPerSecond: number;
  broadcastsPerSecond: number;
  averageLatencyMs: number;
  totalEventsProcessed: number;
  errorsCount: number;
}

export interface RealtimeEventLogItem {
  id: string;
  eventId: string;
  channel: string;
  event: string;
  schema?: string;
  table?: string;
  payload: string;
  timestamp: string;
  latencyMs: number;
  projectId: string;
  environmentId: string;
}
