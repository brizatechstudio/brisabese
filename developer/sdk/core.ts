export class DeveloperSdkError extends Error {
  constructor(message: string, public readonly status?: number, public readonly code?: string) {
    super(message);
    this.name = 'DeveloperSdkError';
  }
}

export interface DeveloperSdkOptions {
  url: string;
  apiKey?: string;
  accessToken?: string;
  projectId?: string;
  environmentId?: string;
  refreshToken?: () => Promise<string | undefined>;
  retries?: number;
  cache?: boolean;
}

type Interceptor = (input: { path: string; init: RequestInit }) => RequestInit | Promise<RequestInit>;

export class DeveloperSdkCore {
  private token?: string;
  private readonly interceptors = new Set<Interceptor>();
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(private readonly options: DeveloperSdkOptions) {
    this.token = options.accessToken;
  }

  public setAccessToken(token?: string): void { this.token = token; }
  public addInterceptor(interceptor: Interceptor): () => void { this.interceptors.add(interceptor); return () => this.interceptors.delete(interceptor); }

  public async request<T>(path: string, init: RequestInit = {}, cacheTtlMs = 0): Promise<T> {
    const key = `${init.method || 'GET'}:${path}`;
    const cached = this.cache.get(key);
    if (this.options.cache && cacheTtlMs > 0 && cached && cached.expiresAt > Date.now()) return structuredClone(cached.value) as T;

    const execute = async (retry = 0): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> || {}),
        ...(this.options.projectId ? { 'x-project-id': this.options.projectId } : {}),
        ...(this.options.environmentId ? { 'x-environment-id': this.options.environmentId } : {}),
      };
      // Authenticated user JWT always wins over the public API key. Sending both
      // changes the principal seen by Storage/RLS and is therefore forbidden.
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      else if (this.options.apiKey) headers.apikey = this.options.apiKey;

      let request: RequestInit = { ...init, headers };
      for (const interceptor of this.interceptors) request = await interceptor({ path, init: request });

      const response = await fetch(`${this.options.url.replace(/\/$/, '')}${path}`, request);
      if (response.status === 401 && this.options.refreshToken && retry === 0) {
        const token = await this.options.refreshToken();
        if (token) {
          this.token = token;
          return execute(1);
        }
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 500 && retry < (this.options.retries ?? 2)) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** retry));
          return execute(retry + 1);
        }
        throw new DeveloperSdkError(body?.error?.message || `Request failed (${response.status}).`, response.status, body?.error?.code);
      }
      if (this.options.cache && cacheTtlMs > 0) this.cache.set(key, { value: structuredClone(body), expiresAt: Date.now() + cacheTtlMs });
      return body as T;
    };

    return execute();
  }

  public database(table: string) {
    return {
      select: () => this.request(`/rest/v1/${encodeURIComponent(table)}`, { method: 'GET' }, 5_000),
      insert: (values: unknown) => this.request(`/rest/v1/${encodeURIComponent(table)}`, { method: 'POST', body: JSON.stringify(values) }),
    };
  }

  public functions = { invoke: (name: string, body?: unknown) => this.request(`/functions/v1/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(body || {}) }) };
  public storage = { list: (bucket: string) => this.request(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, { method: 'GET' }) };
  public observability = { health: () => this.request('/api/observability/health', { method: 'GET' }, 2_000) };
}
