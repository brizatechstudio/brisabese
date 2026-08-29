/**
 * BRISABASE SERVICE LAYER
 *
 * Real API services by default; fixtures are available only in explicit mock mode.
 * When VITE_DATA_SOURCE='api', requests go to Express Backend & Postgres Database engine.
 * API failures are surfaced to the caller and never silently replaced with mock data.
 */

import { mockProjectService, realProjectService } from './projectService';
import { databaseService } from './databaseService';
import { mockAuthService, realAuthService } from './authService';
import { mockStorageService, realStorageService } from './storageService';
import { realtimeService } from './realtimeService';
import { mockFunctionsService, realFunctionsService } from './functionsService';
import { mockApiService, realApiService } from './apiService';
import { mockLogsService, realLogsService } from './logsService';
import { mockMonitoringService, realMonitoringService } from './monitoringService';
import { observabilityService } from './observabilityService';
import { mockBackupService, realBackupService } from './backupService';
import { mockTeamService, realTeamService } from './teamService';
import { mockBillingService, realBillingService } from './billingService';
import { mockInfrastructureService, realInfrastructureService } from './infrastructureService';
import { developerPlatformService } from './developerPlatformService';
import { enterpriseService } from './enterpriseService';

const metaEnv = (import.meta as any).env;
const mode = metaEnv?.VITE_DATA_SOURCE || 'api';
export const projectService = mode === 'mock' ? mockProjectService : realProjectService;
export { databaseService };
export const authService = mode === 'mock' ? mockAuthService : realAuthService;
export const storageService = mode === 'mock' ? mockStorageService : realStorageService;
export { realtimeService };
export const functionsService = mode === 'mock' ? mockFunctionsService : realFunctionsService;
export const apiService = mode === 'mock' ? mockApiService : realApiService;
export const apisService = mode === 'mock' ? mockApiService : realApiService;
export const logsService = mode === 'mock' ? mockLogsService : realLogsService;
export const monitoringService = mode === 'mock' ? mockMonitoringService : realMonitoringService;
export { observabilityService };
export const backupService = mode === 'mock' ? mockBackupService : realBackupService;
export const backupsService = mode === 'mock' ? mockBackupService : realBackupService;
export const teamService = mode === 'mock' ? mockTeamService : realTeamService;
export const billingService = mode === 'mock' ? mockBillingService : realBillingService;
export const infrastructureService = mode === 'mock' ? mockInfrastructureService : realInfrastructureService;
export { developerPlatformService, enterpriseService };

export * from './projectService';
export * from './databaseService';
export * from './authService';
export * from './storageService';
export * from './realtimeService';
export * from './functionsService';
export * from './apiService';
export * from './logsService';
export * from './monitoringService';
export * from './observabilityService';
export * from './backupService';
export * from './teamService';
export * from './billingService';
export * from './infrastructureService';
export * from './developerPlatformService';

export * from './enterpriseService';
