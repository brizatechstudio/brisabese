import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../logger';
import { observability } from '../observability';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'blocked' | 'pending';
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMemberRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
  user?: UserRow;
}

export interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
  region: string;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  type: 'production' | 'staging' | 'development';
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRow {
  id: string;
  project_id: string;
  environment_id?: string;
  name: string;
  type: 'public' | 'secret' | 'service';
  key_prefix: string;
  key_hash: string;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
  revoked_at?: string;
}

export interface ProjectSettingRow {
  id: string;
  project_id: string;
  environment_id?: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  organization_id: string;
  project_id?: string;
  environment_id?: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: any;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export function hashApiKey(secretKey: string): string {
  return crypto.createHash('sha256').update(secretKey).digest('hex');
}

class DatabaseEngine {
  private usersMap = new Map<string, UserRow>();
  private orgsMap = new Map<string, OrganizationRow>();
  private membersMap = new Map<string, OrganizationMemberRow>();
  private projectsMap = new Map<string, ProjectRow>();
  private envsMap = new Map<string, EnvironmentRow>();
  private apiKeysMap = new Map<string, ApiKeyRow>();
  private settingsMap = new Map<string, ProjectSettingRow>();
  private auditLogsList: AuditLogRow[] = [];
  public migrationVersion: number = 0;

  constructor() {
    // This engine is retained only as an isolated fixture for the historical
    // unit suites. A normal server must never populate or serve an in-memory
    // control plane merely because a legacy router module was imported.
    if (config.testMode) this.initDatabaseAndSeed();
  }

  public initDatabaseAndSeed() {
    this.migrationVersion = 1;
    logger.info('Running migration 001_initial_schema.sql...');

    // Seed User
    const ownerUser: UserRow = {
      id: 'usr_owner_1',
      email: 'lucas@brisabase.dev',
      name: 'Lucas Silva',
      avatar_url: '',
      status: 'active',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };
    this.usersMap.set(ownerUser.id, ownerUser);

    const devUser: UserRow = {
      id: 'usr_dev_2',
      email: 'maria@brisabase.dev',
      name: 'Maria Souza',
      status: 'active',
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.usersMap.set(devUser.id, devUser);

    // Seed Organization
    const defaultOrg: OrganizationRow = {
      id: 'org_core_1',
      name: 'BrisaBase Core Org',
      slug: 'brisabase-core',
      owner_id: ownerUser.id,
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.orgsMap.set(defaultOrg.id, defaultOrg);

    // Seed Org Members
    const member1: OrganizationMemberRow = {
      id: 'mem_1',
      organization_id: defaultOrg.id,
      user_id: ownerUser.id,
      role: 'owner',
      created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const member2: OrganizationMemberRow = {
      id: 'mem_2',
      organization_id: defaultOrg.id,
      user_id: devUser.id,
      role: 'admin',
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.membersMap.set(member1.id, member1);
    this.membersMap.set(member2.id, member2);

    // Seed 5 Projects
    const mockSeedProjects = [
      { id: 'proj_ecommerce_1', name: 'E-Commerce Microservices', slug: 'ecommerce-microservices', desc: 'Plataforma de alta vazão para pagamentos e catálogo de produtos.', region: 'us-east-1' },
      { id: 'proj_mobile_saas', name: 'Mobile SaaS Engine', slug: 'mobile-saas-engine', desc: 'Backend para app mobile com notificações push e realtime sync.', region: 'us-west-2' },
      { id: 'proj_fintech_gateway', name: 'Fintech Payment Gateway', slug: 'fintech-payment-gateway', desc: 'Gateway financeiro resiliente com compliance PCI-DSS.', region: 'sa-east-1' },
      { id: 'proj_ai_platform', name: 'AI Analytics Platform', slug: 'ai-analytics-platform', desc: 'Processamento de pipelines com IA e análise preditiva.', region: 'eu-central-1' },
      { id: 'proj_iot_hub', name: 'IoT Telemetry Hub', slug: 'iot-telemetry-hub', desc: 'Ingestão de métricas e sensores IoT em larga escala.', region: 'us-east-1' }
    ];

    mockSeedProjects.forEach((pData, idx) => {
      const proj: ProjectRow = {
        id: pData.id,
        organization_id: defaultOrg.id,
        name: pData.name,
        slug: pData.slug,
        description: pData.desc,
        region: pData.region,
        status: 'active',
        created_at: new Date(Date.now() - (30 - idx * 4) * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.projectsMap.set(proj.id, proj);

      // Create 3 environments per project: Production, Staging, Development
      const envTypes: Array<'production' | 'staging' | 'development'> = ['production', 'staging', 'development'];
      envTypes.forEach((envType) => {
        const env: EnvironmentRow = {
          id: `env_${proj.id}_${envType}`,
          project_id: proj.id,
          name: envType.charAt(0).toUpperCase() + envType.slice(1),
          slug: envType,
          type: envType,
          status: 'active',
          created_at: proj.created_at,
          updated_at: proj.updated_at,
        };
        this.envsMap.set(env.id, env);
      });

      // Create API Keys per project
      const rawPublic = `bb_pub_${proj.slug}_12345`;
      const rawSecret = `bb_sec_${proj.slug}_67890`;

      const pubKey: ApiKeyRow = {
        id: `key_${proj.id}_pub`,
        project_id: proj.id,
        environment_id: `env_${proj.id}_production`,
        name: 'Chave Pública Client',
        type: 'public',
        key_prefix: 'bb_pub_',
        key_hash: hashApiKey(rawPublic),
        created_at: proj.created_at,
      };

      const secKey: ApiKeyRow = {
        id: `key_${proj.id}_sec`,
        project_id: proj.id,
        environment_id: `env_${proj.id}_production`,
        name: 'Chave Secreta Backend',
        type: 'secret',
        key_prefix: 'bb_sec_',
        key_hash: hashApiKey(rawSecret),
        created_at: proj.created_at,
      };

      this.apiKeysMap.set(pubKey.id, pubKey);
      this.apiKeysMap.set(secKey.id, secKey);

      // Settings per project
      const setting: ProjectSettingRow = {
        id: `sett_${proj.id}_1`,
        project_id: proj.id,
        key: 'MAX_CONNECTIONS',
        value: '500',
        created_at: proj.created_at,
        updated_at: proj.updated_at,
      };
      this.settingsMap.set(setting.id, setting);

      // Audit Log for project creation
      this.auditLogsList.push({
        id: `audit_${proj.id}_init`,
        organization_id: defaultOrg.id,
        project_id: proj.id,
        environment_id: `env_${proj.id}_production`,
        user_id: ownerUser.id,
        action: 'project.created',
        resource_type: 'project',
        resource_id: proj.id,
        metadata: { name: proj.name, region: proj.region },
        ip_address: '192.168.1.100',
        user_agent: 'BrisaBase Web Engine 1.0',
        created_at: proj.created_at,
      });
    });

    logger.info(`Database initial migration and seed complete. Orgs: ${this.orgsMap.size}, Projects: ${this.projectsMap.size}, Envs: ${this.envsMap.size}`);
  }

  /** Backup-safe control-plane state. API keys retain only hashes; raw keys are never recoverable. */
  public exportProjectBackupState(organizationId: string, projectId: string, environmentId: string): Record<string, unknown> {
    const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
    return clone({ project: this.projectsMap.get(projectId), environment: this.envsMap.get(environmentId), settings: Array.from(this.settingsMap.values()).filter((item) => item.project_id === projectId && (!item.environment_id || item.environment_id === environmentId)), apiKeys: Array.from(this.apiKeysMap.values()).filter((item) => item.project_id === projectId && (!item.environment_id || item.environment_id === environmentId)), members: Array.from(this.membersMap.values()).filter((item) => item.organization_id === organizationId) });
  }

  public restoreProjectBackupState(organizationId: string, projectId: string, environmentId: string, state: any): void {
    if (!state || !state.project || !state.environment) throw new Error('Invalid control-plane backup state.');
    if (state.project.id !== projectId || state.project.organization_id !== organizationId || state.environment.id !== environmentId) throw new Error('Backup scope does not match the target project/environment.');
    this.projectsMap.set(projectId, JSON.parse(JSON.stringify(state.project))); this.envsMap.set(environmentId, JSON.parse(JSON.stringify(state.environment)));
    for (const [id, setting] of this.settingsMap) if (setting.project_id === projectId && (!setting.environment_id || setting.environment_id === environmentId)) this.settingsMap.delete(id);
    for (const setting of state.settings || []) this.settingsMap.set(setting.id, JSON.parse(JSON.stringify(setting)));
    for (const [id, key] of this.apiKeysMap) if (key.project_id === projectId && (!key.environment_id || key.environment_id === environmentId)) this.apiKeysMap.delete(id);
    for (const key of state.apiKeys || []) this.apiKeysMap.set(key.id, JSON.parse(JSON.stringify(key)));
  }

  // --- ORGANIZATIONS ---
  public getOrganizations(): OrganizationRow[] {
    return Array.from(this.orgsMap.values());
  }

  public getOrganizationById(id: string): OrganizationRow | undefined {
    return this.orgsMap.get(id);
  }

  public createOrganization(data: { name: string; slug: string; owner_id: string }): OrganizationRow {
    const org: OrganizationRow = {
      id: `org_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name,
      slug: data.slug,
      owner_id: data.owner_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.orgsMap.set(org.id, org);

    // Add owner as org member
    const member: OrganizationMemberRow = {
      id: `mem_${Date.now()}`,
      organization_id: org.id,
      user_id: data.owner_id,
      role: 'owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.membersMap.set(member.id, member);

    this.logAudit({
      organization_id: org.id,
      user_id: data.owner_id,
      action: 'organization.created',
      resource_type: 'organization',
      resource_id: org.id,
      metadata: { name: org.name },
    });

    return org;
  }

  public updateOrganization(id: string, updates: Partial<{ name: string; slug: string }>): OrganizationRow | undefined {
    const org = this.orgsMap.get(id);
    if (!org) return undefined;
    const updated = { ...org, ...updates, updated_at: new Date().toISOString() };
    this.orgsMap.set(id, updated);
    return updated;
  }

  public deleteOrganization(id: string): boolean {
    return this.orgsMap.delete(id);
  }

  // --- PROJECTS ---
  public getProjects(orgId?: string): ProjectRow[] {
    const all = Array.from(this.projectsMap.values());
    if (orgId) return all.filter(p => p.organization_id === orgId);
    return all;
  }

  public getProjectById(id: string): ProjectRow | undefined {
    return this.projectsMap.get(id) || Array.from(this.projectsMap.values()).find(p => p.slug === id);
  }

  public createProject(data: { organization_id?: string; name: string; slug?: string; description?: string; region?: string }): { project: ProjectRow; environments: EnvironmentRow[] } {
    const defaultOrgId = Array.from(this.orgsMap.keys())[0] || 'org_core_1';
    const orgId = data.organization_id || defaultOrgId;
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const project: ProjectRow = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organization_id: orgId,
      name: data.name,
      slug,
      description: data.description || '',
      region: data.region || 'us-east-1',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.projectsMap.set(project.id, project);

    // Auto-create Production, Staging, Development environments
    const createdEnvs: EnvironmentRow[] = [];
    const envTypes: Array<'production' | 'staging' | 'development'> = ['production', 'staging', 'development'];
    envTypes.forEach((type) => {
      const env: EnvironmentRow = {
        id: `env_${project.id}_${type}`,
        project_id: project.id,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        slug: type,
        type,
        status: 'active',
        created_at: project.created_at,
        updated_at: project.updated_at,
      };
      this.envsMap.set(env.id, env);
      createdEnvs.push(env);
    });

    // Auto-create initial API keys
    const rawPublic = `bb_pub_${project.slug}_${Math.random().toString(36).substring(2, 10)}`;
    const rawSecret = `bb_sec_${project.slug}_${Math.random().toString(36).substring(2, 10)}`;

    const pubKey: ApiKeyRow = {
      id: `key_${project.id}_pub`,
      project_id: project.id,
      environment_id: createdEnvs[0].id,
      name: 'Public Key',
      type: 'public',
      key_prefix: 'bb_pub_',
      key_hash: hashApiKey(rawPublic),
      created_at: project.created_at,
    };

    const secKey: ApiKeyRow = {
      id: `key_${project.id}_sec`,
      project_id: project.id,
      environment_id: createdEnvs[0].id,
      name: 'Secret Key',
      type: 'secret',
      key_prefix: 'bb_sec_',
      key_hash: hashApiKey(rawSecret),
      created_at: project.created_at,
    };

    this.apiKeysMap.set(pubKey.id, pubKey);
    this.apiKeysMap.set(secKey.id, secKey);

    this.logAudit({
      organization_id: orgId,
      project_id: project.id,
      environment_id: createdEnvs[0].id,
      user_id: 'usr_owner_1',
      action: 'project.created',
      resource_type: 'project',
      resource_id: project.id,
      metadata: { name: project.name, region: project.region },
    });

    return { project, environments: createdEnvs };
  }

  public updateProject(id: string, updates: Partial<{ name: string; description: string; region: string; status: 'active' | 'paused' | 'archived' }>): ProjectRow | undefined {
    const proj = this.getProjectById(id);
    if (!proj) return undefined;
    const updated = { ...proj, ...updates, updated_at: new Date().toISOString() };
    this.projectsMap.set(proj.id, updated);
    this.logAudit({
      organization_id: proj.organization_id,
      project_id: proj.id,
      user_id: 'usr_owner_1',
      action: 'project.updated',
      resource_type: 'project',
      resource_id: proj.id,
      metadata: updates,
    });
    return updated;
  }

  public deleteProject(id: string): boolean {
    const proj = this.getProjectById(id);
    if (!proj) return false;
    this.projectsMap.delete(proj.id);
    this.logAudit({
      organization_id: proj.organization_id,
      project_id: proj.id,
      user_id: 'usr_owner_1',
      action: 'project.deleted',
      resource_type: 'project',
      resource_id: proj.id,
      metadata: { name: proj.name },
    });
    return true;
  }

  // --- ENVIRONMENTS ---
  public getEnvironmentsByProject(projectId: string): EnvironmentRow[] {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;
    return Array.from(this.envsMap.values()).filter(e => e.project_id === pid);
  }

  public createEnvironment(projectId: string, data: { name: string; type: 'production' | 'staging' | 'development' }): EnvironmentRow {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const env: EnvironmentRow = {
      id: `env_${pid}_${Date.now()}`,
      project_id: pid,
      name: data.name,
      slug,
      type: data.type,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.envsMap.set(env.id, env);

    if (proj) {
      this.logAudit({
        organization_id: proj.organization_id,
        project_id: pid,
        environment_id: env.id,
        user_id: 'usr_owner_1',
        action: 'environment.created',
        resource_type: 'environment',
        resource_id: env.id,
        metadata: { name: env.name, type: env.type },
      });
    }
    return env;
  }

  public updateEnvironment(id: string, updates: Partial<{ name: string; status: string }>): EnvironmentRow | undefined {
    const env = this.envsMap.get(id);
    if (!env) return undefined;
    const updated = { ...env, ...updates, updated_at: new Date().toISOString() };
    this.envsMap.set(id, updated);
    return updated;
  }

  // --- API KEYS ---
  public getApiKeysByProject(projectId: string): ApiKeyRow[] {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;
    return Array.from(this.apiKeysMap.values()).filter(k => k.project_id === pid);
  }

  public findApiKeyByRawKey(rawKey: string): ApiKeyRow | undefined {
    const hash = hashApiKey(rawKey);
    return Array.from(this.apiKeysMap.values()).find((k) => k.key_hash === hash && !k.revoked_at);
  }

  public createApiKey(projectId: string, data: { name: string; type: 'public' | 'secret' | 'service'; environment_id?: string }): { apiKey: ApiKeyRow; fullSecretKey: string } {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;
    const prefix = data.type === 'public' ? 'bb_pub_' : data.type === 'service' ? 'bb_srv_' : 'bb_sec_';
    const randomBody = crypto.randomBytes(16).toString('hex');
    const fullSecretKey = `${prefix}${randomBody}`;

    const apiKey: ApiKeyRow = {
      id: `key_${pid}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      project_id: pid,
      environment_id: data.environment_id,
      name: data.name,
      type: data.type,
      key_prefix: prefix,
      key_hash: hashApiKey(fullSecretKey),
      created_at: new Date().toISOString(),
    };
    this.apiKeysMap.set(apiKey.id, apiKey);

    if (proj) {
      this.logAudit({
        organization_id: proj.organization_id,
        project_id: pid,
        user_id: 'usr_owner_1',
        action: 'api_key.created',
        resource_type: 'api_key',
        resource_id: apiKey.id,
        metadata: { name: apiKey.name, type: apiKey.type },
      });
    }

    return { apiKey, fullSecretKey };
  }

  public revokeApiKey(id: string): ApiKeyRow | undefined {
    const key = this.apiKeysMap.get(id);
    if (!key) return undefined;
    const updated = { ...key, revoked_at: new Date().toISOString() };
    this.apiKeysMap.set(id, updated);

    const proj = this.getProjectById(key.project_id);
    if (proj) {
      this.logAudit({
        organization_id: proj.organization_id,
        project_id: key.project_id,
        user_id: 'usr_owner_1',
        action: 'api_key.revoked',
        resource_type: 'api_key',
        resource_id: key.id,
        metadata: { name: key.name },
      });
    }
    return updated;
  }

  public deleteApiKey(id: string): boolean {
    return this.apiKeysMap.delete(id);
  }

  // --- MEMBERS ---
  public getMembersByOrg(orgId: string): OrganizationMemberRow[] {
    return Array.from(this.membersMap.values())
      .filter(m => m.organization_id === orgId)
      .map(m => ({
        ...m,
        user: this.usersMap.get(m.user_id)
      }));
  }

  public addMember(orgId: string, data: { email: string; role: 'owner' | 'admin' | 'developer' | 'viewer' | 'billing' }): OrganizationMemberRow {
    // Check if user exists
    let user = Array.from(this.usersMap.values()).find(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (!user) {
      user = {
        id: `usr_${Date.now()}`,
        email: data.email,
        name: data.email.split('@')[0],
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.usersMap.set(user.id, user);
    }

    const member: OrganizationMemberRow = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organization_id: orgId,
      user_id: user.id,
      role: data.role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user,
    };
    this.membersMap.set(member.id, member);

    this.logAudit({
      organization_id: orgId,
      user_id: 'usr_owner_1',
      action: 'member.invited',
      resource_type: 'member',
      resource_id: member.id,
      metadata: { email: data.email, role: data.role },
    });

    return member;
  }

  public updateMemberRole(memberId: string, role: 'owner' | 'admin' | 'developer' | 'viewer' | 'billing'): OrganizationMemberRow | undefined {
    const mem = this.membersMap.get(memberId);
    if (!mem) return undefined;
    const updated = { ...mem, role, updated_at: new Date().toISOString() };
    this.membersMap.set(memberId, updated);

    this.logAudit({
      organization_id: mem.organization_id,
      user_id: 'usr_owner_1',
      action: 'member.role_changed',
      resource_type: 'member',
      resource_id: memberId,
      metadata: { newRole: role },
    });

    return { ...updated, user: this.usersMap.get(updated.user_id) };
  }

  public deleteMember(memberId: string): boolean {
    return this.membersMap.delete(memberId);
  }

  // --- PROJECT SETTINGS ---
  public getSettings(projectId: string, envId?: string): ProjectSettingRow[] {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;
    return Array.from(this.settingsMap.values()).filter(s => s.project_id === pid && (!envId || s.environment_id === envId));
  }

  public deleteSetting(projectId: string, key: string, envId?: string): boolean {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;
    const existing = Array.from(this.settingsMap.values()).find(s => s.project_id === pid && s.key === key && s.environment_id === envId);
    if (!existing) return false;
    return this.settingsMap.delete(existing.id);
  }

  public setSetting(projectId: string, key: string, value: string, envId?: string): ProjectSettingRow {
    const proj = this.getProjectById(projectId);
    const pid = proj ? proj.id : projectId;

    const existing = Array.from(this.settingsMap.values()).find(s => s.project_id === pid && s.key === key && s.environment_id === envId);
    if (existing) {
      existing.value = value;
      existing.updated_at = new Date().toISOString();
      this.settingsMap.set(existing.id, existing);
      return existing;
    }

    const setting: ProjectSettingRow = {
      id: `sett_${pid}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      project_id: pid,
      environment_id: envId,
      key,
      value,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.settingsMap.set(setting.id, setting);

    if (proj) {
      this.logAudit({
        organization_id: proj.organization_id,
        project_id: pid,
        user_id: 'usr_owner_1',
        action: 'settings.updated',
        resource_type: 'setting',
        resource_id: setting.id,
        metadata: { key },
      });
    }

    return setting;
  }

  // --- AUDIT LOGS ---
  public getAuditLogs(orgId?: string, projectId?: string): AuditLogRow[] {
    let logs = [...this.auditLogsList];
    if (orgId) logs = logs.filter(l => l.organization_id === orgId);
    if (projectId) {
      const proj = this.getProjectById(projectId);
      const pid = proj ? proj.id : projectId;
      logs = logs.filter(l => l.project_id === pid);
    }
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public logAudit(logData: {
    organization_id: string;
    project_id?: string;
    environment_id?: string;
    user_id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    metadata?: any;
    ip_address?: string;
    user_agent?: string;
  }): AuditLogRow {
    const log: AuditLogRow = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organization_id: logData.organization_id,
      project_id: logData.project_id,
      environment_id: logData.environment_id,
      user_id: logData.user_id,
      action: logData.action,
      resource_type: logData.resource_type,
      resource_id: logData.resource_id,
      metadata: logData.metadata,
      ip_address: logData.ip_address || '127.0.0.1',
      user_agent: logData.user_agent || 'BrisaBase Service',
      created_at: new Date().toISOString(),
    };
    this.auditLogsList.unshift(log);
    observability.metric('audit.events', 1, 'counter', { action: log.action, resourceType: log.resource_type }, { organizationId: log.organization_id, projectId: log.project_id, environmentId: log.environment_id, userId: log.user_id, service: 'audit' });
    observability.bus.publish('audit', log);
    return log;
  }
}

export const db = new DatabaseEngine();
