import { ApiEndpoint, ApiKeyItem, WebhookDeliveryItem, WebhookItem } from '../types';
import { MOCK_REST_ENDPOINTS, INITIAL_API_KEYS, INITIAL_WEBHOOKS } from '../mocks/mockApis';

export interface ApiExplorerResponse {
  statusCode: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  data: any;
}

export interface ApiService {
  supportsWebhooks: boolean;
  listEndpoints(): Promise<ApiEndpoint[]>;
  listApiKeys(): Promise<ApiKeyItem[]>;
  createApiKey(name: string, type: 'public' | 'secret' | 'service'): Promise<ApiKeyItem & { fullSecretKey?: string }>;
  revokeApiKey(keyId: string): Promise<void>;
  listWebhooks(): Promise<WebhookItem[]>;
  createWebhook(name: string, targetUrl: string, events: string[]): Promise<WebhookItem>;
  testWebhook(webhookId: string): Promise<{ success: boolean; statusCode: number; responseTimeMs: number; message: string }>;
  deleteWebhook(webhookId: string): Promise<void>;
  listWebhookDeliveries(webhookId?: string): Promise<WebhookDeliveryItem[]>;
  replayWebhookDelivery(deliveryId: string): Promise<WebhookDeliveryItem>;
  rotateWebhookSecret(webhookId: string): Promise<string>;
  executeApiExplorerRequest(params: {
    method: string;
    endpoint: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<ApiExplorerResponse>;
}

export class MockApiService implements ApiService {
  readonly supportsWebhooks = true;
  private endpoints: ApiEndpoint[] = [...MOCK_REST_ENDPOINTS];
  private apiKeys: ApiKeyItem[] = [...INITIAL_API_KEYS];
  private webhooks: WebhookItem[] = [...INITIAL_WEBHOOKS];

  async listEndpoints(): Promise<ApiEndpoint[]> {
    return [...this.endpoints];
  }

  async listApiKeys(): Promise<ApiKeyItem[]> {
    return [...this.apiKeys];
  }

  async createApiKey(name: string, type: 'public' | 'secret' | 'service'): Promise<ApiKeyItem & { fullSecretKey?: string }> {
    const randomHex = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const prefix = `bb_${type === 'public' ? 'pub' : 'sec'}_live_${randomHex.substring(0, 4)}`;
    const fullSecretKey = `${prefix}${randomHex}`;
    const newKey: ApiKeyItem & { fullSecretKey?: string } = {
      id: `key_${Math.random().toString(36).substring(2, 9)}`,
      name,
      type,
      keyPrefix: prefix,
      fullKeyMock: `${prefix}...`,
      fullSecretKey,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      lastUsedAt: 'Nunca',
      status: 'active',
    };
    this.apiKeys.unshift(newKey);
    return newKey;
  }

  async revokeApiKey(keyId: string): Promise<void> {
    this.apiKeys = this.apiKeys.filter((k) => k.id !== keyId);
  }

  async listWebhooks(): Promise<WebhookItem[]> {
    return [...this.webhooks];
  }

  async createWebhook(name: string, targetUrl: string, events: string[]): Promise<WebhookItem> {
    const newWh: WebhookItem = {
      id: `wh_${Math.random().toString(36).substring(2, 9)}`,
      name,
      targetUrl,
      events,
      status: 'active',
      lastTriggeredAt: 'Nunca',
      successRate: 100.0,
    };
    this.webhooks.unshift(newWh);
    return newWh;
  }

  async testWebhook(webhookId: string): Promise<{ success: boolean; statusCode: number; responseTimeMs: number; message: string }> {
    const wh = this.webhooks.find((w) => w.id === webhookId);
    if (wh) {
      wh.lastTriggeredAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    }
    return {
      success: true,
      statusCode: 200,
      responseTimeMs: Math.floor(Math.random() * 80) + 40,
      message: 'HTTP/1.1 200 OK — Payload de teste entregue com sucesso.',
    };
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    this.webhooks = this.webhooks.filter((w) => w.id !== webhookId);
  }

  async listWebhookDeliveries(): Promise<WebhookDeliveryItem[]> { return []; }
  async replayWebhookDelivery(deliveryId: string): Promise<WebhookDeliveryItem> {
    return { id:`replay_${deliveryId}`, webhookId:'mock', eventType:'webhook.test', status:'delivered', attemptCount:1, responseStatus:200, responseTimeMs:40, createdAt:new Date().toISOString() };
  }
  async rotateWebhookSecret(): Promise<string> { return `whsec_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`; }

  async executeApiExplorerRequest(params: {
    method: string;
    endpoint: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<ApiExplorerResponse> {
    const startTime = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const durationMs = Math.round(performance.now() - startTime);

    return {
      statusCode: 200,
      statusText: 'OK',
      durationMs,
      headers: {
        'content-type': 'application/json',
        'x-request-id': `req_mock_${Math.random().toString(36).substring(2, 8)}`,
      },
      data: [
        { id: 'prod_101', name: 'Subscrição PRO Mensal', price: 99.9, stock: 9999 },
        { id: 'prod_102', name: 'Plano Enterprise Anual', price: 2990.0, stock: 500 },
      ],
    };
  }
}

export const mockApiService = new MockApiService();

export class RealApiService implements ApiService {
  readonly supportsWebhooks = true;

  private getScope(): { projectId: string; environmentId: string } {
    const projectId = window.localStorage.getItem('brisabase.projectId') || '';
    const environmentId = window.localStorage.getItem('brisabase.environmentId') || '';
    return { projectId, environmentId };
  }
  async listEndpoints(): Promise<ApiEndpoint[]> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch('/api/database/tables');
    if (!res.ok) throw new Error('Falha ao listar endpoints da API.');
    const tables = await res.json();
    const endpoints: ApiEndpoint[] = [];
    tables.forEach((t: any) => {
      const tName = t.name;
      endpoints.push(
        {
          id: `ep_get_${tName}`,
          method: 'GET',
          path: `/rest/v1/${tName}`,
          service: 'database',
          requests24h: 0,
          avgLatencyMs: 0,
          successRate: 100,
          description: `Listar ou filtrar registros da tabela '${tName}'`,
          authRequired: true,
        },
        {
          id: `ep_post_${tName}`,
          method: 'POST',
          path: `/rest/v1/${tName}`,
          service: 'database',
          requests24h: 0,
          avgLatencyMs: 0,
          successRate: 100,
          description: `Criar um novo registro ou lote em '${tName}'`,
          authRequired: true,
        },
        {
          id: `ep_patch_${tName}`,
          method: 'PATCH',
          path: `/rest/v1/${tName}/:id`,
          service: 'database',
          requests24h: 0,
          avgLatencyMs: 0,
          successRate: 100,
          description: `Atualizar parcialmente um registro em '${tName}'`,
          authRequired: true,
        },
        {
          id: `ep_delete_${tName}`,
          method: 'DELETE',
          path: `/rest/v1/${tName}/:id`,
          service: 'database',
          requests24h: 0,
          avgLatencyMs: 0,
          successRate: 100,
          description: `Remover um registro da tabela '${tName}'`,
          authRequired: true,
        }
      );
    });
    return endpoints;
  }

  async listApiKeys(): Promise<ApiKeyItem[]> {
    const { projectId } = this.getScope();
    if (!projectId) throw new Error('Nenhum projeto ativo selecionado.');
    const res = await fetch(`/api/projects/${projectId}/api-keys`);
    if (!res.ok) throw new Error('Falha ao listar API keys.');
    const data = await res.json();
    return data.map((k: any) => ({
      id: k.id,
      name: k.name,
      type: k.type,
      keyPrefix: k.key_prefix,
      fullKeyMock: `${k.key_prefix}...`,
      createdAt: new Date(k.created_at).toLocaleString('pt-BR'),
      lastUsedAt: k.last_used_at ? new Date(k.last_used_at).toLocaleString('pt-BR') : 'Nunca',
      status: k.revoked_at ? 'inactive' : 'active',
    }));
  }

  async createApiKey(name: string, type: 'public' | 'secret' | 'service'): Promise<ApiKeyItem & { fullSecretKey?: string }> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId) throw new Error('Nenhum projeto ativo selecionado.');
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, environment_id: environmentId }),
    });
    if (!res.ok) throw new Error('Falha ao criar API Key');
    const data = await res.json();
    return {
      id: data.apiKey.id,
      name: data.apiKey.name,
      type: data.apiKey.type,
      keyPrefix: data.apiKey.key_prefix,
      fullKeyMock: `${data.apiKey.key_prefix}...`,
      fullSecretKey: data.fullSecretKey,
      createdAt: new Date(data.apiKey.created_at).toLocaleString('pt-BR'),
      lastUsedAt: 'Nunca',
      status: 'active',
    };
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const res = await fetch(`/api/api-keys/${keyId}/revoke`, { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao revogar chave de API');
  }

  async listWebhooks(): Promise<WebhookItem[]> {
    const [hooksRes, deliveriesRes] = await Promise.all([fetch('/api/webhooks'), fetch('/api/webhooks/deliveries/history?limit=500')]);
    if (!hooksRes.ok) throw new Error('Falha ao listar webhooks.');
    const hooks = await hooksRes.json();
    const deliveries = deliveriesRes.ok ? await deliveriesRes.json() : [];
    return hooks.map((w: any) => {
      const related = deliveries.filter((d: any) => d.webhookId === w.id);
      const delivered = related.filter((d: any) => d.status === 'delivered').length;
      const completed = related.filter((d: any) => ['delivered','dead_letter'].includes(d.status)).length;
      return {
        id: w.id,
        name: w.name,
        targetUrl: w.targetUrl,
        events: w.events || [],
        status: !w.active ? 'disabled' : w.consecutiveFailures > 0 ? 'failing' : 'active',
        lastTriggeredAt: related[0]?.createdAt ? new Date(related[0].createdAt).toLocaleString('pt-BR') : 'Nunca',
        successRate: completed ? Math.round((delivered / completed) * 1000) / 10 : 100,
      } as WebhookItem;
    });
  }

  async createWebhook(name: string, targetUrl: string, events: string[]): Promise<WebhookItem> {
    const res = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetUrl, events }),
    });
    if (!res.ok) { const body = await res.json().catch(()=>null); throw new Error(body?.error?.message || 'Falha ao criar webhook.'); }
    const w = await res.json();
    return { id:w.id,name:w.name,targetUrl:w.targetUrl,events:w.events||[],status:w.active?'active':'disabled',lastTriggeredAt:'Nunca',successRate:100,secret:w.secret };
  }

  async testWebhook(webhookId: string): Promise<{ success: boolean; statusCode: number; responseTimeMs: number; message: string }> {
    const res = await fetch(`/api/webhooks/${webhookId}/test`, { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao testar webhook.');
    const data = await res.json();
    return {
      success: data.success,
      statusCode: data.statusCode || 200,
      responseTimeMs: data.responseTimeMs || 0,
      message: data.message || `HTTP ${data.statusCode || 200}`,
    };
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    const res = await fetch(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao excluir webhook.');
  }


  async listWebhookDeliveries(webhookId?: string): Promise<WebhookDeliveryItem[]> {
    const query = new URLSearchParams({ limit: '100' });
    if (webhookId) query.set('webhookId', webhookId);
    const res = await fetch(`/api/webhooks/deliveries/history?${query.toString()}`);
    if (!res.ok) throw new Error('Falha ao listar entregas de webhook.');
    return (await res.json()).map((item:any) => ({ id:item.id, webhookId:item.webhookId, eventType:item.eventType, status:item.status, attemptCount:item.attemptCount, responseStatus:item.responseStatus, responseTimeMs:item.responseTimeMs, lastError:item.lastError, createdAt:item.createdAt }));
  }

  async replayWebhookDelivery(deliveryId: string): Promise<WebhookDeliveryItem> {
    const res = await fetch(`/api/webhooks/deliveries/${deliveryId}/replay`, { method:'POST' });
    if (!res.ok) throw new Error('Falha ao repetir entrega do webhook.');
    return await res.json();
  }

  async rotateWebhookSecret(webhookId: string): Promise<string> {
    const res = await fetch(`/api/webhooks/${webhookId}/rotate-secret`, { method:'POST' });
    if (!res.ok) throw new Error('Falha ao rotacionar segredo do webhook.');
    const data = await res.json();
    return String(data.secret || '');
  }

  async executeApiExplorerRequest(params: {
    method: string;
    endpoint: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<ApiExplorerResponse> {
    const startTime = performance.now();

    try {
      const { projectId, environmentId } = this.getScope();
      const reqHeaders: Record<string, string> = {
        'x-project-id': projectId,
        'x-environment-id': environmentId,
        'Content-Type': 'application/json',
        ...(params.headers || {}),
      };

      const options: RequestInit = {
        method: params.method,
        headers: reqHeaders,
      };

      if (['POST', 'PATCH', 'PUT'].includes(params.method.toUpperCase()) && params.body) {
        options.body = typeof params.body === 'string' ? params.body : JSON.stringify(params.body);
      }

      const res = await fetch(params.endpoint, options);
      const durationMs = Math.round(performance.now() - startTime);

      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });

      let responseData: any = null;
      try {
        responseData = await res.json();
      } catch {
        responseData = { status: res.statusText };
      }

      return {
        statusCode: res.status,
        statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
        durationMs,
        headers: respHeaders,
        data: responseData,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        statusCode: 500,
        statusText: 'Internal Error',
        durationMs,
        headers: {},
        data: { error: { code: 'CLIENT_FETCH_ERROR', message: err.message } },
      };
    }
  }
}

export const realApiService = new RealApiService();
