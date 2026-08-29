import type { Project } from '../types';
import type { Project as BrisaBaseProject, Environment } from '../brisabase/types';
import { installControlPlaneFetch } from '../brisabase/services/controlPlaneFetch';
import { migrateLegacyScopeStorage } from './legacyBrowserState';
import { adminAuthService } from '../brisabase/services/adminAuthService';
import { realProjectService } from '../brisabase/services/projectService';
import { realDatabaseService } from '../brisabase/services/databaseService';
import { realAuthService } from '../brisabase/services/authService';
import { realStorageService } from '../brisabase/services/storageService';
import { realFunctionsService } from '../brisabase/services/functionsService';
import { realRealtimeService } from '../brisabase/services/realtimeService';
import { realApiService } from '../brisabase/services/apiService';
import { realLogsService } from '../brisabase/services/logsService';
import { realMonitoringService } from '../brisabase/services/monitoringService';
import { observabilityService } from '../brisabase/services/observabilityService';
import { realBackupService } from '../brisabase/services/backupService';
import { realTeamService } from '../brisabase/services/teamService';
import { realBillingService } from '../brisabase/services/billingService';
import { realInfrastructureService } from '../brisabase/services/infrastructureService';

const envMode = (import.meta as any).env?.VITE_DATA_SOURCE;
export const isRealMode = (envMode || 'api') === 'api';
export const isMockMode = !isRealMode;

if (typeof window !== 'undefined' && isRealMode) {
  migrateLegacyScopeStorage();
  installControlPlaneFetch();
}

function compactNumber(value: number | undefined): string {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function mbLabel(value: number | undefined): string {
  const n = Number(value || 0);
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB`;
  return `${n.toFixed(n < 10 && n > 0 ? 1 : 0)} MB`;
}

export function mapRealProject(project: BrisaBaseProject): Project {
  const status: Project['status'] = project.status === 'online'
    ? 'active'
    : project.status === 'deploying'
      ? 'development'
      : project.status === 'maintenance'
        ? 'maintenance'
        : 'paused';

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description || '',
    region: project.region || 'local',
    status,
    usersCount: compactNumber(project.usersCount),
    databaseSize: 'PostgreSQL',
    storageSize: mbLabel(project.storageUsedMb),
    requestsCount: compactNumber(project.requests24h),
    lastActivity: project.updatedAt ? new Date(project.updatedAt).toLocaleString('pt-BR') : 'Agora mesmo',
    category: project.environment || 'development',
    iconColor: '#12D9FF',
    membersCount: Math.max(1, Number(project.usersCount || 1)),
    organizationId: project.organizationId,
    backendMode: 'real',
    environment: project.environment,
    uptime: Number(project.uptime || 0),
    storageUsedMb: Number(project.storageUsedMb || 0),
  };
}

export async function configureRealProjectScope(project: Project | null): Promise<Project | null> {
  if (!isRealMode || !project) return project;

  if (project.organizationId) localStorage.setItem('brisabase.organizationId', project.organizationId);
  localStorage.setItem('brisabase.projectId', project.id);

  const environments = await realProjectService.listEnvironments(project.id);
  const savedEnvironmentId = localStorage.getItem(`brisabase_environment_id:${project.id}`);
  const preferredType: Environment = project.category || 'development';
  const selected = environments.find((item) => item.id === savedEnvironmentId)
    || environments.find((item) => item.type === preferredType)
    || environments.find((item) => item.type === 'development')
    || environments[0];

  if (selected) {
    localStorage.setItem('brisabase.environmentId', selected.id);
    localStorage.setItem(`brisabase_environment_id:${project.id}`, selected.id);
    project.environmentId = selected.id;
    project.category = selected.type;
  } else {
    localStorage.removeItem('brisabase.environmentId');
  }

  return project;
}

export function clearRealScope(): void {
  localStorage.removeItem('brisabase.organizationId');
  localStorage.removeItem('brisabase.projectId');
  localStorage.removeItem('brisabase.environmentId');
}

export {
  adminAuthService,
  realProjectService,
  realDatabaseService,
  realAuthService,
  realStorageService,
  realFunctionsService,
  realRealtimeService,
  realApiService,
  realLogsService,
  realMonitoringService,
  observabilityService,
  realBackupService,
  realTeamService,
  realBillingService,
  realInfrastructureService,
};
