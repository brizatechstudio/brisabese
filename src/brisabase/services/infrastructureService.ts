export interface InfrastructureService {
  overview(): Promise<any>;
  regions(): Promise<any[]>;
  nodes(): Promise<any[]>;
  deployments(): Promise<any[]>;
  scaling(): Promise<any>;
  replication(): Promise<any[]>;
  services(): Promise<any[]>;
  health(): Promise<any>;
  networking(): Promise<any>;
}

const mockOverview = { started: true, regions: [{ code: 'sa-east-1', name: 'South America', status: 'healthy', zones: [{ id: 'sa-east-1a' }] }], cluster: { healthy: 1, degraded: 0, offline: 0, capacity: { cpu: 18, memory: 25, storage: 20, network: 12 } }, services: [], health: { status: 'healthy', nodes: { healthy: 1, degraded: 0, offline: 0 }, services: { healthy: 0, degraded: 0, offline: 0 } }, scaling: [], cache: [], networking: { internalTls: true, mtlsPrepared: true, globalGateway: { enabled: true, strategy: 'region_based' } } };

export class MockInfrastructureService implements InfrastructureService {
  async overview(): Promise<any> { return mockOverview; }
  async regions(): Promise<any[]> { return mockOverview.regions; }
  async nodes(): Promise<any[]> { return []; }
  async deployments(): Promise<any[]> { return []; }
  async scaling(): Promise<any> { return { policies: [], decisions: [] }; }
  async replication(): Promise<any[]> { return []; }
  async services(): Promise<any[]> { return []; }
  async health(): Promise<any> { return mockOverview.health; }
  async networking(): Promise<any> { return mockOverview.networking; }
}

export class ApiInfrastructureService implements InfrastructureService {
  private async request<T>(path: string): Promise<T> { const response = await fetch(path); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.error?.message || `Infrastructure request failed (${response.status}).`); return data as T; }
  async overview(): Promise<any> { return this.request('/api/infrastructure/overview'); }
  async regions(): Promise<any[]> { return this.request('/api/infrastructure/regions'); }
  async nodes(): Promise<any[]> { return this.request('/api/infrastructure/nodes'); }
  async deployments(): Promise<any[]> { return this.request('/api/infrastructure/deployments'); }
  async scaling(): Promise<any> { return this.request('/api/infrastructure/scaling'); }
  async replication(): Promise<any[]> { return this.request('/api/infrastructure/replication'); }
  async services(): Promise<any[]> { return this.request('/api/infrastructure/services'); }
  async health(): Promise<any> { return this.request('/api/infrastructure/health'); }
  async networking(): Promise<any> { return this.request('/api/infrastructure/networking'); }
}

export const mockInfrastructureService = new MockInfrastructureService();
export const realInfrastructureService = new ApiInfrastructureService();
