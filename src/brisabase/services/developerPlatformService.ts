export interface DeveloperPlatformService {
  overview(): Promise<any>;
  generateSdk(target: string): Promise<any>;
  generateCode(input: any): Promise<any>;
  runPlayground(input: any): Promise<any>;
  pluginCatalog(): Promise<any[]>;
  installPlugin(manifest: any): Promise<any>;
}

export class MockDeveloperPlatformService implements DeveloperPlatformService {
  private mock = {
    sdks: [{ target: 'typescript', packageName: '@brisabase/js', version: '1.0.0', language: 'TypeScript' }],
    templates: [{ id: 'tpl-react-starter', name: 'React Starter', framework: 'React', category: 'starter', version: '1.0.0' }],
    marketplace: [],
    plugins: [],
    documentation: [{ id: 'quickstart', title: 'Quickstart', section: 'guide', content: 'Run brisabase init to create a local project.', tags: ['cli'] }],
    extensions: [],
    packages: []
  };

  async overview(): Promise<any> {
    return this.mock;
  }

  async generateSdk(target: string): Promise<any> {
    return this.mock.sdks[0];
  }

  async generateCode(input: any): Promise<any> {
    return { target: input.target, files: { 'Product.ts': 'export interface Product { id: string; }' } };
  }

  async runPlayground(input: any): Promise<any> {
    return { supported: true, service: input.service };
  }

  async pluginCatalog(): Promise<any[]> {
    return [];
  }

  async installPlugin(manifest: any): Promise<any> {
    return manifest;
  }
}

export class ApiDeveloperPlatformService implements DeveloperPlatformService {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || `Developer platform request failed (${response.status}).`);
    return body as T;
  }

  async overview(): Promise<any> {
    return this.request('/api/ecosystem/overview');
  }

  async generateSdk(target: string): Promise<any> {
    return this.request('/api/ecosystem/sdks/generate', { method: 'POST', body: JSON.stringify({ target }) });
  }

  async generateCode(input: any): Promise<any> {
    return this.request('/api/ecosystem/generate', { method: 'POST', body: JSON.stringify(input) });
  }

  async runPlayground(input: any): Promise<any> {
    return this.request('/api/ecosystem/playground', { method: 'POST', body: JSON.stringify(input) });
  }

  async pluginCatalog(): Promise<any[]> {
    return this.request('/api/ecosystem/plugins/catalog');
  }

  async installPlugin(manifest: any): Promise<any> {
    return this.request('/api/ecosystem/plugins/install', { method: 'POST', body: JSON.stringify(manifest) });
  }
}

const metaEnv = (import.meta as any).env;
const developerPlatformMode = metaEnv?.VITE_DATA_SOURCE || 'api';

export const mockDeveloperPlatformService = new MockDeveloperPlatformService();
export const realDeveloperPlatformService = new ApiDeveloperPlatformService();
export const developerPlatformService = developerPlatformMode === 'mock' ? mockDeveloperPlatformService : realDeveloperPlatformService;
