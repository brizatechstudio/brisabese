import crypto from 'node:crypto';
import { postgres } from '../db/postgres';
import { encryptSecret, decryptSecret } from '../auth/cryptoUtils';
import { controlRepository } from '../db/controlRepository';
import { logger } from '../logger';

export type MessagingContext = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type MessageInput = {
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  audience?: { userId?: string; userIds?: string[]; platform?: 'web' | 'android' | 'ios'; deviceIds?: string[] };
  scheduledAt?: string;
};

const MANAGE_ROLES = new Set(['owner', 'admin', 'developer', 'service']);
const PLATFORM = new Set(['web', 'android', 'ios']);
const MAX_AUDIENCE_DEVICES = 10_000;

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function serviceAccountFromEnv(): ServiceAccount | null {
  const source = process.env.FCM_SERVICE_ACCOUNT_JSON
    || (process.env.FCM_SERVICE_ACCOUNT_BASE64 ? Buffer.from(process.env.FCM_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8') : '');
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

function publicDevice(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    userId: row.user_id || undefined,
    provider: row.provider,
    platform: row.platform,
    locale: row.locale || undefined,
    timezone: row.timezone || undefined,
    metadata: row.metadata || {},
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicMessage(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    title: row.title || undefined,
    body: row.body,
    data: row.data || {},
    audience: row.audience || {},
    status: row.status,
    provider: row.provider || undefined,
    attemptedCount: Number(row.attempted_count || 0),
    deliveredCount: Number(row.delivered_count || 0),
    failedCount: Number(row.failed_count || 0),
    errorMessage: row.error_message || undefined,
    scheduledAt: row.scheduled_at || undefined,
    sentAt: row.sent_at || undefined,
    createdAt: row.created_at,
  };
}

export class MessagingEngine {
  private accessToken: { value: string; expiresAt: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  public configured(): boolean { return Boolean(serviceAccountFromEnv()); }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => { void this.processDue().catch((error) => logger.error('Messaging queue processing failed.', { reason: error instanceof Error ? error.message : String(error) })); }, 30_000);
    this.timer.unref?.();
  }

  public stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private assertManage(ctx: MessagingContext): void {
    if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Messaging management requires developer, admin, owner, or service role.');
  }

  private assertUser(ctx: MessagingContext): void {
    if (!ctx.userId || !['authenticated', 'admin', 'owner'].includes(ctx.role)) throw new Error('An authenticated end-user session is required for device registration.');
  }

  public async registerDevice(ctx: MessagingContext, input: { token: string; platform: string; locale?: string; timezone?: string; metadata?: Record<string, unknown> }): Promise<any> {
    this.assertUser(ctx);
    const token = String(input.token || '').trim();
    const platform = String(input.platform || '').toLowerCase();
    if (token.length < 20 || token.length > 8_192) throw new Error('Invalid push registration token.');
    if (!PLATFORM.has(platform)) throw new Error('Push platform must be web, android, or ios.');
    const now = new Date().toISOString();
    const row = (await postgres.query<any>(
      `INSERT INTO messaging_devices(id,organization_id,project_id,environment_id,user_id,provider,platform,token_hash,token_encrypted,locale,timezone,metadata,status,last_seen_at,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,'fcm',$6,$7,$8,$9,$10,$11,'active',$12,$12,$12)
       ON CONFLICT(project_id,environment_id,token_hash)
       DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,token_encrypted=EXCLUDED.token_encrypted,locale=EXCLUDED.locale,timezone=EXCLUDED.timezone,metadata=EXCLUDED.metadata,status='active',last_seen_at=EXCLUDED.last_seen_at,updated_at=EXCLUDED.updated_at
       RETURNING *`,
      [id('device'), ctx.organizationId, ctx.projectId, ctx.environmentId, ctx.userId, platform, sha256(token), encryptSecret(token), input.locale || null, input.timezone || null, JSON.stringify(input.metadata || {}), now],
    ))[0];
    return publicDevice(row);
  }

  public async removeDevice(ctx: MessagingContext, deviceId: string): Promise<boolean> {
    this.assertUser(ctx);
    const rows = await postgres.query<{ id: string }>(
      `DELETE FROM messaging_devices WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND environment_id=$4 AND user_id=$5 RETURNING id`,
      [deviceId, ctx.organizationId, ctx.projectId, ctx.environmentId, ctx.userId],
    );
    return rows.length > 0;
  }

  public async listDevices(ctx: MessagingContext): Promise<any[]> {
    this.assertManage(ctx);
    return (await postgres.query<any>(
      `SELECT * FROM messaging_devices WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY last_seen_at DESC LIMIT 1000`,
      [ctx.organizationId, ctx.projectId, ctx.environmentId],
    )).map(publicDevice);
  }

  public async listMessages(ctx: MessagingContext): Promise<any[]> {
    this.assertManage(ctx);
    return (await postgres.query<any>(
      `SELECT * FROM messaging_messages WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY created_at DESC LIMIT 500`,
      [ctx.organizationId, ctx.projectId, ctx.environmentId],
    )).map(publicMessage);
  }

  public async createMessage(ctx: MessagingContext, input: MessageInput): Promise<any> {
    this.assertManage(ctx);
    const body = String(input.body || '').trim();
    if (!body || body.length > 4_000) throw new Error('Push message body is required and must be at most 4000 characters.');
    const title = input.title ? String(input.title).trim().slice(0, 255) : null;
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new Error('Invalid messaging schedule timestamp.');
    const status = scheduledAt && scheduledAt.getTime() > Date.now() ? 'queued' : 'queued';
    const row = (await postgres.query<any>(
      `INSERT INTO messaging_messages(id,organization_id,project_id,environment_id,created_by,title,body,data,audience,status,provider,scheduled_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'fcm',$11) RETURNING *`,
      [id('msg'), ctx.organizationId, ctx.projectId, ctx.environmentId, ctx.userId || 'system', title, body, JSON.stringify(input.data || {}), JSON.stringify(input.audience || {}), status, scheduledAt?.toISOString() || null],
    ))[0];
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) return this.send(ctx, row.id);
    return publicMessage(row);
  }

  public async cancel(ctx: MessagingContext, messageId: string): Promise<boolean> {
    this.assertManage(ctx);
    const rows = await postgres.query<{ id: string }>(
      `UPDATE messaging_messages SET status='cancelled',updated_at=now() WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND environment_id=$4 AND status='queued' RETURNING id`,
      [messageId, ctx.organizationId, ctx.projectId, ctx.environmentId],
    );
    return rows.length > 0;
  }

  public async send(ctx: MessagingContext, messageId: string): Promise<any> {
    this.assertManage(ctx);
    const row = (await postgres.query<any>(
      `SELECT * FROM messaging_messages WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND environment_id=$4`,
      [messageId, ctx.organizationId, ctx.projectId, ctx.environmentId],
    ))[0];
    if (!row) throw new Error('Push message not found.');
    if (row.status === 'cancelled') throw new Error('Cancelled push message cannot be sent.');
    if (!this.configured()) throw new Error('FCM is not configured. Set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_BASE64.');

    await postgres.execute(`UPDATE messaging_messages SET status='sending',updated_at=now(),error_message=NULL WHERE id=$1`, [messageId]);
    const audience = row.audience || {};
    const values: unknown[] = [ctx.organizationId, ctx.projectId, ctx.environmentId];
    let where = `organization_id=$1 AND project_id=$2 AND environment_id=$3 AND status='active'`;
    if (audience.userId) { values.push(String(audience.userId)); where += ` AND user_id=$${values.length}`; }
    if (Array.isArray(audience.userIds) && audience.userIds.length) { values.push(audience.userIds.slice(0, 500)); where += ` AND user_id=ANY($${values.length}::varchar[])`; }
    if (audience.platform && PLATFORM.has(String(audience.platform))) { values.push(String(audience.platform)); where += ` AND platform=$${values.length}`; }
    if (Array.isArray(audience.deviceIds) && audience.deviceIds.length) { values.push(audience.deviceIds.slice(0, MAX_AUDIENCE_DEVICES)); where += ` AND id=ANY($${values.length}::varchar[])`; }
    const devices = await postgres.query<any>(`SELECT * FROM messaging_devices WHERE ${where} ORDER BY last_seen_at DESC LIMIT ${MAX_AUDIENCE_DEVICES}`, values);

    let delivered = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const device of devices) {
      try {
        await this.sendFcm(decryptSecret(device.token_encrypted), {
          title: row.title || undefined,
          body: row.body,
          data: row.data || {},
        });
        delivered += 1;
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(reason.slice(0, 300));
        if (/UNREGISTERED|registration token is not registered|not a valid FCM registration token/i.test(reason)) {
          await postgres.execute(`UPDATE messaging_devices SET status='invalid',updated_at=now() WHERE id=$1`, [device.id]);
        }
      }
    }
    const attempted = devices.length;
    const status = attempted === 0 || delivered === 0 ? 'failed' : failed ? 'partial' : 'sent';
    const updated = (await postgres.query<any>(
      `UPDATE messaging_messages SET status=$2,attempted_count=$3,delivered_count=$4,failed_count=$5,error_message=$6,sent_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,
      [messageId, status, attempted, delivered, failed, errors[0] || (attempted === 0 ? 'No active push devices matched the audience.' : null)],
    ))[0];
    await controlRepository.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'system',
      action: 'messaging.sent',
      resource_type: 'push_message',
      resource_id: messageId,
      metadata: { attempted, delivered, failed, status },
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    });
    return publicMessage(updated);
  }

  private async processDue(): Promise<void> {
    if (!this.running || !this.configured()) return;
    const rows = await postgres.query<any>(
      `SELECT * FROM messaging_messages WHERE status='queued' AND (scheduled_at IS NULL OR scheduled_at <= now()) ORDER BY created_at LIMIT 20`,
    );
    for (const row of rows) {
      const ctx: MessagingContext = {
        organizationId: row.organization_id,
        projectId: row.project_id,
        environmentId: row.environment_id,
        userId: row.created_by || 'system',
        role: 'service',
      };
      try { await this.send(ctx, row.id); }
      catch (error) {
        await postgres.execute(`UPDATE messaging_messages SET status='failed',error_message=$2,updated_at=now() WHERE id=$1`, [row.id, (error instanceof Error ? error.message : String(error)).slice(0, 1000)]);
      }
    }
  }

  private async oauthAccessToken(account: ServiceAccount): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
    const input = `${header}.${claims}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(input);
    signer.end();
    const assertion = `${input}.${signer.sign(account.private_key).toString('base64url')}`;
    const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json() as any;
    if (!response.ok || !payload?.access_token) throw new Error(`FCM OAuth failed (${response.status}).`);
    this.accessToken = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000 };
    return this.accessToken.value;
  }

  private async sendFcm(token: string, message: { title?: string; body: string; data: Record<string, unknown> }): Promise<void> {
    const account = serviceAccountFromEnv();
    if (!account) throw new Error('FCM is not configured.');
    const accessToken = await this.oauthAccessToken(account);
    const data = Object.fromEntries(Object.entries(message.data || {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, notification: { title: message.title, body: message.body }, data } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`FCM send failed (${response.status}): ${text.slice(0, 500)}`);
    }
  }
}

export const messagingEngine = new MessagingEngine();
