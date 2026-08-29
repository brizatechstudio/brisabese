export type BrisaBaseSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type BrisaBaseClientOptions = {
  url: string;
  projectId: string;
  environmentId: string;
  apiKey?: string;
  session?: BrisaBaseSession;
  fetch?: typeof globalThis.fetch;
  WebSocket?: typeof globalThis.WebSocket;
  onSession?: (session: BrisaBaseSession | null) => void;
};

export type StorageObject = {
  id?: string;
  bucket?: string;
  path: string;
  name?: string;
  size?: number;
  mimeType?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type StorageListResult = {
  objects: StorageObject[];
  total: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
};

export class BrisaBaseError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BrisaBaseError';
  }
}

type RequestOptions = RequestInit & { auth?: 'auto' | 'public' | 'required' };
type Filter = { field: string; operator: string; value: unknown };

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function encodeFilter(value: unknown): string {
  if (Array.isArray(value)) return `(${value.map((item) => String(item)).join(',')})`;
  return String(value);
}

function objectPath(bucket: string, path: string): string {
  return `/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
}

async function parseResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (response.status === 204) return null;
  if (contentType.includes('application/json')) return response.json().catch(() => null);
  return response.text().catch(() => '');
}

export class BrisaBaseQueryBuilder<T = Record<string, unknown>> {
  private readonly filters: Filter[] = [];
  private selected = '*';
  private rowLimit?: number;
  private rowOffset?: number;
  private orderBy?: { field: string; ascending: boolean };

  constructor(private readonly client: BrisaBaseClient, private readonly table: string) {}

  select(columns = '*'): this { this.selected = columns; return this; }
  eq(field: string, value: unknown): this { this.filters.push({ field, operator: 'eq', value }); return this; }
  neq(field: string, value: unknown): this { this.filters.push({ field, operator: 'neq', value }); return this; }
  gt(field: string, value: unknown): this { this.filters.push({ field, operator: 'gt', value }); return this; }
  gte(field: string, value: unknown): this { this.filters.push({ field, operator: 'gte', value }); return this; }
  lt(field: string, value: unknown): this { this.filters.push({ field, operator: 'lt', value }); return this; }
  lte(field: string, value: unknown): this { this.filters.push({ field, operator: 'lte', value }); return this; }
  like(field: string, value: string): this { this.filters.push({ field, operator: 'like', value }); return this; }
  ilike(field: string, value: string): this { this.filters.push({ field, operator: 'ilike', value }); return this; }
  in(field: string, values: unknown[]): this { this.filters.push({ field, operator: 'in', value: values }); return this; }
  limit(value: number): this { this.rowLimit = value; return this; }
  offset(value: number): this { this.rowOffset = value; return this; }
  order(field: string, options: { ascending?: boolean } = {}): this { this.orderBy = { field, ascending: options.ascending !== false }; return this; }

  private listPath(): string {
    const search = new URLSearchParams();
    if (this.selected) search.set('select', this.selected);
    for (const filter of this.filters) search.append(filter.field, `${filter.operator}.${encodeFilter(filter.value)}`);
    if (this.rowLimit !== undefined) search.set('limit', String(this.rowLimit));
    if (this.rowOffset !== undefined) search.set('offset', String(this.rowOffset));
    if (this.orderBy) search.set('order', `${this.orderBy.field}.${this.orderBy.ascending ? 'asc' : 'desc'}`);
    const suffix = search.toString();
    return `/rest/v1/${encodeURIComponent(this.table)}${suffix ? `?${suffix}` : ''}`;
  }

  private mutationId(): string {
    // REST v1 intentionally performs destructive mutations by primary-key path.
    // Supporting arbitrary filter mutations in the SDK before the server does
    // would silently create a false contract, so only eq('id', value) maps to it.
    if (this.filters.length !== 1 || this.filters[0].field !== 'id' || this.filters[0].operator !== 'eq') {
      throw new BrisaBaseError("REST v1 update/delete requires exactly eq('id', value).", 400, 'PRIMARY_KEY_FILTER_REQUIRED');
    }
    return String(this.filters[0].value);
  }

  async get(): Promise<T[]> {
    return this.client.request<T[]>(this.listPath(), { method: 'GET', auth: 'auto' });
  }

  async single(): Promise<T | null> {
    const rows = await this.limit(1).get();
    return rows[0] ?? null;
  }

  async getById(id: string): Promise<T | null> {
    try {
      return await this.client.request<T>(`/rest/v1/${encodeURIComponent(this.table)}/${encodeURIComponent(id)}`, { method: 'GET', auth: 'auto' });
    } catch (error) {
      if (error instanceof BrisaBaseError && error.status === 404) return null;
      throw error;
    }
  }

  async insert(values: Partial<T> | Array<Partial<T>>): Promise<T | T[]> {
    return this.client.request<T | T[]>(`/rest/v1/${encodeURIComponent(this.table)}`, {
      method: 'POST',
      body: JSON.stringify(values),
      auth: 'auto',
    });
  }

  async update(values: Partial<T>): Promise<T | null> {
    return this.updateById(this.mutationId(), values);
  }

  async updateById(id: string, values: Partial<T>): Promise<T | null> {
    return this.client.request<T | null>(`/rest/v1/${encodeURIComponent(this.table)}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
      auth: 'auto',
    });
  }

  async delete(): Promise<void> {
    return this.deleteById(this.mutationId());
  }

  async deleteById(id: string): Promise<void> {
    await this.client.request(`/rest/v1/${encodeURIComponent(this.table)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: 'auto',
    });
  }
}

export type RealtimeSubscription = { close(): void };

export class BrisaBaseClient {
  private session: BrisaBaseSession | null;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly WebSocketCtor?: typeof globalThis.WebSocket;

  public readonly auth = {
    signUp: async (input: { email: string; password: string; displayName?: string; userMetadata?: Record<string, unknown> }) => {
      const payload = await this.request<any>('/api/auth/signup', {
        method: 'POST', auth: 'public', body: JSON.stringify({
          email: input.email,
          password: input.password,
          display_name: input.displayName,
          user_metadata: input.userMetadata,
          project_id: this.options.projectId,
          environment_id: this.options.environmentId,
        }),
      });
      this.acceptAuthPayload(payload);
      return payload;
    },
    signIn: async (input: { email: string; password: string }) => {
      const payload = await this.request<any>('/api/auth/login', {
        method: 'POST', auth: 'public', body: JSON.stringify({
          email: input.email,
          password: input.password,
          project_id: this.options.projectId,
          environment_id: this.options.environmentId,
        }),
      });
      this.acceptAuthPayload(payload);
      return payload;
    },
    signOut: async () => {
      try { await this.request('/api/auth/logout', { method: 'POST', auth: 'required' }); }
      finally { this.setSession(null); }
    },
    getUser: () => this.request('/api/auth/user', { method: 'GET', auth: 'required' }),
    refresh: () => this.refreshSession(),
    requestPasswordReset: (email: string) => this.request('/api/auth/password-reset/request', {
      method: 'POST', auth: 'public', body: JSON.stringify({ email, project_id: this.options.projectId, environment_id: this.options.environmentId }),
    }),
    confirmPasswordReset: (token: string, newPassword: string) => this.request('/api/auth/password-reset/confirm', {
      method: 'POST', auth: 'public', body: JSON.stringify({ token, new_password: newPassword }),
    }),
    changePassword: (currentPassword: string, newPassword: string) => this.request('/api/auth/password/change', {
      method: 'POST', auth: 'required', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  };

  public readonly storage = {
    list: (bucket: string, options: { prefix?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (options.prefix) search.set('prefix', options.prefix);
      if (options.limit !== undefined) search.set('limit', String(options.limit));
      if (options.offset !== undefined) search.set('offset', String(options.offset));
      return this.request<StorageListResult>(`/storage/v1/object/list/${encodeURIComponent(bucket)}${search.size ? `?${search}` : ''}`, { method: 'GET', auth: 'auto' });
    },
    upload: async (bucket: string, path: string, body: Blob | ArrayBuffer | Uint8Array | string, contentType = 'application/octet-stream') => {
      const value = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      return this.request<StorageObject>(objectPath(bucket, path), {
        method: 'POST', auth: 'required', headers: { 'Content-Type': contentType }, body: value as BodyInit,
      });
    },
    download: async (bucket: string, path: string): Promise<Blob> => {
      const response = await this.raw(objectPath(bucket, path), { method: 'GET', auth: 'required' });
      return response.blob();
    },
    createSignedUrl: (bucket: string, path: string, expiresIn = 60) => this.request<{ signedUrl: string; expiresAt: string }>(`/storage/v1/object/signed/${encodeURIComponent(bucket)}`, {
      method: 'POST', auth: 'required', body: JSON.stringify({ path, expiresIn }),
    }),
    remove: (bucket: string, path: string, options: { hard?: boolean } = {}) => this.request<{ success: boolean }>(`${objectPath(bucket, path)}${options.hard ? '?soft=false' : ''}`, { method: 'DELETE', auth: 'required' }),
    versions: (bucket: string, path: string) => this.request<StorageObject[]>(`/storage/v1/object/versions/${encodeURIComponent(bucket)}?path=${encodeURIComponent(path)}`, { method: 'GET', auth: 'required' }),
    restore: (bucket: string, path: string) => this.request<StorageObject>(`/storage/v1/object/restore/${encodeURIComponent(bucket)}`, { method: 'POST', auth: 'required', body: JSON.stringify({ path }) }),
  };

  public readonly functions = {
    invoke: <T = unknown>(slug: string, body?: unknown) => this.request<T>(`/functions/v1/${encodeURIComponent(slug)}`, {
      method: 'POST', auth: 'auto', body: JSON.stringify(body ?? {}),
    }),
  };

  public readonly graphql = {
    query: <T = unknown>(query: string, variables?: Record<string, unknown>, operationName?: string) => this.request<{ data?: T | null; errors?: Array<{ message: string; extensions?: Record<string, unknown> }> }>('/graphql/v1', {
      method: 'POST', auth: 'auto', body: JSON.stringify({ query, variables, operationName }),
    }),
    persistedQuery: <T = unknown>(sha256Hash: string, variables?: Record<string, unknown>, operationName?: string, query?: string) => this.request<{ data?: T | null; errors?: Array<{ message: string; extensions?: Record<string, unknown> }>; extensions?: Record<string, unknown> }>('/graphql/v1', {
      method: 'POST', auth: 'auto', body: JSON.stringify({ query, variables, operationName, extensions: { persistedQuery: { version: 1, sha256Hash } } }),
    }),
    schema: () => this.request<string>('/graphql/v1/schema', { method: 'GET', auth: 'auto' }),
  };

  public readonly messaging = {
    registerDevice: (input: { token: string; platform: 'web' | 'android' | 'ios'; locale?: string; timezone?: string; metadata?: Record<string, unknown> }) => this.request('/messaging/v1/devices', {
      method: 'POST', auth: 'required', body: JSON.stringify(input),
    }),
    removeDevice: (deviceId: string) => this.request(`/messaging/v1/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE', auth: 'required' }),
  };


  public readonly remoteConfig = {
    evaluate: (input: { subjectId?: string; attributes?: Record<string, unknown> } = {}) => this.request<{ config: Record<string, unknown>; flags: Record<string, { enabled: boolean; payload?: unknown; reason?: string }> }>('/config/v1/evaluate', {
      method: 'POST', auth: 'auto', body: JSON.stringify(input),
    }),
  };

  public readonly experiments = {
    assign: (key: string, input: { subjectId?: string; attributes?: Record<string, unknown> } = {}) => this.request<{ experimentKey: string; active: boolean; variant?: string; reason?: string }>(`/experiments/v1/${encodeURIComponent(key)}/assign`, {
      method: 'POST', auth: 'auto', body: JSON.stringify(input),
    }),
  };

  public readonly analytics = {
    track: (name: string, properties: Record<string, unknown> = {}, options: { subjectId?: string; sessionId?: string; userProperties?: Record<string, unknown>; occurredAt?: string } = {}) => this.request<{ accepted: number }>('/analytics/v1/events', {
      method: 'POST', auth: 'auto', body: JSON.stringify({ events: [{ name, properties, ...options }] }),
    }),
    trackBatch: (events: Array<{ name: string; subjectId?: string; sessionId?: string; properties?: Record<string, unknown>; userProperties?: Record<string, unknown>; occurredAt?: string }>) => this.request<{ accepted: number }>('/analytics/v1/events', {
      method: 'POST', auth: 'auto', body: JSON.stringify({ events }),
    }),
  };

  public readonly appQuality = {
    capture: (event: { kind: 'crash' | 'error' | 'anr' | 'performance' | 'trace'; name: string; message?: string; stack?: string; release?: string; platform?: string; severity?: 'info' | 'warning' | 'error' | 'fatal'; durationMs?: number; subjectId?: string; metadata?: Record<string, unknown>; occurredAt?: string }) => this.request<{ accepted: number }>('/quality/v1/events', {
      method: 'POST', auth: 'auto', body: JSON.stringify({ events: [event] }),
    }),
  };

  public readonly search = {
    query: <T = Record<string, unknown>>(indexKey: string, input: { query?: string; embedding?: number[]; mode?: 'text' | 'vector' | 'hybrid'; limit?: number }) => this.request<{ index: string; mode: string; results: Array<T & { score: number; textScore: number; vectorScore: number }> }>(`/search/v1/${encodeURIComponent(indexKey)}/query`, {
      method: 'POST', auth: 'auto', body: JSON.stringify(input),
    }),
  };

  public readonly ai = {
    generate: (providerKey: string, input: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; temperature?: number; maxTokens?: number; timeoutMs?: number }) => this.request<{ provider: string; model: string; content: string | null; usage?: Record<string, unknown>; costUsd?: number; requestId?: string | null }>(`/ai/v1/${encodeURIComponent(providerKey)}/generate`, {
      method: 'POST', auth: 'auto', body: JSON.stringify(input),
    }),
    embed: (providerKey: string, input: string[]) => this.request<{ provider: string; model: string; embeddings: number[][]; usage?: Record<string, unknown>; costUsd?: number }>(`/ai/v1/${encodeURIComponent(providerKey)}/embeddings`, {
      method: 'POST', auth: 'auto', body: JSON.stringify({ input }),
    }),
    rag: (input: { query: string; indexKey: string; embeddingProviderKey: string; chatProviderKey: string; limit?: number; temperature?: number; maxTokens?: number }) => this.request<any>('/ai/v1/rag', {
      method: 'POST', auth: 'auto', body: JSON.stringify(input),
    }),
  };

  constructor(private readonly options: BrisaBaseClientOptions) {
    this.session = options.session ?? null;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.WebSocketCtor = options.WebSocket ?? globalThis.WebSocket;
  }

  setSession(session: BrisaBaseSession | null): void {
    this.session = session;
    this.options.onSession?.(session);
  }

  getSession(): BrisaBaseSession | null { return this.session ? { ...this.session } : null; }
  from<T = Record<string, unknown>>(table: string): BrisaBaseQueryBuilder<T> { return new BrisaBaseQueryBuilder<T>(this, table); }

  async request<T = unknown>(path: string, init: RequestOptions = {}): Promise<T> {
    const response = await this.raw(path, init);
    return parseResponse(response) as Promise<T>;
  }

  private async raw(path: string, init: RequestOptions, retried = false): Promise<Response> {
    const headers = new Headers(init.headers || {});
    const authMode = init.auth ?? 'auto';
    const token = authMode !== 'public' ? this.session?.accessToken : undefined;

    headers.set('x-project-id', this.options.projectId);
    headers.set('x-environment-id', this.options.environmentId);
    if (!(init.body instanceof Blob) && init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

    // Never send an API key together with a user JWT. The authenticated user
    // must remain the principal for RLS and Storage ownership checks.
    if (token) headers.set('Authorization', `Bearer ${token}`);
    else if (this.options.apiKey) headers.set('apikey', this.options.apiKey);
    else if (authMode === 'required') throw new BrisaBaseError('Authentication is required.', 401, 'UNAUTHORIZED');

    const response = await this.fetcher(endpoint(this.options.url, path), { ...init, headers });
    if (response.status === 401 && !retried && this.session?.refreshToken && authMode !== 'public') {
      try {
        await this.refreshSession();
        return this.raw(path, init, true);
      } catch {
        this.setSession(null);
      }
    }
    if (!response.ok) {
      const payload = await parseResponse(response);
      throw new BrisaBaseError(payload?.error?.message || `BrisaBase request failed (${response.status}).`, response.status, payload?.error?.code, payload?.error?.details ?? payload);
    }
    return response;
  }

  private async refreshSession(): Promise<any> {
    if (!this.session?.refreshToken) throw new BrisaBaseError('Refresh token is unavailable.', 401, 'REFRESH_TOKEN_REQUIRED');
    const response = await this.fetcher(endpoint(this.options.url, '/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-project-id': this.options.projectId, 'x-environment-id': this.options.environmentId },
      body: JSON.stringify({ refresh_token: this.session.refreshToken }),
    });
    const payload = await parseResponse(response);
    if (!response.ok) throw new BrisaBaseError(payload?.error?.message || 'Session refresh failed.', response.status, payload?.error?.code, payload);
    this.acceptAuthPayload(payload);
    return payload;
  }

  private acceptAuthPayload(payload: any): void {
    const source = payload?.session ?? payload;
    const accessToken = source?.access_token;
    if (!accessToken) return;
    this.setSession({
      accessToken,
      refreshToken: source.refresh_token ?? this.session?.refreshToken,
      expiresAt: source.expires_in ? Date.now() + Number(source.expires_in) * 1000 : undefined,
    });
  }

  realtime(options: {
    channel?: string;
    schema?: string;
    table: string;
    event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
    onEvent(payload: any): void;
    onState?(state: 'connecting' | 'authenticated' | 'connected' | 'error' | 'disconnected'): void;
    onError?(message: string): void;
  }): RealtimeSubscription {
    if (!this.session?.accessToken) throw new BrisaBaseError('Realtime requires an authenticated user session.', 401, 'UNAUTHORIZED');
    if (!this.WebSocketCtor) throw new BrisaBaseError('WebSocket is not available in this runtime.', 500, 'WEBSOCKET_UNAVAILABLE');

    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectAttempts = 0;
    const channel = options.channel || `public.${options.table}`;

    const clearTimers = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      reconnectTimer = null;
      heartbeatTimer = null;
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) return;
      const delay = Math.min(30_000, 500 * Math.pow(2, Math.min(reconnectAttempts, 6))) + Math.floor(Math.random() * 250);
      reconnectAttempts += 1;
      options.onState?.('connecting');
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
    };

    const connect = () => {
      if (!active) return;
      const base = new URL(this.options.url);
      base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
      base.pathname = '/realtime/v1/websocket';
      base.search = '';
      const socket = new this.WebSocketCtor!(base.toString());
      ws = socket;
      let authenticated = false;
      options.onState?.('connecting');

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'connect', token: this.session!.accessToken, projectId: this.options.projectId, environmentId: this.options.environmentId }));
        heartbeatTimer = setInterval(() => {
          if (active && socket.readyState === this.WebSocketCtor!.OPEN) socket.send(JSON.stringify({ type: 'heartbeat', ref: `hb_${Date.now()}` }));
        }, 20_000);
      };
      socket.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.type === 'connected' && message.payload?.connectionId && !authenticated) {
            authenticated = true;
            options.onState?.('authenticated');
            socket.send(JSON.stringify({ type: 'join', channel }));
          } else if (message.type === 'joined') {
            socket.send(JSON.stringify({ type: 'subscribe', channel, schema: options.schema || 'public', table: options.table, event: options.event || '*' }));
          } else if (message.type === 'subscribed') {
            reconnectAttempts = 0;
            options.onState?.('connected');
          } else if (message.type === 'event') {
            options.onEvent(message.payload);
          } else if (message.type === 'ping') {
            socket.send(JSON.stringify({ type: 'heartbeat', ref: message.ref || `ping_${Date.now()}` }));
          } else if (message.type === 'error') {
            options.onState?.('error');
            options.onError?.(message.error?.message || 'Realtime error.');
          }
        } catch (error) {
          options.onError?.(error instanceof Error ? error.message : 'Invalid Realtime message.');
        }
      };
      socket.onerror = () => { if (active) options.onState?.('error'); };
      socket.onclose = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        if (!active) return;
        options.onState?.('disconnected');
        scheduleReconnect();
      };
    };

    connect();
    return { close: () => { active = false; clearTimers(); ws?.close(1000, 'client closed'); options.onState?.('disconnected'); } };
  }

}

export function createClient(options: BrisaBaseClientOptions): BrisaBaseClient {
  return new BrisaBaseClient(options);
}
