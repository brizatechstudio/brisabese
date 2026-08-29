import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { postgres } from '../db/postgres';
import { config } from '../config';
import { decryptSecret, encryptSecret } from '../auth/cryptoUtils';
import { logger } from '../logger';
import { WebhookContext, WebhookDefinition, WebhookDelivery } from './types';

const id = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
const MAX_FAILURES_BEFORE_DISABLE = 20;
const MAX_RESPONSE_BODY = 4096;

const RESERVED_WEBHOOK_HEADERS = new Set([
  'authorization', 'connection', 'content-length', 'content-type', 'cookie', 'host',
  'transfer-encoding', 'user-agent', 'x-brisabase-delivery', 'x-brisabase-event',
  'x-brisabase-signature', 'x-brisabase-timestamp',
]);

function validateCustomHeaders(input?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    const key = String(rawKey).trim().toLowerCase();
    const value = String(rawValue);
    if (!/^[a-z0-9-]{1,80}$/.test(key) || RESERVED_WEBHOOK_HEADERS.has(key) || key.startsWith('x-brisabase-') || value.length > 1000 || /[\r\n]/.test(value)) {
      throw new Error('One or more custom webhook headers are invalid or reserved.');
    }
    headers[key] = value;
  }
  if (Object.keys(headers).length > 50) throw new Error('A webhook may define at most 50 custom headers.');
  return headers;
}

function definition(row: any, revealSecret = false): WebhookDefinition {
  return {
    id: row.id, organizationId: row.organization_id, projectId: row.project_id, environmentId: row.environment_id,
    name: row.name, targetUrl: row.target_url, events: Array.isArray(row.events) ? row.events : [],
    customHeaders: row.custom_headers || {}, active: Boolean(row.active), maxAttempts: Number(row.max_attempts || 5),
    timeoutMs: Number(row.timeout_ms || 10000), consecutiveFailures: Number(row.consecutive_failures || 0),
    disabledReason: row.disabled_reason || undefined, createdAt: row.created_at, updatedAt: row.updated_at,
    ...(revealSecret ? { secret: decryptSecret(row.secret_encrypted) } : {}),
  };
}

function delivery(row: any): WebhookDelivery {
  return {
    id: row.id, webhookId: row.webhook_id, eventId: row.event_id, eventType: row.event_type, status: row.status,
    attemptCount: Number(row.attempt_count || 0), responseStatus: row.response_status ?? undefined,
    responseBody: row.response_body || undefined, responseTimeMs: row.response_time_ms ?? undefined,
    lastError: row.last_error || undefined, nextAttemptAt: row.next_attempt_at, createdAt: row.created_at,
    deliveredAt: row.delivered_at || undefined,
  };
}

function eventMatches(patterns: string[], eventType: string): boolean {
  return patterns.some((pattern) => pattern === '*' || pattern === eventType || (pattern.endsWith('.*') && eventType.startsWith(pattern.slice(0, -1))));
}

function normalizeEvents(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('Webhook events must be an array.');
  const events=[...new Set(input.map((value)=>String(value).trim()).filter(Boolean))];
  const valid=/^(?:\*|[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*(?:\.\*)?)$/;
  if(!events.length||events.length>50||events.some((event)=>event.length>160||!valid.test(event))) throw new Error('Webhook event patterns are invalid.');
  return events;
}

function privateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const p = address.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || p[0] >= 224;
  }
  if (net.isIPv6(address)) {
    const v = address.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  return true;
}

async function validateTarget(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Webhook target URL is invalid.'); }
  const allowHttp = config.testMode && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) throw new Error('Webhook target must use HTTPS.');
  if (url.username || url.password) throw new Error('Webhook target URL cannot contain credentials.');
  if (url.port && !['443', '8443'].includes(url.port) && !allowHttp) throw new Error('Webhook target uses a restricted port.');
  if (!allowHttp) {
    const results = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (!results.length || results.some((item) => privateAddress(item.address))) throw new Error('Webhook target resolves to a private or reserved network.');
  }
  return url;
}

export class WebhookEngine {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.processQueue(), 1000);
    this.timer.unref?.();
  }

  public stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  public async list(ctx: WebhookContext): Promise<WebhookDefinition[]> {
    return (await postgres.query<any>('SELECT * FROM webhooks WHERE project_id=$1 AND environment_id=$2 ORDER BY created_at DESC', [ctx.projectId, ctx.environmentId])).map((row) => definition(row));
  }

  public async get(ctx: WebhookContext, webhookId: string, revealSecret = false): Promise<WebhookDefinition | null> {
    const row = (await postgres.query<any>('SELECT * FROM webhooks WHERE id=$1 AND project_id=$2 AND environment_id=$3', [webhookId, ctx.projectId, ctx.environmentId]))[0];
    return row ? definition(row, revealSecret) : null;
  }

  public async create(ctx: WebhookContext, input: { name: string; targetUrl: string; events: string[]; customHeaders?: Record<string,string>; maxAttempts?: number; timeoutMs?: number }): Promise<WebhookDefinition> {
    const name = String(input.name || '').trim(); if (!name || name.length > 120) throw new Error('Webhook name is required and must be at most 120 characters.');
    await validateTarget(input.targetUrl);
    const events = normalizeEvents(input.events);
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const headers = validateCustomHeaders(input.customHeaders);
    const row = (await postgres.query<any>('INSERT INTO webhooks(id,organization_id,project_id,environment_id,name,target_url,events,secret_encrypted,custom_headers,max_attempts,timeout_ms,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', [id('wh'),ctx.organizationId,ctx.projectId,ctx.environmentId,name,input.targetUrl,JSON.stringify(events),encryptSecret(secret),JSON.stringify(headers),Math.min(Math.max(Number(input.maxAttempts)||5,1),10),Math.min(Math.max(Number(input.timeoutMs)||10000,1000),30000),ctx.userId || null]))[0];
    return { ...definition(row), secret };
  }

  public async update(ctx: WebhookContext, webhookId: string, input: Partial<{ name: string; targetUrl: string; events: string[]; customHeaders: Record<string,string>; active: boolean; maxAttempts: number; timeoutMs: number }>): Promise<WebhookDefinition | null> {
    const current = await this.get(ctx, webhookId); if (!current) return null;
    const targetUrl = input.targetUrl ?? current.targetUrl; await validateTarget(targetUrl);
    const name = input.name === undefined ? current.name : String(input.name).trim(); if(!name||name.length>120) throw new Error('Webhook name is required and must be at most 120 characters.');
    const events = input.events ? normalizeEvents(input.events) : current.events;
    const headers = validateCustomHeaders(input.customHeaders ?? current.customHeaders);
    const row = (await postgres.query<any>('UPDATE webhooks SET name=$2,target_url=$3,events=$4,custom_headers=$5,active=$6,max_attempts=$7,timeout_ms=$8,disabled_reason=CASE WHEN $6 THEN NULL ELSE disabled_reason END,consecutive_failures=CASE WHEN $6 THEN 0 ELSE consecutive_failures END,updated_at=now() WHERE id=$1 AND project_id=$9 AND environment_id=$10 RETURNING *', [webhookId,name,targetUrl,JSON.stringify(events),JSON.stringify(headers),input.active ?? current.active,Math.min(Math.max(Number(input.maxAttempts ?? current.maxAttempts),1),10),Math.min(Math.max(Number(input.timeoutMs ?? current.timeoutMs),1000),30000),ctx.projectId,ctx.environmentId]))[0];
    return row ? definition(row) : null;
  }

  public async remove(ctx: WebhookContext, webhookId: string): Promise<boolean> {
    return (await postgres.query('DELETE FROM webhooks WHERE id=$1 AND project_id=$2 AND environment_id=$3 RETURNING id', [webhookId,ctx.projectId,ctx.environmentId])).length > 0;
  }

  public async rotateSecret(ctx: WebhookContext, webhookId: string): Promise<string> {
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const rows = await postgres.query('UPDATE webhooks SET secret_encrypted=$1,updated_at=now() WHERE id=$2 AND project_id=$3 AND environment_id=$4 RETURNING id', [encryptSecret(secret),webhookId,ctx.projectId,ctx.environmentId]);
    if (!rows.length) throw new Error('Webhook not found.'); return secret;
  }

  public async listDeliveries(ctx: WebhookContext, webhookId?: string, limit = 100): Promise<WebhookDelivery[]> {
    const params: any[] = [ctx.projectId,ctx.environmentId,Math.min(Math.max(limit,1),500)];
    const clause = webhookId ? ' AND webhook_id=$4' : ''; if (webhookId) params.push(webhookId);
    return (await postgres.query<any>(`SELECT * FROM webhook_deliveries WHERE project_id=$1 AND environment_id=$2${clause} ORDER BY created_at DESC LIMIT $3`, params)).map(delivery);
  }

  public async emit(ctx: WebhookContext, eventType: string, payload: Record<string, unknown>, eventId = `evt_${randomUUID()}`): Promise<number> {
    const hooks = await postgres.query<any>('SELECT * FROM webhooks WHERE project_id=$1 AND environment_id=$2 AND active=TRUE', [ctx.projectId,ctx.environmentId]);
    let queued = 0;
    for (const hook of hooks) {
      const events = Array.isArray(hook.events) ? hook.events : [];
      if (!eventMatches(events, eventType)) continue;
      const inserted=await postgres.query<{id:string}>(`INSERT INTO webhook_deliveries(id,webhook_id,organization_id,project_id,environment_id,event_id,event_type,payload,status,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',now()) ON CONFLICT(webhook_id,event_id) DO NOTHING RETURNING id`, [id('whd'),hook.id,ctx.organizationId,ctx.projectId,ctx.environmentId,eventId,eventType,JSON.stringify(payload)]);
      if(inserted.length) queued += 1;
    }
    if (queued) queueMicrotask(() => void this.processQueue());
    return queued;
  }

  public async test(ctx: WebhookContext, webhookId: string): Promise<WebhookDelivery> {
    const hook = await this.get(ctx, webhookId); if (!hook) throw new Error('Webhook not found.');
    const eventId = `test_${randomUUID()}`;
    await postgres.execute('INSERT INTO webhook_deliveries(id,webhook_id,organization_id,project_id,environment_id,event_id,event_type,payload,status,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'pending\',now())', [id('whd'),hook.id,ctx.organizationId,ctx.projectId,ctx.environmentId,eventId,'webhook.test',JSON.stringify({ test: true, timestamp: new Date().toISOString() })]);
    const queued = (await postgres.query<any>(`SELECT d.*,w.target_url,w.secret_encrypted,w.custom_headers,w.max_attempts,w.timeout_ms,w.active FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.webhook_id=$1 AND d.event_id=$2 ORDER BY d.created_at DESC LIMIT 1`, [hook.id,eventId]))[0];
    await this.deliver(queued);
    const result = (await postgres.query<any>('SELECT * FROM webhook_deliveries WHERE webhook_id=$1 AND event_id=$2 ORDER BY created_at DESC LIMIT 1', [hook.id,eventId]))[0];
    return delivery(result);
  }

  public async replay(ctx: WebhookContext, deliveryId: string): Promise<WebhookDelivery> {
    const source = (await postgres.query<any>('SELECT d.* FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.id=$1 AND d.project_id=$2 AND d.environment_id=$3', [deliveryId,ctx.projectId,ctx.environmentId]))[0];
    if (!source) throw new Error('Webhook delivery not found.');
    const newId = id('whd');
    await postgres.execute('INSERT INTO webhook_deliveries(id,webhook_id,organization_id,project_id,environment_id,event_id,event_type,payload,status,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,\'pending\',now())', [newId,source.webhook_id,source.organization_id,source.project_id,source.environment_id,`${source.event_id}:replay:${Date.now()}`,source.event_type,JSON.stringify(source.payload)]);
    await this.processQueue();
    return delivery((await postgres.query<any>('SELECT * FROM webhook_deliveries WHERE id=$1',[newId]))[0]);
  }

  public async processQueue(): Promise<void> {
    if (this.processing) return; this.processing = true;
    try {
      await postgres.execute(`UPDATE webhook_deliveries SET status='failed', next_attempt_at=now(), last_error=COALESCE(last_error,'Recovered after an interrupted worker execution.'), updated_at=now() WHERE status='processing' AND updated_at < now() - interval '2 minutes'`);
      const rows = await postgres.transaction(async (client) => {
        const selected = await client.query<any>(`SELECT d.*, w.target_url,w.secret_encrypted,w.custom_headers,w.max_attempts,w.timeout_ms,w.active
          FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id
          WHERE d.status IN ('pending','failed') AND d.next_attempt_at<=now() AND w.active=TRUE
          ORDER BY d.next_attempt_at ASC
          FOR UPDATE OF d SKIP LOCKED LIMIT 25`);
        for (const row of selected.rows) {
          row.attempt_count = Number(row.attempt_count || 0) + 1;
          await client.query(`UPDATE webhook_deliveries SET status='processing',attempt_count=$2,updated_at=now() WHERE id=$1`, [row.id, row.attempt_count]);
        }
        return selected.rows;
      });
      for (const row of rows) await this.deliver(row, true);
    } catch (error) { logger.error('Webhook queue processing failed:', error); }
    finally { this.processing = false; }
  }

  private async deliver(row: any, alreadyClaimed = false): Promise<void> {
    const attempt = alreadyClaimed ? Number(row.attempt_count || 1) : Number(row.attempt_count || 0) + 1;
    if (!alreadyClaimed) await postgres.execute('UPDATE webhook_deliveries SET status=\'processing\',attempt_count=$2,updated_at=now() WHERE id=$1', [row.id,attempt]);
    const body = JSON.stringify({ id: row.event_id, type: row.event_type, created_at: row.created_at, data: row.payload });
    const timestamp = Math.floor(Date.now()/1000).toString();
    const signature = createHmac('sha256', decryptSecret(row.secret_encrypted)).update(`${timestamp}.${body}`).digest('hex');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Number(row.timeout_ms || 10000));
    const started = performance.now();
    try {
      await validateTarget(row.target_url);
      const response = await fetch(row.target_url, { method:'POST', redirect:'error', signal:controller.signal, headers:{ 'content-type':'application/json', 'user-agent':'BrisaBase-Webhooks/0.6', 'x-brisabase-event':row.event_type, 'x-brisabase-delivery':row.id, 'x-brisabase-timestamp':timestamp, 'x-brisabase-signature':`v1=${signature}`, ...(row.custom_headers || {}) }, body });
      const responseBody = (await response.text().catch(()=>'')).slice(0,MAX_RESPONSE_BODY); const elapsed = Math.round(performance.now()-started);
      if (!response.ok) throw Object.assign(new Error(`Webhook returned HTTP ${response.status}.`), { responseStatus: response.status, responseBody, elapsed });
      await postgres.execute('UPDATE webhook_deliveries SET status=\'delivered\',response_status=$2,response_body=$3,response_time_ms=$4,last_error=NULL,delivered_at=now(),updated_at=now() WHERE id=$1', [row.id,response.status,responseBody,elapsed]);
      await postgres.execute('UPDATE webhooks SET consecutive_failures=0,disabled_reason=NULL,updated_at=now() WHERE id=$1',[row.webhook_id]);
    } catch (error: any) {
      const elapsed = Number(error?.elapsed || Math.round(performance.now()-started)); const terminal = attempt >= Number(row.max_attempts || 5);
      const message = error?.name === 'AbortError' ? 'Webhook delivery timed out.' : String(error?.message || 'Webhook delivery failed.');
      const backoffSeconds = Math.min(3600, Math.pow(2, Math.max(0, attempt-1)) * 5);
      await postgres.execute(`UPDATE webhook_deliveries SET status=$2,response_status=$3,response_body=$4,response_time_ms=$5,last_error=$6,next_attempt_at=now()+($7||' seconds')::interval,updated_at=now() WHERE id=$1`, [row.id,terminal?'dead_letter':'failed',error?.responseStatus||null,error?.responseBody||null,elapsed,message,String(backoffSeconds)]);
      const updated = (await postgres.query<any>('UPDATE webhooks SET consecutive_failures=consecutive_failures+1,updated_at=now() WHERE id=$1 RETURNING consecutive_failures',[row.webhook_id]))[0];
      if (Number(updated?.consecutive_failures || 0) >= MAX_FAILURES_BEFORE_DISABLE) await postgres.execute('UPDATE webhooks SET active=FALSE,disabled_reason=\'Automatically disabled after repeated delivery failures\',updated_at=now() WHERE id=$1',[row.webhook_id]);
    } finally { clearTimeout(timer); }
  }
}

export const webhookEngine = new WebhookEngine();
