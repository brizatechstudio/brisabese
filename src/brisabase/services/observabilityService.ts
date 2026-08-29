export interface ObservabilityService {
  overview(): Promise<any>;
  logs(filters?: Record<string, string>): Promise<any[]>;
  metrics(): Promise<{ points: any[]; summary: Record<string, any> }>;
  traces(): Promise<any[]>;
  health(): Promise<any[]>;
  alerts(): Promise<{ rules: any[]; events: any[] }>;
  retention(): Promise<any>;
}

export class MockObservabilityService implements ObservabilityService {
  async overview(): Promise<any> {
    return { metrics: {}, alerts: [], health: [] };
  }

  async logs(_filters: Record<string, string> = {}): Promise<any[]> {
    return [];
  }

  async metrics(): Promise<{ points: any[]; summary: Record<string, any> }> {
    return { points: [], summary: {} };
  }

  async traces(): Promise<any[]> {
    return [];
  }

  async health(): Promise<any[]> {
    return [];
  }

  async alerts(): Promise<{ rules: any[]; events: any[] }> {
    return { rules: [], events: [] };
  }

  async retention(): Promise<any> {
    return {};
  }
}

export class ApiObservabilityService implements ObservabilityService {
  private async request<T>(path: string): Promise<T> {
    const response = await fetch(path);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || `Observability request failed (${response.status}).`);
    return data as T;
  }

  async overview(): Promise<any> {
    return this.request('/api/observability/overview');
  }

  async logs(filters: Record<string, string> = {}): Promise<any[]> {
    return this.request(`/api/observability/logs?${new URLSearchParams(filters)}`);
  }

  async metrics(): Promise<{ points: any[]; summary: Record<string, any> }> {
    return this.request('/api/observability/metrics');
  }

  async traces(): Promise<any[]> {
    return this.request('/api/observability/traces');
  }

  async health(): Promise<any[]> {
    return this.request('/api/observability/health');
  }

  async alerts(): Promise<{ rules: any[]; events: any[] }> {
    return this.request('/api/observability/alerts');
  }

  async retention(): Promise<any> {
    return this.request('/api/observability/retention');
  }
}

const metaEnv = (import.meta as any).env;
const observabilityMode = metaEnv?.VITE_DATA_SOURCE || 'api';

export const mockObservabilityService = new MockObservabilityService();
export const realObservabilityService = new ApiObservabilityService();
export const observabilityService = observabilityMode === 'mock' ? mockObservabilityService : realObservabilityService;
