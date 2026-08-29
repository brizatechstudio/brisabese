import { Project, Environment } from '../types';
import { INITIAL_PROJECTS } from '../mocks/mockProjects';

export interface CreateProjectInput {
  name: string;
  description: string;
  region: string;
  environment: Environment;
}

export interface ProjectEnvironment {
  id: string;
  type: Environment;
}

export interface ProjectService {
  listProjects(): Promise<Project[]>;
  listEnvironments(projectId: string): Promise<ProjectEnvironment[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(data: CreateProjectInput): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<void>;
}

export class MockProjectService implements ProjectService {
  private projects: Project[] = [...INITIAL_PROJECTS];

  async listProjects(): Promise<Project[]> {
    return [...this.projects];
  }

  async listEnvironments(projectId: string): Promise<ProjectEnvironment[]> {
    const project = this.projects.find((item) => item.id === projectId);
    return project ? [{ id: `env_${project.id}_${project.environment}`, type: project.environment }] : [];
  }

  async getProject(id: string): Promise<Project | null> {
    const proj = this.projects.find((p) => p.id === id || p.slug === id);
    return proj ? { ...proj } : null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newProj: Project = {
      id: `proj_bb_${Date.now().toString(36)}`,
      name: input.name,
      slug,
      description: input.description,
      environment: input.environment,
      region: input.region,
      status: 'online',
      requests24h: 0,
      usersCount: 1,
      storageUsedMb: 50,
      functionsCount: 0,
      uptime: 100.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      databaseUrl: `postgresql://postgres:pass@db.${input.region.split(' ')[0]}.brisabase.dev:5432/${slug}`,
      anonKey: `bb_pub_${input.environment.slice(0, 3)}_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
      serviceKey: `bb_sec_${input.environment.slice(0, 3)}_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`
    };
    this.projects.unshift(newProj);
    return newProj;
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Projeto não encontrado');
    this.projects[index] = {
      ...this.projects[index],
      ...data,
      updatedAt: new Date().toISOString()
    };
    return this.projects[index];
  }

  async deleteProject(id: string): Promise<void> {
    this.projects = this.projects.filter((p) => p.id !== id);
  }
}

export class RealProjectService implements ProjectService {
  async listProjects(): Promise<Project[]> {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error(`Project API request failed (${res.status}).`);
    const rawList = await res.json();
    return rawList.map((p: any) => this.mapToProject(p));
  }

  async listEnvironments(projectId: string): Promise<ProjectEnvironment[]> {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/environments`);
    if (!res.ok) throw new Error(`Environment API request failed (${res.status}).`);
    const rawList = await res.json();
    if (!Array.isArray(rawList)) throw new Error('Environment API returned an invalid response.');
    return rawList
      .filter((environment: any) => environment?.id && ['production', 'staging', 'development'].includes(environment.type))
      .map((environment: any) => ({ id: environment.id, type: environment.type as Environment }));
  }

  async getProject(id: string): Promise<Project | null> {
    const res = await fetch(`/api/projects/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Project API request failed (${res.status}).`);
    return this.mapToProject(await res.json());
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: input.name, description: input.description, region: input.region }) });
    if (!res.ok) throw new Error(`Project API request failed (${res.status}).`);
    return this.mapToProject(await res.json(), input.environment);
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const res = await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(`Project API request failed (${res.status}).`);
    return this.mapToProject(await res.json());
  }

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Project API request failed (${res.status}).`);
  }

  private mapToProject(p: any, forcedEnv?: Environment): Project {
    const slug = p.slug || p.id;
    const region = p.region || 'us-east-1';
    const env: Environment = forcedEnv || (p.environment as Environment) || 'production';

    return {
      id: p.id,
      organizationId: p.organization_id,
      name: p.name,
      slug,
      description: p.description || '',
      environment: env,
      region,
      status: p.status === 'active' ? 'online' : p.status === 'paused' ? 'maintenance' : 'offline',
      requests24h: p.requests24h ?? 0,
      usersCount: p.usersCount ?? 0,
      storageUsedMb: p.storageUsedMb ?? 0,
      functionsCount: p.functionsCount ?? 0,
      uptime: p.uptime ?? 0,
      createdAt: p.created_at || new Date().toISOString(),
      updatedAt: p.updated_at || new Date().toISOString(),
      databaseUrl: '',
      anonKey: '',
      serviceKey: '',
    };
  }
}

export const mockProjectService = new MockProjectService();
export const realProjectService = new RealProjectService();
