import { SystemLog } from '../types';
import { INITIAL_LOGS } from '../mocks/mockLogs';

export interface LogsService {
  listLogs(filterService?: string, filterStatus?: string, searchQuery?: string): Promise<SystemLog[]>;
  clearLogs(): Promise<void>;
}

export class MockLogsService implements LogsService {
  private logs: SystemLog[] = [...INITIAL_LOGS];

  async listLogs(filterService?: string, filterStatus?: string, searchQuery?: string): Promise<SystemLog[]> {
    let result = [...this.logs];

    if (filterService && filterService !== 'all') {
      result = result.filter((l) => l.service === filterService);
    }

    if (filterStatus && filterStatus !== 'all') {
      if (filterStatus === 'error') {
        result = result.filter((l) => l.statusCode >= 400);
      } else if (filterStatus === '2xx') {
        result = result.filter((l) => l.statusCode >= 200 && l.statusCode < 300);
      } else if (filterStatus === '4xx') {
        result = result.filter((l) => l.statusCode >= 400 && l.statusCode < 500);
      } else if (filterStatus === '5xx') {
        result = result.filter((l) => l.statusCode >= 500);
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        l.message.toLowerCase().includes(q) ||
        l.method.toLowerCase().includes(q) ||
        l.ip.includes(q)
      );
    }

    return result;
  }

  async clearLogs(): Promise<void> {
    this.logs = [];
  }
}

export const mockLogsService = new MockLogsService();

export class ApiLogsService implements LogsService {
  private async request<T>(path: string): Promise<T> { const response = await fetch(path); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message || `Logs request failed (${response.status}).`); return body as T; }
  async listLogs(filterService?: string, filterStatus?: string, searchQuery?: string): Promise<SystemLog[]> {
    const query = new URLSearchParams(); if (filterService && filterService !== 'all') query.set('service', filterService); if (searchQuery) query.set('search', searchQuery);
    const logs = await this.request<any[]>(`/api/observability/logs${query.size ? `?${query}` : ''}`);
    return logs.map((log) => ({ id: log.id, timestamp: log.timestamp || log.createdAt, service: ['api','auth','database','functions','storage','realtime'].includes(log.service) ? log.service : 'api', level: log.level === 'warning' ? 'warn' : ['info','warn','error','debug'].includes(log.level) ? log.level : 'info', method: log.metadata?.method || 'SYSTEM', statusCode: Number(log.metadata?.statusCode || (log.level === 'error' ? 500 : 200)), message: log.message || log.event || '', durationMs: Number(log.metadata?.durationMs || 0), ip: log.metadata?.ip || '', path: log.metadata?.path, userAgent: log.metadata?.userAgent }));
  }
  async clearLogs(): Promise<void> { throw new Error('Log deletion is not available in the real runtime retention policy.'); }
}

export const realLogsService = new ApiLogsService();
