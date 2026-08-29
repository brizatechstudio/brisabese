import crypto from 'node:crypto';
import { postgres } from '../db/postgres';
import { controlRepository } from '../db/controlRepository';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';

export type PreviewContext = {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId: string;
  role: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export type PreviewEnvironment = {
  id: string;
  organizationId: string;
  projectId: string;
  sourceEnvironmentId: string;
  previewEnvironmentId: string;
  branchName: string;
  includeData: boolean;
  status: 'creating' | 'ready' | 'failed' | 'deleting' | 'deleted' | 'expired';
  expiresAt?: string;
  createdBy?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MANAGE_ROLES = new Set(['owner', 'admin', 'developer', 'service']);

function quote(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error('Invalid PostgreSQL identifier.');
  return `"${name}"`;
}

function slug(value: string): string {
  const output = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  if (!output) throw new Error('A valid branch name is required.');
  return output;
}

function previewId(): string {
  return `prev_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function environmentId(projectId: string): string {
  return `env_${projectId}_preview_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function map(row: any): PreviewEnvironment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    sourceEnvironmentId: row.source_environment_id,
    previewEnvironmentId: row.preview_environment_id,
    branchName: row.branch_name,
    includeData: Boolean(row.include_data),
    status: row.status,
    expiresAt: row.expires_at || undefined,
    createdBy: row.created_by || undefined,
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PreviewDatabaseEngine {
  private assertManage(ctx: PreviewContext): void {
    if (!MANAGE_ROLES.has(ctx.role)) throw new Error('Preview Database management requires developer, admin, owner, or service role.');
  }

  private securityContext(ctx: PreviewContext, environment: string): SecurityContext {
    return {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: environment,
      userId: ctx.userId,
      role: ctx.role,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    } as SecurityContext;
  }

  private async assertScope(ctx: PreviewContext, sourceEnvironmentId = ctx.environmentId): Promise<void> {
    const [project, environment] = await Promise.all([
      controlRepository.getProject(ctx.projectId),
      controlRepository.getEnvironment(sourceEnvironmentId),
    ]);
    if (!project || project.organization_id !== ctx.organizationId) throw new Error('Preview project scope is invalid.');
    if (!environment || environment.project_id !== ctx.projectId) throw new Error('Preview source environment is invalid.');
  }

  public async list(ctx: PreviewContext): Promise<PreviewEnvironment[]> {
    this.assertManage(ctx);
    await this.assertScope(ctx);
    await this.expireDue(ctx);
    const rows = await postgres.query<any>(
      `SELECT * FROM preview_environments
       WHERE organization_id=$1 AND project_id=$2
       ORDER BY created_at DESC`,
      [ctx.organizationId, ctx.projectId],
    );
    return rows.map(map);
  }

  public async get(ctx: PreviewContext, id: string): Promise<PreviewEnvironment | null> {
    this.assertManage(ctx);
    await this.assertScope(ctx);
    const row = (await postgres.query<any>(
      'SELECT * FROM preview_environments WHERE id=$1 AND organization_id=$2 AND project_id=$3',
      [id, ctx.organizationId, ctx.projectId],
    ))[0];
    return row ? map(row) : null;
  }

  public async create(ctx: PreviewContext, input: { branchName: string; sourceEnvironmentId?: string; includeData?: boolean; ttlHours?: number }): Promise<PreviewEnvironment> {
    this.assertManage(ctx);
    const sourceEnvironmentId = input.sourceEnvironmentId || ctx.environmentId;
    await this.assertScope(ctx, sourceEnvironmentId);

    const branchName = slug(input.branchName);
    const existing = (await postgres.query<any>(
      `SELECT id FROM preview_environments
       WHERE project_id=$1 AND lower(branch_name)=lower($2) AND status IN ('creating','ready') LIMIT 1`,
      [ctx.projectId, branchName],
    ))[0];
    if (existing) throw new Error(`A preview for branch '${branchName}' already exists.`);

    const source = await controlRepository.getEnvironment(sourceEnvironmentId);
    if (!source) throw new Error('Preview source environment was not found.');

    const previewEnvironmentId = environmentId(ctx.projectId);
    const id = previewId();
    const ttlHours = input.ttlHours === undefined ? 72 : Math.min(Math.max(Number(input.ttlHours) || 0, 1), 24 * 30);
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
    const now = new Date().toISOString();

    await postgres.transaction(async (client) => {
      await client.query(
        `INSERT INTO project_environments(id,project_id,name,slug,type,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,'development','active',$5,$5)`,
        [previewEnvironmentId, ctx.projectId, `Preview: ${branchName}`, `preview-${branchName}-${id.slice(-6)}`, now],
      );
      await client.query(
        `INSERT INTO preview_environments(id,organization_id,project_id,source_environment_id,preview_environment_id,branch_name,include_data,status,expires_at,created_by,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'creating',$8,$9,$10,$10)`,
        [id, ctx.organizationId, ctx.projectId, sourceEnvironmentId, previewEnvironmentId, branchName, Boolean(input.includeData), expiresAt, ctx.userId, now],
      );
    });

    try {
      await this.cloneDatabase(ctx, sourceEnvironmentId, previewEnvironmentId, Boolean(input.includeData));
      await this.cloneSecurityPolicies(ctx, sourceEnvironmentId, previewEnvironmentId);
      await this.cloneEnvironmentSettings(ctx.projectId, sourceEnvironmentId, previewEnvironmentId);
      await postgres.execute(
        `UPDATE preview_environments SET status='ready',updated_at=now(),error_message=NULL WHERE id=$1`,
        [id],
      );
      await controlRepository.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: previewEnvironmentId,
        user_id: ctx.userId,
        action: 'preview.created',
        resource_type: 'preview_database',
        resource_id: id,
        metadata: { branchName, sourceEnvironmentId, includeData: Boolean(input.includeData), expiresAt },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await postgres.execute(
        `UPDATE preview_environments SET status='failed',error_message=$2,updated_at=now() WHERE id=$1`,
        [id, message.slice(0, 2_000)],
      );
      throw error;
    }

    return (await this.get(ctx, id))!;
  }

  private async cloneDatabase(ctx: PreviewContext, sourceEnvironmentId: string, targetEnvironmentId: string, includeData: boolean): Promise<void> {
    const sourceScope = { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: sourceEnvironmentId };
    const targetScope = { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: targetEnvironmentId };
    const [sourceSchema, targetSchema, tables] = await Promise.all([
      realProjectDatabase.getSchemaName(sourceScope),
      realProjectDatabase.getSchemaName(targetScope),
      realProjectDatabase.listTables(sourceScope),
    ]);

    for (const table of tables) {
      if (!IDENTIFIER.test(table.name)) throw new Error(`Cannot clone invalid table name '${table.name}'.`);
      await postgres.execute(
        `CREATE TABLE ${quote(targetSchema)}.${quote(table.name)} (LIKE ${quote(sourceSchema)}.${quote(table.name)} INCLUDING ALL)`,
      );
      if (includeData) {
        await postgres.execute(
          `INSERT INTO ${quote(targetSchema)}.${quote(table.name)} SELECT * FROM ${quote(sourceSchema)}.${quote(table.name)}`,
        );
      }
    }
  }

  private async cloneSecurityPolicies(ctx: PreviewContext, sourceEnvironmentId: string, targetEnvironmentId: string): Promise<void> {
    const sourceContext = this.securityContext(ctx, sourceEnvironmentId);
    const targetContext = this.securityContext(ctx, targetEnvironmentId);
    for (const source of securityEngine.listPolicies(sourceContext)) {
      const policy = securityEngine.createPolicy(targetContext, {
        name: `${source.name} [preview]`,
        resourceType: source.resourceType,
        resource: source.resource,
        operation: source.operation,
        condition: source.condition,
        enabled: source.enabled,
      });
      await securityEngine.persist(policy);
    }
  }

  private async cloneEnvironmentSettings(projectId: string, sourceEnvironmentId: string, targetEnvironmentId: string): Promise<void> {
    const settings = await postgres.query<any>(
      'SELECT key,value FROM project_settings WHERE project_id=$1 AND environment_id=$2',
      [projectId, sourceEnvironmentId],
    );
    for (const setting of settings) {
      await controlRepository.setSetting(projectId, setting.key, setting.value, targetEnvironmentId);
    }
  }

  public async remove(ctx: PreviewContext, id: string, reason: 'manual' | 'expired' = 'manual'): Promise<boolean> {
    this.assertManage(ctx);
    const preview = await this.get(ctx, id);
    if (!preview) return false;
    if (preview.status === 'deleted' || preview.status === 'expired') return true;

    await postgres.execute(`UPDATE preview_environments SET status='deleting',updated_at=now() WHERE id=$1`, [id]);
    const schema = await realProjectDatabase.getSchemaName({ organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: preview.previewEnvironmentId });
    await postgres.execute(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await postgres.transaction(async (client) => {
      await client.query('DELETE FROM project_database_registry WHERE project_id=$1 AND environment_id=$2', [ctx.projectId, preview.previewEnvironmentId]);
      await client.query('DELETE FROM security_policies WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3', [ctx.organizationId, ctx.projectId, preview.previewEnvironmentId]);
      await client.query(`UPDATE project_environments SET status='disabled',updated_at=now() WHERE id=$1 AND project_id=$2`, [preview.previewEnvironmentId, ctx.projectId]);
      await client.query(`UPDATE preview_environments SET status=$2,updated_at=now() WHERE id=$1`, [id, reason === 'expired' ? 'expired' : 'deleted']);
    });
    await securityEngine.hydrate();
    await controlRepository.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: preview.previewEnvironmentId,
      user_id: ctx.userId,
      action: reason === 'expired' ? 'preview.expired' : 'preview.deleted',
      resource_type: 'preview_database',
      resource_id: id,
      metadata: { branchName: preview.branchName },
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    });
    return true;
  }

  public async expireDue(ctx: PreviewContext): Promise<number> {
    this.assertManage(ctx);
    const rows = await postgres.query<{ id: string }>(
      `SELECT id FROM preview_environments
       WHERE organization_id=$1 AND project_id=$2 AND status='ready' AND expires_at IS NOT NULL AND expires_at <= now()
       ORDER BY expires_at LIMIT 20`,
      [ctx.organizationId, ctx.projectId],
    );
    let expired = 0;
    for (const row of rows) {
      try { if (await this.remove(ctx, row.id, 'expired')) expired += 1; } catch { /* cleanup is retried on the next management request */ }
    }
    return expired;
  }
}

export const previewDatabaseEngine = new PreviewDatabaseEngine();
