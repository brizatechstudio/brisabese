export interface BrisaBaseClientOptions {
  url: string;
  apiKey?: string;
  accessToken?: string;
  projectId?: string;
  environmentId?: string;
}

export type RealtimeConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'closed' | 'error';

export interface RealtimePostgresChangesConfig {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema?: string;
  table: string;
  filter?: string;
}

export interface RealtimeBroadcastConfig {
  event: string;
}

export interface RealtimePresenceConfig {
  event: 'sync' | 'join' | 'leave';
}

export interface RealtimePayload {
  event?: string;
  schema?: string;
  table?: string;
  new?: Record<string, any> | null;
  old?: Record<string, any> | null;
  eventId?: string;
  timestamp?: string;
  [key: string]: any;
}

type RealtimeCallback = (payload: RealtimePayload) => void;
type RealtimeRegistration = { event: string; config: Record<string, any>; callback: RealtimeCallback };

export class BrisaBaseRealtimeChannel {
  private client: BrisaBaseClient;
  private channelName: string;
  private ws: WebSocket | null = null;
  private callbacks: RealtimeRegistration[] = [];
  private subscribed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceState: Record<string, any> = {};
  private connectionState: RealtimeConnectionState = 'disconnected';
  private stateCallbacks = new Set<(state: RealtimeConnectionState) => void>();
  private subscribeResolve?: (channel: this) => void;
  private subscribeReject?: (error: Error) => void;
  private subscribeTimer: ReturnType<typeof setTimeout> | null = null;
  private joined = false;
  private expectedSubscriptions = 0;
  private acknowledgedSubscriptions = 0;

  constructor(client: BrisaBaseClient, channelName: string) {
    this.client = client;
    this.channelName = channelName;
  }

  public on(event: string, config: any, callback: RealtimeCallback): this {
    this.callbacks.push({ event, config: config || {}, callback });
    return this;
  }

  public async subscribe(): Promise<this> {
    if (this.connectionState === 'connected' && this.subscribed) return this;
    this.subscribed = true;
    this.setConnectionState('connecting');
    return new Promise<this>((resolve, reject) => {
      this.subscribeResolve = resolve;
      this.subscribeReject = reject;
      this.connect();
    });
  }

  public async unsubscribe(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', channel: this.channelName }));
      this.ws.send(JSON.stringify({ type: 'leave', channel: this.channelName }));
    }
    this.subscribed = false;
    this.joined = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.subscribeTimer) clearTimeout(this.subscribeTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('closed');
  }

  public send(message: { type: string; event?: string; payload?: any }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'broadcast',
        channel: this.channelName,
        event: message.event || 'broadcast',
        payload: message.payload,
      }));
    }
  }

  public track(metadata: Record<string, any> = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'presence',
        channel: this.channelName,
        event: 'track',
        state: metadata,
      }));
    }
  }

  public untrack(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'presence',
        channel: this.channelName,
        event: 'untrack',
      }));
    }
  }

  public getConnectionState(): RealtimeConnectionState {
    return this.connectionState;
  }

  public onStateChange(callback: (state: RealtimeConnectionState) => void): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  public getPresenceState(): Record<string, any> {
    return { ...this.presenceState };
  }

  private connect(): void {
    const wsUrl = this.buildWebSocketUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.setConnectionState('connecting');
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;

      // Authenticate
      this.ws?.send(JSON.stringify({
        type: 'connect',
        token: this.client.getAccessToken(),
        apiKey: this.client.getApiKey(),
        projectId: this.client.getProjectId(),
        environmentId: this.client.getEnvironmentId(),
      }));

      this.subscribeTimer = setTimeout(() => this.failSubscribe(new Error('Realtime connection timed out.')), 10_000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleServerMessage(msg);
      } catch (err) {
        // Ignore invalid messages
      }
    };

    this.ws.onclose = () => {
      this.setConnectionState('disconnected');
      this.ws = null;
      if (this.subscribed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.setConnectionState('error');
    };
  }

  private handleServerMessage(msg: any): void {
    switch (msg.type) {
      case 'connected': {
        if (!this.ws || this.connectionState === 'closed') break;
        // The server emits an unauthenticated transport-ready notification
        // before it finishes processing the explicit `connect` message. Only
        // the authenticated acknowledgement contains a connectionId. Joining
        // on the transport notification races authentication and is rejected
        // by the server with NOT_AUTHENTICATED.
        if (!msg.payload?.connectionId) break;
        this.setConnectionState('connected');
        this.ws.send(JSON.stringify({ type: 'join', channel: this.channelName }));
        break;
      }
      case 'joined': {
        this.joined = true;
        this.expectedSubscriptions = this.callbacks.filter((registration) => registration.event === 'postgres_changes').length;
        this.acknowledgedSubscriptions = 0;
        if (this.ws) {
          for (const registration of this.callbacks) {
            if (registration.event === 'postgres_changes') {
              this.ws.send(JSON.stringify({
                type: 'subscribe', channel: this.channelName,
                schema: registration.config.schema || 'public', table: registration.config.table,
                event: registration.config.event || '*', filter: registration.config.filter,
              }));
            }
          }
        }
        this.resolveSubscribeIfReady();
        break;
      }
      case 'subscribed': {
        this.acknowledgedSubscriptions += 1;
        this.resolveSubscribeIfReady();
        break;
      }
      case 'event': {
        this.dispatchCallbacks('postgres_changes', msg.payload, (config, payload) =>
          (!config.event || config.event === '*' || config.event === payload.event)
          && (!config.schema || config.schema === payload.schema)
          && (!config.table || config.table === payload.table)
        );
        break;
      }
      case 'broadcast': {
        this.dispatchCallbacks('broadcast', { event: msg.event, payload: msg.payload }, (config, payload) => !config.event || config.event === payload.event);
        break;
      }
      case 'presence_state': {
        this.presenceState = msg.state || {};
        this.dispatchCallbacks('presence', { event: 'sync', state: this.presenceState }, (config, payload) => !config.event || config.event === payload.event);
        break;
      }
      case 'presence_join': {
        this.dispatchCallbacks('presence', { event: 'join', state: msg.state }, (config, payload) => !config.event || config.event === payload.event);
        break;
      }
      case 'presence_leave': {
        this.dispatchCallbacks('presence', { event: 'leave', state: msg.state }, (config, payload) => !config.event || config.event === payload.event);
        break;
      }
      case 'pong': {
        // Heartbeat response
        break;
      }
      case 'error': {
        this.dispatchCallbacks('error', { error: msg.error });
        if (!this.joined) this.failSubscribe(new Error(msg.error?.message || 'Realtime protocol error.'));
        break;
      }
    }
  }

  private dispatchCallbacks(eventType: string, payload: RealtimePayload, matches: (config: Record<string, any>, payload: RealtimePayload) => boolean = () => true): void {
    for (const registration of this.callbacks) {
      if (registration.event === eventType && matches(registration.config, payload)) {
        try {
          registration.callback(payload);
        } catch (err) {
          console.error('Realtime callback error:', err);
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setConnectionState('closed');
      return;
    }

    this.setConnectionState('reconnecting');
    this.reconnectAttempts += 1;
    const delay = Math.min(30_000, 1_000 * Math.pow(2, this.reconnectAttempts - 1));
    this.reconnectDelay = delay + Math.floor(Math.random() * Math.min(1_000, delay / 2));

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  private buildWebSocketUrl(): string {
    const baseUrl = this.client.getBaseUrl().replace(/^http/, 'ws').replace(/\/$/, '');
    return `${baseUrl}/realtime/v1/websocket`;
  }

  private resolveSubscribeIfReady(): void {
    if (!this.joined || this.acknowledgedSubscriptions < this.expectedSubscriptions) return;
    if (this.subscribeTimer) clearTimeout(this.subscribeTimer);
    this.subscribeTimer = null;
    const resolve = this.subscribeResolve;
    this.subscribeResolve = undefined;
    this.subscribeReject = undefined;
    resolve?.(this);
  }

  private failSubscribe(error: Error): void {
    if (this.subscribeTimer) clearTimeout(this.subscribeTimer);
    this.subscribeTimer = null;
    const reject = this.subscribeReject;
    this.subscribeResolve = undefined;
    this.subscribeReject = undefined;
    reject?.(error);
  }

  private setConnectionState(state: RealtimeConnectionState): void {
    this.connectionState = state;
    for (const callback of this.stateCallbacks) callback(state);
  }
}

export class BrisaBaseQueryBuilder<T = any> {
  private tableName: string;
  private baseUrl: string;
  private apiKey?: string;
  private accessToken?: string;

  private selectQuery?: string;
  private filters: string[] = [];
  private orderQuery?: string;
  private limitValue?: number;
  private offsetValue?: number;

  constructor(tableName: string, options: BrisaBaseClientOptions) {
    this.tableName = tableName;
    this.baseUrl = options.url.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.accessToken = options.accessToken;
  }

  public select(columns: string = '*'): this {
    this.selectQuery = columns;
    return this;
  }

  public eq(column: string, value: any): this {
    this.filters.push(`${column}=eq.${value}`);
    return this;
  }

  public neq(column: string, value: any): this {
    this.filters.push(`${column}=neq.${value}`);
    return this;
  }

  public gt(column: string, value: any): this {
    this.filters.push(`${column}=gt.${value}`);
    return this;
  }

  public gte(column: string, value: any): this {
    this.filters.push(`${column}=gte.${value}`);
    return this;
  }

  public lt(column: string, value: any): this {
    this.filters.push(`${column}=lt.${value}`);
    return this;
  }

  public lte(column: string, value: any): this {
    this.filters.push(`${column}=lte.${value}`);
    return this;
  }

  public ilike(column: string, pattern: string): this {
    this.filters.push(`${column}=ilike.${pattern}`);
    return this;
  }

  public in(column: string, values: any[]): this {
    this.filters.push(`${column}=in.(${values.join(',')})`);
    return this;
  }

  public order(column: string, options?: { ascending?: boolean }): this {
    const dir = options?.ascending === false ? 'desc' : 'asc';
    this.orderQuery = `order=${column}.${dir}`;
    return this;
  }

  public limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  public offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) headers['apikey'] = this.apiKey;
    if (this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;
    return headers;
  }

  public async get(): Promise<{ data: T[] | null; error: any }> {
    try {
      const queryParams: string[] = [];
      if (this.selectQuery) queryParams.push(`select=${encodeURIComponent(this.selectQuery)}`);
      if (this.filters.length > 0) queryParams.push(...this.filters);
      if (this.orderQuery) queryParams.push(this.orderQuery);
      if (this.limitValue !== undefined) queryParams.push(`limit=${this.limitValue}`);
      if (this.offsetValue !== undefined) queryParams.push(`offset=${this.offsetValue}`);

      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const endpoint = `${this.baseUrl}/rest/v1/${this.tableName}${queryString}`;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const body = await res.json();
      if (!res.ok) return { data: null, error: body.error || body };
      return { data: body as T[], error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  public async insert(data: Partial<T> | Partial<T>[]): Promise<{ data: T | T[] | null; error: any }> {
    try {
      const endpoint = `${this.baseUrl}/rest/v1/${this.tableName}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });

      const body = await res.json();
      if (!res.ok) return { data: null, error: body.error || body };
      return { data: body, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  public async update(data: Partial<T>, id: string): Promise<{ data: T | null; error: any }> {
    try {
      const endpoint = `${this.baseUrl}/rest/v1/${this.tableName}/${id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });

      const body = await res.json();
      if (!res.ok) return { data: null, error: body.error || body };
      return { data: body, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }

  public async delete(id: string): Promise<{ success: boolean; error: any }> {
    try {
      const endpoint = `${this.baseUrl}/rest/v1/${this.tableName}/${id}`;
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        const body = await res.json();
        return { success: false, error: body.error || body };
      }
      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: { message: err.message } };
    }
  }
}

export interface StorageClientResult<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export interface StorageListOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  search?: string;
}

export interface StorageObject {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  etag?: string;
  checksum?: string;
  metadata: Record<string, unknown>;
  version: number;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageImageTransformOptions {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  crop?: 'center' | 'north' | 'south' | 'east' | 'west';
  rotate?: number;
  quality?: number;
  format?: 'original' | 'webp' | 'avif' | 'jpeg' | 'png';
}

export interface StorageObjectVersion {
  id: string;
  objectId: string;
  path: string;
  version: number;
  size: number;
  mimeType: string;
  etag?: string;
  checksum?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function storagePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export class BrisaBaseStorageBucketClient {
  constructor(private readonly client: BrisaBaseClient, private readonly bucket: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    const apiKey = this.client.getApiKey();
    const accessToken = this.client.getAccessToken();
    const projectId = this.client.getProjectId();
    const environmentId = this.client.getEnvironmentId();
    if (apiKey) headers.apikey = apiKey;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (projectId) headers['x-project-id'] = projectId;
    if (environmentId) headers['x-environment-id'] = environmentId;
    return headers;
  }

  private async error(response: Response): Promise<{ code: string; message: string }> {
    const body = await response.json().catch(() => null);
    return body?.error || { code: 'STORAGE_ERROR', message: `Storage request failed (${response.status}).` };
  }

  public async upload(path: string, file: Blob | ArrayBuffer | string, options: { metadata?: Record<string, unknown>; cacheControl?: string; contentEncoding?: string; contentLanguage?: string; upsert?: boolean } = {}): Promise<StorageClientResult<StorageObject>> {
    try {
      const contentType = file instanceof Blob && file.type ? file.type : 'application/octet-stream';
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(this.bucket)}/${storagePath(path)}`, {
        method: 'POST',
        headers: this.headers({
          'Content-Type': contentType,
          ...(options.metadata ? { 'x-storage-metadata': JSON.stringify(options.metadata) } : {}),
          ...(options.cacheControl ? { 'Cache-Control': options.cacheControl } : {}),
          ...(options.contentEncoding ? { 'Content-Encoding': options.contentEncoding } : {}),
          ...(options.contentLanguage ? { 'Content-Language': options.contentLanguage } : {}),
        }),
        body: file as BodyInit,
      });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.json(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  public async download(path: string): Promise<StorageClientResult<Blob>> {
    try {
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(this.bucket)}/${storagePath(path)}`, { headers: this.headers() });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.blob(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  public getPublicUrl(path: string): { data: { publicUrl: string } } {
    const url = new URL(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${storagePath(path)}`);
    const projectId = this.client.getProjectId();
    const environmentId = this.client.getEnvironmentId();
    if (projectId) url.searchParams.set('project', projectId);
    if (environmentId) url.searchParams.set('environment', environmentId);
    return { data: { publicUrl: url.toString() } };
  }

  public async createSignedUrl(path: string, expiresIn: number): Promise<StorageClientResult<{ signedUrl: string; expiresAt: string }>> {
    try {
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/signed/${encodeURIComponent(this.bucket)}`, {
        method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ path, expiresIn }),
      });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.json(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  public async list(prefix = '', options: StorageListOptions = {}): Promise<StorageClientResult<StorageObject[]>> {
    try {
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      for (const [key, value] of Object.entries(options)) if (value !== undefined) params.set(key, String(value));
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/list/${encodeURIComponent(this.bucket)}?${params}`, { headers: this.headers() });
      if (!response.ok) return { data: null, error: await this.error(response) };
      const body = await response.json();
      return { data: body.objects || [], error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  public async listVersions(path: string): Promise<StorageClientResult<StorageObjectVersion[]>> {
    try {
      const params = new URLSearchParams({ path });
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/versions/${encodeURIComponent(this.bucket)}?${params}`, { headers: this.headers() });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.json(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  /** Restores a soft-deleted object, or creates a new version from a historical version. */
  public async restore(path: string, version?: number): Promise<StorageClientResult<StorageObject>> {
    try {
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/restore/${encodeURIComponent(this.bucket)}`, {
        method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ path, ...(version === undefined ? {} : { version }) }),
      });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.json(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  /** Fetches a resized/converted derivative without changing the stored original. */
  public async transform(path: string, options: StorageImageTransformOptions = {}): Promise<StorageClientResult<Blob>> {
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options)) if (value !== undefined) params.set(key, String(value));
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/render/${encodeURIComponent(this.bucket)}/${storagePath(path)}?${params}`, { headers: this.headers() });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.blob(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }

  public async remove(paths: string[]): Promise<StorageClientResult<{ path: string }[]>> {
    const deleted: { path: string }[] = [];
    for (const path of paths) {
      try {
        const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(this.bucket)}/${storagePath(path)}`, { method: 'DELETE', headers: this.headers() });
        if (!response.ok) return { data: null, error: await this.error(response) };
        deleted.push({ path });
      } catch (error: any) {
        return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
      }
    }
    return { data: deleted, error: null };
  }

  public async move(from: string, to: string): Promise<StorageClientResult<StorageObject>> {
    return this.copyOrMove('move', from, to);
  }

  public async copy(from: string, to: string): Promise<StorageClientResult<StorageObject>> {
    return this.copyOrMove('copy', from, to);
  }

  private async copyOrMove(operation: 'copy' | 'move', from: string, to: string): Promise<StorageClientResult<StorageObject>> {
    try {
      const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}/storage/v1/object/${operation}/${encodeURIComponent(this.bucket)}`, {
        method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ from, to }),
      });
      if (!response.ok) return { data: null, error: await this.error(response) };
      return { data: await response.json(), error: null };
    } catch (error: any) {
      return { data: null, error: { code: 'STORAGE_CLIENT_ERROR', message: error.message } };
    }
  }
}

export class BrisaBaseStorageClient {
  constructor(private readonly client: BrisaBaseClient) {}
  public from(bucket: string): BrisaBaseStorageBucketClient {
    return new BrisaBaseStorageBucketClient(this.client, bucket);
  }
}

export interface SecurityPolicyInput {
  resourceType: 'table' | 'storage';
  resource: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  name: string;
  condition: string;
  enabled?: boolean;
}

/** Control-plane client for policy management and safe, scoped policy simulation. */
export class BrisaBaseSecurityClient {
  constructor(private readonly client: BrisaBaseClient) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.client.getApiKey()) headers.apikey = this.client.getApiKey()!;
    if (this.client.getAccessToken()) headers.Authorization = `Bearer ${this.client.getAccessToken()}`;
    if (this.client.getProjectId()) headers['x-project-id'] = this.client.getProjectId()!;
    if (this.client.getEnvironmentId()) headers['x-environment-id'] = this.client.getEnvironmentId()!;
    return headers;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}${path}`, { ...init, headers: { ...this.headers(), ...(init?.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || `Security request failed (${response.status}).`);
    return body as T;
  }

  public listPolicies(): Promise<any[]> { return this.request('/api/security/policies'); }
  public createPolicy(input: SecurityPolicyInput): Promise<any> { return this.request('/api/security/policies', { method: 'POST', body: JSON.stringify(input) }); }
  public testPolicy(input: Record<string, unknown>): Promise<any> { return this.request('/api/security/test-policy', { method: 'POST', body: JSON.stringify(input) }); }
  public simulate(context: Record<string, unknown>, input: Record<string, unknown>): Promise<any> { return this.request('/api/security/simulate', { method: 'POST', body: JSON.stringify({ context, input }) }); }
}

/** Read-only operational telemetry and scoped alert configuration. */
export class BrisaBaseObservabilityClient {
  constructor(private readonly client: BrisaBaseClient) {}
  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.client.getApiKey()) headers.apikey = this.client.getApiKey()!;
    if (this.client.getAccessToken()) headers.Authorization = `Bearer ${this.client.getAccessToken()}`;
    if (this.client.getProjectId()) headers['x-project-id'] = this.client.getProjectId()!;
    if (this.client.getEnvironmentId()) headers['x-environment-id'] = this.client.getEnvironmentId()!;
    return headers;
  }
  private async request<T>(path: string): Promise<T> { const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}${path}`, { headers: this.headers() }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message || `Observability request failed (${response.status}).`); return body as T; }
  public logs(filters: Record<string, string | number | undefined> = {}): Promise<any[]> { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString(); return this.request(`/api/observability/logs${query ? `?${query}` : ''}`); }
  public metrics(filters: Record<string, string | number | undefined> = {}): Promise<any> { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString(); return this.request(`/api/observability/metrics${query ? `?${query}` : ''}`); }
  public traces(filters: Record<string, string | number | undefined> = {}): Promise<any[]> { const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString(); return this.request(`/api/observability/traces${query ? `?${query}` : ''}`); }
  public health(): Promise<any[]> { return this.request('/api/observability/health'); }
  public overview(): Promise<any> { return this.request('/api/observability/overview'); }
}

/** Control-plane client for regions, cluster nodes, deployments, scaling and health. */
export class BrisaBaseInfrastructureClient {
  constructor(private readonly client: BrisaBaseClient) {}
  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.client.getApiKey()) headers.apikey = this.client.getApiKey()!;
    if (this.client.getAccessToken()) headers.Authorization = `Bearer ${this.client.getAccessToken()}`;
    if (this.client.getProjectId()) headers['x-project-id'] = this.client.getProjectId()!;
    if (this.client.getEnvironmentId()) headers['x-environment-id'] = this.client.getEnvironmentId()!;
    return headers;
  }
  private async request<T>(path: string): Promise<T> { const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}${path}`, { headers: this.headers() }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error?.message || `Infrastructure request failed (${response.status}).`); return body as T; }
  public getOverview(): Promise<any> { return this.request('/api/infrastructure/overview'); }
  public getRegions(): Promise<any[]> { return this.request('/api/infrastructure/regions'); }
  public getNodes(): Promise<any[]> { return this.request('/api/infrastructure/nodes'); }
  public getDeployments(): Promise<any[]> { return this.request('/api/infrastructure/deployments'); }
  public getScaling(): Promise<any> { return this.request('/api/infrastructure/scaling'); }
  public getHealth(): Promise<any> { return this.request('/api/infrastructure/health'); }
  public getServices(): Promise<any[]> { return this.request('/api/infrastructure/services'); }
  public getReplication(): Promise<any[]> { return this.request('/api/infrastructure/replication'); }
}

/** Public Auth API client. It never persists credentials on its own. */
export class BrisaBaseAuthClient {
  constructor(private readonly client: BrisaBaseClient) {}

  private scope(): Record<string, string> {
    const projectId = this.client.getProjectId();
    const environmentId = this.client.getEnvironmentId();
    return { ...(projectId ? { project_id: projectId } : {}), ...(environmentId ? { environment_id: environmentId } : {}) };
  }

  private async request<T>(path: string, payload?: Record<string, unknown>, token?: string): Promise<T> {
    const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}${path}`, {
      method: path === '/api/auth/user' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(path === '/api/auth/user' ? {} : { body: JSON.stringify(payload || {}) }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || `Auth request failed (${response.status}).`);
    return body as T;
  }

  public signUp(input: { email: string; password: string; displayName?: string; userMetadata?: Record<string, unknown> }): Promise<any> {
    return this.request('/api/auth/signup', { ...this.scope(), email: input.email, password: input.password, display_name: input.displayName, user_metadata: input.userMetadata });
  }
  public signInWithPassword(email: string, password: string): Promise<any> { return this.request('/api/auth/login', { ...this.scope(), email, password }); }
  public refreshSession(refreshToken: string): Promise<any> { return this.request('/api/auth/refresh', { refresh_token: refreshToken }); }
  public getUser(accessToken = this.client.getAccessToken()): Promise<any> { if (!accessToken) return Promise.reject(new Error('An access token is required.')); return this.request('/api/auth/user', undefined, accessToken); }
  public signOut(accessToken = this.client.getAccessToken()): Promise<any> { return this.request('/api/auth/logout', {}, accessToken); }
  public signOutAll(accessToken = this.client.getAccessToken()): Promise<any> { return this.request('/api/auth/logout-all', {}, accessToken); }
  public requestPasswordReset(email: string): Promise<any> { return this.request('/api/auth/password-reset/request', { ...this.scope(), email }); }
  public confirmPasswordReset(token: string, newPassword: string): Promise<any> { return this.request('/api/auth/password-reset/confirm', { token, new_password: newPassword }); }
}

/** Public Functions API client for control, invocation, logs and metrics. */
export class BrisaBaseFunctionsClient {
  constructor(private readonly client: BrisaBaseClient) {}
  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.client.getApiKey()) headers.apikey = this.client.getApiKey()!;
    if (this.client.getAccessToken()) headers.Authorization = `Bearer ${this.client.getAccessToken()}`;
    if (this.client.getProjectId()) headers['x-project-id'] = this.client.getProjectId()!;
    if (this.client.getEnvironmentId()) headers['x-environment-id'] = this.client.getEnvironmentId()!;
    return headers;
  }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.client.getBaseUrl().replace(/\/$/, '')}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message || `Functions request failed (${response.status}).`);
    return body as T;
  }
  public list(): Promise<any[]> { return this.request('/api/functions'); }
  public create(input: Record<string, unknown>): Promise<any> { return this.request('/api/functions', { method: 'POST', body: JSON.stringify(input) }); }
  public deploy(id: string, version?: number): Promise<any> { return this.request(`/api/functions/${encodeURIComponent(id)}/deploy`, { method: 'POST', body: JSON.stringify(version === undefined ? {} : { version }) }); }
  public invoke(idOrSlug: string, body?: unknown): Promise<any> { return this.request(`/functions/v1/${encodeURIComponent(idOrSlug)}`, { method: 'POST', body: JSON.stringify(body ?? {}) }); }
  public logs(id: string, limit = 100): Promise<any[]> { return this.request(`/api/functions/${encodeURIComponent(id)}/logs?limit=${encodeURIComponent(String(limit))}`); }
  public metrics(id: string): Promise<any> { return this.request(`/api/functions/${encodeURIComponent(id)}/metrics`); }
}

export class BrisaBaseClient {
  private options: BrisaBaseClientOptions;
  public readonly auth: BrisaBaseAuthClient;
  public readonly storage: BrisaBaseStorageClient;
  public readonly functions: BrisaBaseFunctionsClient;
  public readonly security: BrisaBaseSecurityClient;
  public readonly observability: BrisaBaseObservabilityClient;
  public readonly infrastructure: BrisaBaseInfrastructureClient;

  constructor(options: BrisaBaseClientOptions) {
    this.options = options;
    this.auth = new BrisaBaseAuthClient(this);
    this.storage = new BrisaBaseStorageClient(this);
    this.functions = new BrisaBaseFunctionsClient(this);
    this.security = new BrisaBaseSecurityClient(this);
    this.observability = new BrisaBaseObservabilityClient(this);
    this.infrastructure = new BrisaBaseInfrastructureClient(this);
  }

  public from<T = any>(tableName: string): BrisaBaseQueryBuilder<T> {
    return new BrisaBaseQueryBuilder<T>(tableName, this.options);
  }

  public channel(channelName: string): BrisaBaseRealtimeChannel {
    return new BrisaBaseRealtimeChannel(this, channelName);
  }

  public getBaseUrl(): string {
    return this.options.url;
  }

  public getApiKey(): string | undefined {
    return this.options.apiKey;
  }

  public getAccessToken(): string | undefined {
    return this.options.accessToken;
  }

  public setAccessToken(accessToken?: string): void {
    this.options.accessToken = accessToken;
  }

  public getProjectId(): string | undefined {
    return (this.options as any).projectId;
  }

  public getEnvironmentId(): string | undefined {
    return (this.options as any).environmentId;
  }
}
