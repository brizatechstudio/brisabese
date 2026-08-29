import { ServerlessFunction } from '../types';
import { INITIAL_FUNCTIONS } from '../mocks/mockFunctions';

export interface CreateFunctionInput {
  name: string;
  runtime: 'nodejs20' | 'python311' | 'go121';
  codeSnippet: string;
}

export interface FunctionsService {
  listFunctions(): Promise<ServerlessFunction[]>;
  getFunction(id: string): Promise<ServerlessFunction | null>;
  createFunction(data: CreateFunctionInput): Promise<ServerlessFunction>;
  deployFunction(id: string): Promise<ServerlessFunction>;
  deleteFunction(id: string): Promise<void>;
  updateEnvVars(id: string, envVars: Record<string, string>): Promise<ServerlessFunction>;
  listEnvironment(): Promise<Record<string, string>>;
  invokeFunction(id: string, body?: unknown): Promise<unknown>;
  getLogs(id: string): Promise<Array<{ id: string; level: string; message: string; createdAt: string }>>;
  getMetrics(id: string): Promise<{ invocations: number; errors: number; timeouts: number; avgDurationMs: number; successRate: number }>;
}

export class MockFunctionsService implements FunctionsService {
  private functions: ServerlessFunction[] = [...INITIAL_FUNCTIONS];

  async listFunctions(): Promise<ServerlessFunction[]> {
    return [...this.functions];
  }

  async getFunction(id: string): Promise<ServerlessFunction | null> {
    const fn = this.functions.find((f) => f.id === id || f.slug === id);
    return fn ? { ...fn } : null;
  }

  async createFunction(input: CreateFunctionInput): Promise<ServerlessFunction> {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newFn: ServerlessFunction = {
      id: `fn_${Math.random().toString(36).substring(2, 9)}`,
      name: input.name,
      slug,
      runtime: input.runtime,
      status: 'active',
      invocationsTotal: 0,
      successRate: 100.0,
      avgDurationMs: 120,
      lastExecutedAt: 'Nenhuma execução',
      version: 'v1.0.0',
      codeSnippet: input.codeSnippet || `export default async function(req, res) {\n  return res.json({ message: "Hello from ${input.name}!" });\n}`,
      envVars: {}
    };
    this.functions.unshift(newFn);
    return newFn;
  }

  async deployFunction(id: string): Promise<ServerlessFunction> {
    const fn = this.functions.find((f) => f.id === id || f.slug === id);
    if (!fn) throw new Error('Function não encontrada');
    const currVersion = parseFloat(fn.version.substring(1)) || 1.0;
    fn.version = `v${(currVersion + 0.1).toFixed(1)}`;
    fn.status = 'active';
    fn.lastExecutedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    return { ...fn };
  }

  async deleteFunction(id: string): Promise<void> {
    this.functions = this.functions.filter((f) => f.id !== id && f.slug !== id);
  }

  async updateEnvVars(id: string, envVars: Record<string, string>): Promise<ServerlessFunction> {
    const fn = this.functions.find((f) => f.id === id || f.slug === id);
    if (!fn) throw new Error('Function não encontrada');
    fn.envVars = { ...envVars };
    return { ...fn };
  }

  async listEnvironment(): Promise<Record<string, string>> { return {}; }
  async invokeFunction(id: string, _body?: unknown): Promise<unknown> { await this.deployFunction(id); return { mock: true }; }
  async getLogs(): Promise<Array<{ id: string; level: string; message: string; createdAt: string }>> { return []; }
  async getMetrics(): Promise<{ invocations: number; errors: number; timeouts: number; avgDurationMs: number; successRate: number }> { return { invocations: 0, errors: 0, timeouts: 0, avgDurationMs: 0, successRate: 100 }; }
}

export class ApiFunctionsService implements FunctionsService {
  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || `Functions request failed (${response.status}).`);
    return body as T;
  }

  private map(raw: any): ServerlessFunction {
    return {
      id: raw.id, name: raw.name, slug: raw.slug, endpointUrl: `/functions/v1/${raw.slug}`,
      runtime: 'nodejs20', status: raw.status === 'draft' ? 'deploying' : raw.status === 'disabled' ? 'failed' : raw.status || 'deploying',
      invocationsTotal: raw.metrics?.invocations || 0, successRate: raw.metrics?.successRate ?? 100, avgDurationMs: raw.metrics?.avgDurationMs || 0,
      lastExecutedAt: raw.updatedAt || raw.updated_at || 'Never', version: `v${raw.currentVersion || raw.version || 1}`,
      codeSnippet: raw.code || '', envVars: {}, memoryMb: raw.limits?.memoryMb, cpuProfile: raw.limits?.cpuProfile, access: raw.access,
    };
  }
  async listFunctions(): Promise<ServerlessFunction[]> {
    const result = await this.request<any[]>('/api/functions');
    return result.map((item) => this.map(item));
  }
  async getFunction(id: string): Promise<ServerlessFunction | null> {
    return this.map(await this.request(`/api/functions/${encodeURIComponent(id)}`));
  }
  async createFunction(input: CreateFunctionInput): Promise<ServerlessFunction> {
    const created = await this.request<any>('/api/functions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name, code: input.codeSnippet, access: 'authenticated' }) });
    const deployed = await this.request<any>(`/api/functions/${encodeURIComponent(created.id)}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return this.map(deployed);
  }
  async deployFunction(id: string): Promise<ServerlessFunction> {
    return this.map(await this.request(`/api/functions/${encodeURIComponent(id)}/deploy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  }
  async deleteFunction(id: string): Promise<void> {
    const response = await fetch(`/api/functions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 204) throw new Error('Unable to delete function.');
  }
  async listEnvironment(): Promise<Record<string, string>> {
    return this.request<Record<string, string>>('/api/functions/environment/list');
  }
  async updateEnvVars(id: string, envVars: Record<string, string>): Promise<ServerlessFunction> {
    const current = await this.listEnvironment();
    const desiredNames = new Set(Object.keys(envVars).map((name) => name.trim().toUpperCase()));
    await Promise.all([
      ...Object.entries(envVars).map(([name, value]) => this.request(`/api/functions/environment/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) })),
      ...Object.keys(current).filter((name) => !desiredNames.has(name.toUpperCase())).map((name) => this.request(`/api/functions/environment/${encodeURIComponent(name)}`, { method: 'DELETE' })),
    ]);
    const item = await this.getFunction(id);
    if (!item) throw new Error('Function not found.');
    item.envVars = { ...envVars };
    return item;
  }
  async invokeFunction(id: string, body?: unknown): Promise<unknown> {
    return this.request(`/api/functions/${encodeURIComponent(id)}/invoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
  }
  async getLogs(id: string): Promise<Array<{ id: string; level: string; message: string; createdAt: string }>> {
    return this.request(`/api/functions/${encodeURIComponent(id)}/logs`);
  }
  async getMetrics(id: string): Promise<{ invocations: number; errors: number; timeouts: number; avgDurationMs: number; successRate: number }> {
    return this.request(`/api/functions/${encodeURIComponent(id)}/metrics`);
  }
}

export const mockFunctionsService = new MockFunctionsService();
export const realFunctionsService = new ApiFunctionsService();
