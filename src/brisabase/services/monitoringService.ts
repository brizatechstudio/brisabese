import { SystemMetrics } from '../types';
import { CURRENT_METRICS, TIME_SERIES_24H, TIME_SERIES_7D, MetricPoint } from '../mocks/mockMonitoring';

export interface MonitoringService {
  getCurrentMetrics(): Promise<SystemMetrics>;
  getTimeSeries(range: '24h' | '7d'): Promise<MetricPoint[]>;
}

export class MockMonitoringService implements MonitoringService {
  async getCurrentMetrics(): Promise<SystemMetrics> {
    return { ...CURRENT_METRICS };
  }

  async getTimeSeries(range: '24h' | '7d'): Promise<MetricPoint[]> {
    return range === '7d' ? [...TIME_SERIES_7D] : [...TIME_SERIES_24H];
  }
}

export const mockMonitoringService = new MockMonitoringService();

export class ApiMonitoringService implements MonitoringService {
  private async request<T>(path: string): Promise<T> { const response = await fetch(path); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message || `Monitoring request failed (${response.status}).`); return body as T; }
  async getCurrentMetrics(): Promise<SystemMetrics> {
    const overview = await fetch('/api/observability/overview');
    if (!overview.ok) throw new Error('Falha ao obter métricas de observability');
    const body = await overview.json();
    const metrics = body?.metrics || body;
    return { cpuUsagePct: Number(metrics.cpuUsagePct || 0), memoryUsagePct: Number(metrics.memoryUsagePct || 0), requestsPerSec: Number(metrics.requestsPerSec || 0), avgLatencyMs: Number(metrics.avgLatencyMs || 0), errorRatePct: Number(metrics.errorRatePct || 0), activeDbConnections: Number(metrics.activeDbConnections || 0), storageTotalGb: Number(metrics.storageTotalGb || 0), storageUsedGb: Number(metrics.storageUsedGb || 0) };
  }
  async getTimeSeries(_range: '24h' | '7d'): Promise<MetricPoint[]> { const result = await this.request<any>('/api/observability/metrics'); return (result.points || []).map((point: any) => ({ timestamp: point.timestamp || point.createdAt, value: Number(point.value || 0) })); }
}

export const realMonitoringService = new ApiMonitoringService();
