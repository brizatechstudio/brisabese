import { RealtimeChannel } from '../types';
import { INITIAL_REALTIME_CHANNELS, MOCK_REALTIME_STREAM } from '../mocks/mockRealtime';

export interface RealtimeEventMock {
  id: string;
  channel: string;
  event: string;
  payload: string;
  timestamp: string;
  latencyMs: number;
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

export interface RealtimeConnectionInfo {
  id: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  channels: string[];
  connectedAt: string;
  lastSeen: string;
  ip: string;
  userAgent: string;
  isAlive: boolean;
}

export interface RealtimeEventLog {
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

export interface RealtimeStatus {
  status: string;
  websocket: boolean;
  cdc: boolean;
  redis: boolean;
  cdcDetails?: { started: boolean; mode: string };
  timestamp: string;
}

export interface RealtimeTableSettings {
  realtimeEnabled: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

export interface RealtimeService {
  listChannels(orgId?: string, projId?: string, envId?: string): Promise<RealtimeChannel[]>;
  getRealtimeEvents(orgId?: string, projId?: string, envId?: string): Promise<RealtimeEventMock[]>;
  sendBroadcastEvent(channelName: string, eventName: string, payload: any, orgId?: string, projId?: string, envId?: string): Promise<RealtimeEventMock>;
  getMetrics(orgId?: string, projId?: string, envId?: string): Promise<RealtimeMetrics>;
  getConnections(orgId?: string, projId?: string, envId?: string): Promise<RealtimeConnectionInfo[]>;
  getStatus(orgId?: string, projId?: string, envId?: string): Promise<RealtimeStatus>;
  getTableSettings(tableName: string, orgId?: string, projId?: string, envId?: string): Promise<RealtimeTableSettings>;
  setTableSettings(tableName: string, settings: Partial<RealtimeTableSettings>, orgId?: string, projId?: string, envId?: string): Promise<RealtimeTableSettings>;
  emitTestEvent(table: string, event: string, newRow?: any, oldRow?: any, orgId?: string, projId?: string, envId?: string): Promise<{ success: boolean; eventId: string }>;
}

export class MockRealtimeService implements RealtimeService {
  private channels: RealtimeChannel[] = [...INITIAL_REALTIME_CHANNELS];
  private events: RealtimeEventMock[] = [...MOCK_REALTIME_STREAM];

  async listChannels(): Promise<RealtimeChannel[]> {
    return [...this.channels];
  }

  async getRealtimeEvents(): Promise<RealtimeEventMock[]> {
    return [...this.events];
  }

  async sendBroadcastEvent(channelName: string, eventName: string, payload: any): Promise<RealtimeEventMock> {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const newEvt: RealtimeEventMock = {
      id: `evt_${Date.now().toString(36)}`,
      channel: channelName,
      event: eventName,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      timestamp: timeStr,
      latencyMs: Math.floor(Math.random() * 25) + 15
    };
    this.events.unshift(newEvt);

    const chan = this.channels.find((c) => c.name === channelName);
    if (chan) {
      chan.eventsPerMin += 1;
    }

    return newEvt;
  }

  async getMetrics(): Promise<RealtimeMetrics> {
    return {
      activeConnections: 8241,
      activeChannels: this.channels.length,
      subscriptionsCount: 12480,
      eventsPerSecond: 208,
      messagesPerSecond: 312,
      broadcastsPerSecond: 45,
      averageLatencyMs: 34,
      totalEventsProcessed: 1250000,
      errorsCount: 3,
    };
  }

  async getConnections(): Promise<RealtimeConnectionInfo[]> {
    return [
      {
        id: 'conn_mock_1',
        projectId: 'proj_ecommerce_1',
        environmentId: 'env_prod_1',
        userId: 'usr_001',
        role: 'authenticated',
        channels: ['orders', 'products'],
        connectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        ip: '192.168.1.100',
        userAgent: 'BrisaBase SDK 1.0',
        isAlive: true,
      },
      {
        id: 'conn_mock_2',
        projectId: 'proj_ecommerce_1',
        environmentId: 'env_prod_1',
        userId: 'usr_002',
        role: 'authenticated',
        channels: ['orders'],
        connectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        ip: '192.168.1.101',
        userAgent: 'BrisaBase SDK 1.0',
        isAlive: true,
      },
    ];
  }

  async getStatus(): Promise<RealtimeStatus> {
    return {
      status: 'ok',
      websocket: true,
      cdc: true,
      redis: true,
      cdcDetails: { started: true, mode: 'in_memory_engine' },
      timestamp: new Date().toISOString(),
    };
  }

  async getTableSettings(): Promise<RealtimeTableSettings> {
    return { realtimeEnabled: true, insert: true, update: true, delete: true };
  }

  async setTableSettings(_tableName: string, settings: Partial<RealtimeTableSettings>): Promise<RealtimeTableSettings> {
    return { realtimeEnabled: true, insert: true, update: true, delete: true, ...settings };
  }

  async emitTestEvent(table: string, event: string, newRow?: any, oldRow?: any): Promise<{ success: boolean; eventId: string }> {
    const eventId = `evt_${Date.now().toString(36)}`;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    this.events.unshift({
      id: eventId,
      channel: table,
      event,
      payload: JSON.stringify({ new: newRow, old: oldRow }),
      timestamp: timeStr,
      latencyMs: Math.floor(Math.random() * 20) + 10,
    });
    return { success: true, eventId };
  }
}

export class RealRealtimeService implements RealtimeService {
  private getHeaders(orgId?: string, projId?: string, envId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (orgId) headers['x-organization-id'] = orgId;
    if (projId) headers['x-project-id'] = projId;
    if (envId) headers['x-environment-id'] = envId;
    return headers;
  }

  async listChannels(orgId?: string, projId?: string, envId?: string): Promise<RealtimeChannel[]> {
    const res = await fetch('/api/realtime/channels', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw new Error('Falha ao listar canais realtime.');
    return res.json();
  }

  async getRealtimeEvents(orgId?: string, projId?: string, envId?: string): Promise<RealtimeEventMock[]> {
    const res = await fetch('/api/realtime/events', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw new Error('Falha ao obter eventos realtime.');
    const logs: RealtimeEventLog[] = await res.json();
    return logs.map((l) => ({
      id: l.id,
      channel: l.channel,
      event: l.event,
      payload: l.payload,
      timestamp: new Date(l.timestamp).toLocaleTimeString('pt-BR', { hour12: false }),
      latencyMs: l.latencyMs,
    }));
  }

  async sendBroadcastEvent(channelName: string, eventName: string, payload: any, orgId?: string, projId?: string, envId?: string): Promise<RealtimeEventMock> {
    const res = await fetch('/api/realtime/emit', {
      method: 'POST',
      headers: this.getHeaders(orgId, projId, envId),
      body: JSON.stringify({ table: channelName, event: eventName, new: payload }),
    });
    if (!res.ok) throw new Error('Falha ao transmitir evento.');
    const data = await res.json();
    return {
      id: data.eventId,
      channel: channelName,
      event: eventName,
      payload: JSON.stringify(payload),
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
      latencyMs: 0,
    };
  }

  async getMetrics(orgId?: string, projId?: string, envId?: string): Promise<RealtimeMetrics> {
    const res = await fetch('/api/realtime/metrics', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw new Error('Falha ao obter métricas realtime.');
    return res.json();
  }

  async getConnections(orgId?: string, projId?: string, envId?: string): Promise<RealtimeConnectionInfo[]> {
    const res = await fetch('/api/realtime/connections', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw new Error('Falha ao obter conexões realtime.');
    return res.json();
  }

  async getStatus(orgId?: string, projId?: string, envId?: string): Promise<RealtimeStatus> {
    const res = await fetch('/api/realtime/status', { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw new Error('Falha ao obter status realtime.');
    return res.json();
  }

  async getTableSettings(tableName: string, orgId?: string, projId?: string, envId?: string): Promise<RealtimeTableSettings> {
    const res = await fetch(`/api/realtime/tables/${encodeURIComponent(tableName)}/settings`, { headers: this.getHeaders(orgId, projId, envId) });
    if (!res.ok) throw new Error('Falha ao obter configurações realtime da tabela.');
    return res.json();
  }

  async setTableSettings(tableName: string, settings: Partial<RealtimeTableSettings>, orgId?: string, projId?: string, envId?: string): Promise<RealtimeTableSettings> {
    const res = await fetch(`/api/realtime/tables/${encodeURIComponent(tableName)}/settings`, {
      method: 'PATCH',
      headers: this.getHeaders(orgId, projId, envId),
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Falha ao atualizar configurações realtime da tabela.');
    return res.json();
  }

  async emitTestEvent(table: string, event: string, newRow?: any, oldRow?: any, orgId?: string, projId?: string, envId?: string): Promise<{ success: boolean; eventId: string }> {
    const res = await fetch('/api/realtime/emit', {
      method: 'POST',
      headers: this.getHeaders(orgId, projId, envId),
      body: JSON.stringify({ table, event, new: newRow, old: oldRow }),
    });
    if (!res.ok) throw new Error('Falha ao emitir evento de teste.');
    return res.json();
  }
}

const metaEnv = (import.meta as any).env;
const realtimeMode = metaEnv?.VITE_DATA_SOURCE || 'api';

export const mockRealtimeService = new MockRealtimeService();
export const realRealtimeService = new RealRealtimeService();
export const realtimeService = realtimeMode === 'mock' ? mockRealtimeService : realRealtimeService;