import crypto from 'node:crypto';
import { postgres } from './postgres';
import { ApiKeyRow, AuditLogRow, EnvironmentRow, OrganizationMemberRow, OrganizationRow, ProjectRow, ProjectSettingRow, UserRow } from './database';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

export class ControlRepository {
  public async listOrganizations(): Promise<OrganizationRow[]> { return postgres.query<OrganizationRow>('SELECT * FROM organizations ORDER BY created_at DESC'); }
  public async listOrganizationsForUser(userId: string): Promise<OrganizationRow[]> {
    return postgres.query<OrganizationRow>(
      `SELECT DISTINCT o.*
         FROM organizations o
         LEFT JOIN organization_members m
           ON m.organization_id=o.id AND m.user_id=$1
        WHERE o.owner_id=$1 OR m.user_id=$1
        ORDER BY o.created_at DESC`,
      [userId],
    );
  }
  public async getOrganization(id: string): Promise<OrganizationRow | null> { return (await postgres.query<OrganizationRow>('SELECT * FROM organizations WHERE id = $1', [id]))[0] || null; }
  public async getOrganizationRole(userId: string, organizationId: string): Promise<OrganizationMemberRow['role'] | null> {
    const rows = await postgres.query<{ role: OrganizationMemberRow['role'] }>(
      `SELECT CASE WHEN o.owner_id=$1 THEN 'owner' ELSE m.role END AS role
         FROM organizations o
         LEFT JOIN organization_members m
           ON m.organization_id=o.id AND m.user_id=$1
        WHERE o.id=$2 AND (o.owner_id=$1 OR m.user_id=$1)
        LIMIT 1`,
      [userId, organizationId],
    );
    return rows[0]?.role || null;
  }
  public async createOrganization(data: { name: string; slug: string; owner_id: string }): Promise<OrganizationRow> {
    const record = { id: id('org'), ...data, created_at: now(), updated_at: now() };
    return postgres.transaction(async (client) => {
      const created = (await client.query<OrganizationRow>('INSERT INTO organizations(id,name,slug,owner_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [record.id, record.name, record.slug, record.owner_id, record.created_at, record.updated_at])).rows[0];
      await client.query(
        'INSERT INTO organization_members(id,organization_id,user_id,role,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT (organization_id,user_id) DO UPDATE SET role=$4,updated_at=$5',
        [id('mem'), record.id, record.owner_id, 'owner', record.created_at],
      );
      return created;
    });
  }
  public async updateOrganization(organizationId: string, updates: Partial<Pick<OrganizationRow, 'name' | 'slug'>>): Promise<OrganizationRow | null> {
    const current = await this.getOrganization(organizationId); if (!current) return null;
    return (await postgres.query<OrganizationRow>('UPDATE organizations SET name=$2, slug=$3, updated_at=$4 WHERE id=$1 RETURNING *', [organizationId, updates.name ?? current.name, updates.slug ?? current.slug, now()]))[0] || null;
  }
  public async deleteOrganization(organizationId: string): Promise<boolean> { const rows = await postgres.query<{ id: string }>('DELETE FROM organizations WHERE id=$1 RETURNING id', [organizationId]); return rows.length > 0; }

  public async listProjects(organizationId?: string): Promise<ProjectRow[]> { return postgres.query<ProjectRow>(organizationId ? 'SELECT * FROM projects WHERE organization_id=$1 ORDER BY created_at DESC' : 'SELECT * FROM projects ORDER BY created_at DESC', organizationId ? [organizationId] : []); }
  public async listProjectsForUser(userId: string, organizationId?: string): Promise<ProjectRow[]> {
    const values: unknown[] = [userId];
    const organizationFilter = organizationId ? ' AND p.organization_id=$2' : '';
    if (organizationId) values.push(organizationId);
    return postgres.query<ProjectRow>(
      `SELECT DISTINCT p.*
         FROM projects p
         JOIN organizations o ON o.id=p.organization_id
         LEFT JOIN organization_members m
           ON m.organization_id=o.id AND m.user_id=$1
        WHERE (o.owner_id=$1 OR m.user_id=$1)${organizationFilter}
        ORDER BY p.created_at DESC`,
      values,
    );
  }
  public async getProject(projectId: string): Promise<ProjectRow | null> { return (await postgres.query<ProjectRow>('SELECT * FROM projects WHERE id=$1', [projectId]))[0] || null; }
  public async createProject(data: { organization_id: string; name: string; slug?: string; description?: string; region?: string }): Promise<{ project: ProjectRow; environments: EnvironmentRow[] }> {
    const project: ProjectRow = { id: id('proj'), organization_id: data.organization_id, name: data.name, slug: data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), description: data.description, region: data.region || 'us-east-1', status: 'active', created_at: now(), updated_at: now() };
    const environments = (['production', 'staging', 'development'] as const).map((type) => ({ id: `env_${project.id}_${type}`, project_id: project.id, name: `${type.slice(0, 1).toUpperCase()}${type.slice(1)}`, slug: type, type, status: 'active', created_at: project.created_at, updated_at: project.updated_at }));
    await postgres.execute('INSERT INTO projects(id,organization_id,name,slug,description,region,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [project.id, project.organization_id, project.name, project.slug, project.description || null, project.region, project.status, project.created_at, project.updated_at]);
    for (const environment of environments) await postgres.execute('INSERT INTO project_environments(id,project_id,name,slug,type,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [environment.id, environment.project_id, environment.name, environment.slug, environment.type, environment.status, environment.created_at, environment.updated_at]);
    return { project, environments };
  }
  public async updateProject(projectId: string, updates: Partial<Pick<ProjectRow, 'name' | 'description' | 'region' | 'status'>>): Promise<ProjectRow | null> {
    const current = await this.getProject(projectId); if (!current) return null;
    return (await postgres.query<ProjectRow>('UPDATE projects SET name=$2,description=$3,region=$4,status=$5,updated_at=$6 WHERE id=$1 RETURNING *', [projectId, updates.name ?? current.name, updates.description ?? current.description ?? null, updates.region ?? current.region, updates.status ?? current.status, now()]))[0] || null;
  }
  public async deleteProject(projectId: string): Promise<boolean> { const rows = await postgres.query<{ id: string }>('DELETE FROM projects WHERE id=$1 RETURNING id', [projectId]); return rows.length > 0; }
  public async listEnvironments(projectId: string): Promise<EnvironmentRow[]> { return postgres.query<EnvironmentRow>('SELECT * FROM project_environments WHERE project_id=$1 ORDER BY created_at', [projectId]); }
  public async getEnvironment(environmentId: string): Promise<EnvironmentRow | null> { return (await postgres.query<EnvironmentRow>('SELECT * FROM project_environments WHERE id=$1', [environmentId]))[0] || null; }
  public async createEnvironment(projectId: string, data: { name: string; type: EnvironmentRow['type'] }): Promise<EnvironmentRow> { const record: EnvironmentRow = { id: `env_${projectId}_${data.type}_${crypto.randomUUID().slice(0, 8)}`, project_id: projectId, name: data.name, slug: data.type, type: data.type, status: 'active', created_at: now(), updated_at: now() }; return (await postgres.query<EnvironmentRow>('INSERT INTO project_environments(id,project_id,name,slug,type,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [record.id,record.project_id,record.name,record.slug,record.type,record.status,record.created_at,record.updated_at]))[0]; }
  public async updateEnvironment(environmentId: string, updates: Partial<Pick<EnvironmentRow, 'name' | 'status'>>): Promise<EnvironmentRow | null> { const current = await this.getEnvironment(environmentId); if (!current) return null; return (await postgres.query<EnvironmentRow>('UPDATE project_environments SET name=$2,status=$3,updated_at=$4 WHERE id=$1 RETURNING *', [environmentId,updates.name ?? current.name,updates.status ?? current.status,now()]))[0] || null; }

  public async findApiKeyByRawKey(rawKey: string): Promise<ApiKeyRow | null> { const hash = crypto.createHash('sha256').update(rawKey).digest('hex'); return (await postgres.query<ApiKeyRow>('SELECT * FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())', [hash]))[0] || null; }
  public async getApiKey(keyId: string): Promise<ApiKeyRow | null> { return (await postgres.query<ApiKeyRow>('SELECT * FROM api_keys WHERE id=$1', [keyId]))[0] || null; }
  public async listApiKeys(projectId: string): Promise<ApiKeyRow[]> { return postgres.query<ApiKeyRow>('SELECT * FROM api_keys WHERE project_id=$1 ORDER BY created_at DESC', [projectId]); }
  public async createApiKey(projectId: string, data: { name: string; type: ApiKeyRow['type']; environment_id?: string }): Promise<{ apiKey: ApiKeyRow; fullSecretKey: string }> { const raw = `bb_${data.type === 'public' ? 'pub' : data.type === 'service' ? 'srv' : 'sec'}_${crypto.randomBytes(24).toString('base64url')}`; const record: ApiKeyRow = { id: id('key'), project_id: projectId, environment_id: data.environment_id, name: data.name, type: data.type, key_prefix: raw.slice(0, 7), key_hash: crypto.createHash('sha256').update(raw).digest('hex'), created_at: now() }; const apiKey = (await postgres.query<ApiKeyRow>('INSERT INTO api_keys(id,project_id,environment_id,name,type,key_prefix,key_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [record.id,record.project_id,record.environment_id || null,record.name,record.type,record.key_prefix,record.key_hash,record.created_at]))[0]; return { apiKey, fullSecretKey: raw }; }
  public async revokeApiKey(keyId: string): Promise<boolean> { const rows = await postgres.query<{ id: string }>('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id', [keyId]); return rows.length > 0; }
  public async deleteApiKey(keyId: string): Promise<boolean> { const rows = await postgres.query<{ id: string }>('DELETE FROM api_keys WHERE id=$1 RETURNING id', [keyId]); return rows.length > 0; }

  public async listMembers(organizationId: string): Promise<OrganizationMemberRow[]> { return postgres.query<OrganizationMemberRow>('SELECT m.id,m.organization_id,m.user_id,m.role,m.created_at,m.updated_at,row_to_json(u) AS user FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY m.created_at', [organizationId]); }
  public async getMember(memberId: string): Promise<OrganizationMemberRow | null> { return (await postgres.query<OrganizationMemberRow>('SELECT * FROM organization_members WHERE id=$1', [memberId]))[0] || null; }
  public async addMember(organizationId: string, data: { email: string; role: OrganizationMemberRow['role'] }): Promise<OrganizationMemberRow> { let user = (await postgres.query<UserRow>('SELECT * FROM users WHERE email=$1', [data.email]))[0]; if (!user) { user = (await postgres.query<UserRow>('INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) RETURNING *', [id('usr'), data.email, data.email.split('@')[0], 'pending', now()]))[0]; } return (await postgres.query<OrganizationMemberRow>('INSERT INTO organization_members(id,organization_id,user_id,role,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5) RETURNING *', [id('mem'),organizationId,user.id,data.role,now()]))[0]; }
  public async updateMember(memberId: string, role: OrganizationMemberRow['role']): Promise<OrganizationMemberRow | null> { return (await postgres.query<OrganizationMemberRow>('UPDATE organization_members SET role=$2,updated_at=$3 WHERE id=$1 RETURNING *', [memberId,role,now()]))[0] || null; }
  public async deleteMember(memberId: string): Promise<boolean> { const rows = await postgres.query<{ id: string }>('DELETE FROM organization_members WHERE id=$1 RETURNING id',[memberId]); return rows.length > 0; }

  public async listSettings(projectId: string, environmentId?: string): Promise<ProjectSettingRow[]> { return postgres.query<ProjectSettingRow>(environmentId ? 'SELECT * FROM project_settings WHERE project_id=$1 AND (environment_id=$2 OR environment_id IS NULL)' : 'SELECT * FROM project_settings WHERE project_id=$1', environmentId ? [projectId,environmentId] : [projectId]); }
  public async setSetting(projectId: string, key: string, value: string, environmentId?: string): Promise<ProjectSettingRow> { const record: ProjectSettingRow = { id: id('setting'), project_id: projectId, environment_id: environmentId, key, value, created_at: now(), updated_at: now() }; return (await postgres.query<ProjectSettingRow>('INSERT INTO project_settings(id,project_id,environment_id,key,value,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (project_id,environment_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at RETURNING *', [record.id,record.project_id,record.environment_id || null,record.key,record.value,record.created_at,record.updated_at]))[0]; }
  public async logAudit(entry: Omit<AuditLogRow, 'id' | 'created_at'>): Promise<void> { await postgres.execute('INSERT INTO audit_logs(id,organization_id,project_id,environment_id,user_id,action,resource_type,resource_id,metadata,ip_address,user_agent,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id('audit'),entry.organization_id,entry.project_id || null,entry.environment_id || null,entry.user_id,entry.action,entry.resource_type,entry.resource_id || null,JSON.stringify(entry.metadata || {}),entry.ip_address || null,entry.user_agent || null,now()]); }
  public async listAuditLogs(organizationId?: string, projectId?: string): Promise<AuditLogRow[]> { return postgres.query<AuditLogRow>(projectId ? 'SELECT * FROM audit_logs WHERE project_id=$1 ORDER BY created_at DESC' : organizationId ? 'SELECT * FROM audit_logs WHERE organization_id=$1 ORDER BY created_at DESC' : 'SELECT * FROM audit_logs ORDER BY created_at DESC', projectId ? [projectId] : organizationId ? [organizationId] : []); }
  public async recordSqlHistory(input: { projectId: string; environmentId: string; userId: string; query: string; executionTimeMs?: number; rowCount?: number; status: 'success' | 'error'; errorMessage?: string }): Promise<void> {
    await postgres.execute('INSERT INTO sql_query_history(id,project_id,environment_id,user_id,query,execution_time_ms,row_count,status,error_message,executed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())', [id('sql'),input.projectId,input.environmentId,input.userId,input.query.slice(0, 100_000),Math.max(0,Math.round(input.executionTimeMs || 0)),Math.max(0,Math.round(input.rowCount || 0)),input.status,input.errorMessage?.slice(0, 1_000) || null]);
  }
  public async listSqlHistory(projectId: string, environmentId: string, limit = 100): Promise<Array<{ id: string; query: string; executionTimeMs: number; rowCount: number; status: 'success' | 'error'; executedAt: string; errorMessage?: string }>> {
    const rows = await postgres.query<any>('SELECT id,query,execution_time_ms,row_count,status,error_message,executed_at FROM sql_query_history WHERE project_id=$1 AND environment_id=$2 ORDER BY executed_at DESC LIMIT $3', [projectId,environmentId,Math.min(Math.max(limit,1),500)]);
    return rows.map((row) => ({ id: row.id, query: row.query, executionTimeMs: Number(row.execution_time_ms), rowCount: Number(row.row_count), status: row.status, executedAt: new Date(row.executed_at).toISOString(), ...(row.error_message ? { errorMessage: row.error_message } : {}) }));
  }

  public async getSqlMetrics(projectId: string, environmentId: string): Promise<{ total: number; successCount: number; errorCount: number; avgExecutionTimeMs: number; p95ExecutionTimeMs: number; avgRowCount: number; last24hCount: number }> {
    const rows = await postgres.query<any>(`
      SELECT count(*)::text AS total,
        count(*) FILTER (WHERE status='success')::text AS success_count,
        count(*) FILTER (WHERE status='error')::text AS error_count,
        coalesce(avg(execution_time_ms) FILTER (WHERE status='success'),0)::text AS avg_execution_time_ms,
        coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY execution_time_ms) FILTER (WHERE status='success'),0)::text AS p95_execution_time_ms,
        coalesce(avg(row_count) FILTER (WHERE status='success'),0)::text AS avg_row_count,
        count(*) FILTER (WHERE executed_at >= now() - interval '24 hours')::text AS last24h_count
      FROM sql_query_history WHERE project_id=$1 AND environment_id=$2`, [projectId, environmentId]);
    const row = rows[0] || {};
    return { total:Number(row.total||0), successCount:Number(row.success_count||0), errorCount:Number(row.error_count||0), avgExecutionTimeMs:Math.round(Number(row.avg_execution_time_ms||0)), p95ExecutionTimeMs:Math.round(Number(row.p95_execution_time_ms||0)), avgRowCount:Math.round(Number(row.avg_row_count||0)*100)/100, last24hCount:Number(row.last24h_count||0) };
  }

  public async listSavedSqlQueries(projectId: string, environmentId: string, userId: string): Promise<Array<{ id: string; name: string; query: string; favorite: boolean; createdAt: string; updatedAt: string }>> {
    const rows = await postgres.query<any>('SELECT id,name,query,favorite,created_at,updated_at FROM sql_saved_queries WHERE project_id=$1 AND environment_id=$2 AND user_id=$3 ORDER BY favorite DESC,updated_at DESC', [projectId, environmentId, userId]);
    return rows.map((row) => ({ id: row.id, name: row.name, query: row.query, favorite: Boolean(row.favorite), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() }));
  }

  public async saveSqlQuery(input: { projectId: string; environmentId: string; userId: string; name: string; query: string; favorite?: boolean }): Promise<{ id: string; name: string; query: string; favorite: boolean; createdAt: string; updatedAt: string }> {
    const name = input.name.trim();
    if (!name || name.length > 160) throw new Error('Saved query name must contain 1 to 160 characters.');
    const query = input.query.trim();
    if (!query || query.length > 100_000) throw new Error('Saved query must contain 1 to 100000 characters.');
    const row = await postgres.transaction(async (client) => {
      const existing = (await client.query<any>('SELECT id FROM sql_saved_queries WHERE project_id=$1 AND environment_id=$2 AND user_id=$3 AND lower(name)=lower($4) FOR UPDATE', [input.projectId, input.environmentId, input.userId, name])).rows[0];
      if (existing) {
        return (await client.query<any>('UPDATE sql_saved_queries SET name=$2,query=$3,favorite=$4,updated_at=now() WHERE id=$1 RETURNING id,name,query,favorite,created_at,updated_at', [existing.id, name, query, Boolean(input.favorite)])).rows[0];
      }
      return (await client.query<any>('INSERT INTO sql_saved_queries(id,project_id,environment_id,user_id,name,query,favorite,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING id,name,query,favorite,created_at,updated_at', [id('saved_sql'), input.projectId, input.environmentId, input.userId, name, query, Boolean(input.favorite)])).rows[0];
    });
    return { id: row.id, name: row.name, query: row.query, favorite: Boolean(row.favorite), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
  }

  public async updateSavedSqlQuery(idValue: string, projectId: string, environmentId: string, userId: string, input: { name?: string; query?: string; favorite?: boolean }): Promise<any | null> {
    const current = (await postgres.query<any>('SELECT * FROM sql_saved_queries WHERE id=$1 AND project_id=$2 AND environment_id=$3 AND user_id=$4', [idValue, projectId, environmentId, userId]))[0];
    if (!current) return null;
    const name = input.name === undefined ? current.name : input.name.trim();
    const query = input.query === undefined ? current.query : input.query.trim();
    if (!name || name.length > 160 || !query || query.length > 100_000) throw new Error('Invalid saved query update.');
    const row = (await postgres.query<any>('UPDATE sql_saved_queries SET name=$5,query=$6,favorite=$7,updated_at=now() WHERE id=$1 AND project_id=$2 AND environment_id=$3 AND user_id=$4 RETURNING id,name,query,favorite,created_at,updated_at', [idValue, projectId, environmentId, userId, name, query, input.favorite === undefined ? current.favorite : Boolean(input.favorite)]))[0];
    return row ? { id: row.id, name: row.name, query: row.query, favorite: Boolean(row.favorite), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() } : null;
  }

  public async deleteSavedSqlQuery(idValue: string, projectId: string, environmentId: string, userId: string): Promise<boolean> {
    return (await postgres.query<{ id: string }>('DELETE FROM sql_saved_queries WHERE id=$1 AND project_id=$2 AND environment_id=$3 AND user_id=$4 RETURNING id', [idValue, projectId, environmentId, userId])).length > 0;
  }

}

export const controlRepository = new ControlRepository();
