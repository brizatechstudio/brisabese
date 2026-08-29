import crypto from 'node:crypto';
import { config } from '../config';

export type PitrStatus = {
  provider: 'neon';
  configured: boolean;
  projectId?: string;
  branchId?: string;
  endpointId?: string;
  historyRetentionSeconds?: number;
  earliestRestorableAt?: string;
  latestRestorableAt?: string;
};

export type PitrRestoreResult = {
  provider: 'neon';
  restoredAt: string;
  branchId: string;
  preservedUnderName: string;
  restartRequired: true;
};

type NeonProjectResponse = { project?: { id?: string; history_retention_seconds?: number } };
type NeonEndpointsResponse = { endpoints?: Array<{ id?: string; branch_id?: string }> };

const API_BASE = 'https://console.neon.tech/api/v2';

function projectId(): string {
  return String(process.env.NEON_PROJECT_ID || '').trim();
}

function apiKey(): string {
  return String(process.env.NEON_API_KEY || '').trim();
}

function enabled(): boolean {
  return process.env.PITR_ENABLED === 'true' && (process.env.PITR_PROVIDER || 'neon') === 'neon';
}

function endpointIdFromDatabaseUrl(): string {
  const databaseUrl = config.databaseUrl;
  if (!databaseUrl) throw new Error('DATABASE_URL is unavailable.');
  const host = new URL(databaseUrl).hostname;
  const firstLabel = host.split('.')[0] || '';
  const endpointId = firstLabel.replace(/-pooler$/, '');
  if (!/^ep-[a-z0-9-]+$/.test(endpointId)) throw new Error('DATABASE_URL does not point to a recognizable Neon endpoint.');
  return endpointId;
}

function safePreserveName(timestamp: Date): string {
  const stamp = timestamp.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `bb-before-pitr-${stamp}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 63);
}

export class NeonPitrProvider {
  public configured(): boolean {
    return enabled() && Boolean(projectId()) && Buffer.byteLength(apiKey(), 'utf8') >= 20;
  }

  private async api<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    if (!this.configured()) throw Object.assign(new Error('Neon PITR is not configured.'), { code: 'PITR_NOT_CONFIGURED' });
    const response = await fetch(`${API_BASE}${pathname}`, {
      ...init,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey()}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const providerMessage = payload?.message || payload?.error || `Neon API returned HTTP ${response.status}.`;
      throw Object.assign(new Error(String(providerMessage).slice(0, 500)), { code: 'PITR_PROVIDER_ERROR', status: response.status });
    }
    return payload as T;
  }

  private async currentBranch(): Promise<{ endpointId: string; branchId: string }> {
    const endpointId = endpointIdFromDatabaseUrl();
    const payload = await this.api<NeonEndpointsResponse>(`/projects/${encodeURIComponent(projectId())}/endpoints`);
    const endpoint = (payload.endpoints || []).find((item) => item.id === endpointId);
    if (!endpoint?.branch_id) throw new Error(`The Neon endpoint '${endpointId}' is not attached to a branch in the configured project.`);
    return { endpointId, branchId: endpoint.branch_id };
  }

  public async status(): Promise<PitrStatus> {
    if (!this.configured()) return { provider: 'neon', configured: false };
    const [{ endpointId, branchId }, projectResponse] = await Promise.all([
      this.currentBranch(),
      this.api<NeonProjectResponse>(`/projects/${encodeURIComponent(projectId())}`),
    ]);
    const historyRetentionSeconds = Number(projectResponse.project?.history_retention_seconds || 0);
    const now = Date.now();
    return {
      provider: 'neon',
      configured: true,
      projectId: projectId(),
      branchId,
      endpointId,
      historyRetentionSeconds,
      earliestRestorableAt: historyRetentionSeconds > 0 ? new Date(now - historyRetentionSeconds * 1000).toISOString() : undefined,
      latestRestorableAt: new Date(now).toISOString(),
    };
  }

  public async restore(target: string): Promise<PitrRestoreResult> {
    if (!this.configured()) throw Object.assign(new Error('Neon PITR is not configured.'), { code: 'PITR_NOT_CONFIGURED' });
    const timestamp = new Date(target);
    if (Number.isNaN(timestamp.getTime())) throw Object.assign(new Error('PITR target must be a valid ISO-8601 timestamp.'), { code: 'PITR_INVALID_TARGET' });
    if (timestamp.getTime() > Date.now() - 2_000) throw Object.assign(new Error('PITR target must be in the past.'), { code: 'PITR_INVALID_TARGET' });

    const status = await this.status();
    if (!status.branchId || !status.historyRetentionSeconds) throw Object.assign(new Error('Neon history retention is unavailable.'), { code: 'PITR_HISTORY_UNAVAILABLE' });
    const earliest = Date.now() - status.historyRetentionSeconds * 1000;
    if (timestamp.getTime() < earliest) {
      throw Object.assign(new Error(`PITR target is outside the configured Neon history window (${status.historyRetentionSeconds}s).`), { code: 'PITR_TARGET_OUTSIDE_WINDOW' });
    }

    const preservedUnderName = safePreserveName(timestamp);
    await this.api(
      `/projects/${encodeURIComponent(projectId())}/branches/${encodeURIComponent(status.branchId)}/restore`,
      {
        method: 'POST',
        body: JSON.stringify({
          source_branch_id: status.branchId,
          source_timestamp: timestamp.toISOString(),
          preserve_under_name: preservedUnderName,
        }),
      },
    );

    return {
      provider: 'neon',
      restoredAt: timestamp.toISOString(),
      branchId: status.branchId,
      preservedUnderName,
      restartRequired: true,
    };
  }
}

export const neonPitrProvider = new NeonPitrProvider();
