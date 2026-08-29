/**
 * Release guard for the Admin UI service boundary.
 *
 * The application is allowed to instantiate fixtures only when the build mode
 * explicitly says `VITE_DATA_SOURCE=mock`.  In the normal API mode every
 * exported service must be the real adapter and a failed request must reject
 * instead of returning fixture data.
 */
import { strict as assert } from 'node:assert';

const originalFetch = globalThis.fetch;

async function expectReject(name: string, operation: () => Promise<unknown>): Promise<void> {
  await assert.rejects(operation, Error, `${name} must surface an API error in API mode.`);
}

async function main(): Promise<void> {
  // `import.meta.env` is absent under tsx, which is intentionally the same
  // default as the frontend: API mode.  Keep this assertion explicit so an
  // accidental default-to-mock change is caught here.
  (globalThis as any).fetch = async () => { throw new Error('strict real mode network failure'); };
  (globalThis as any).window = { localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } };

  const services = await import('../../src/services/index');
  const api = await import('../../src/services/apiService');
  const auth = await import('../../src/services/authService');
  const functions = await import('../../src/services/functionsService');
  const storage = await import('../../src/services/storageService');
  const billing = await import('../../src/services/billingService');
  const infrastructure = await import('../../src/services/infrastructureService');
  const database = await import('../../src/services/databaseService');
  const realtime = await import('../../src/services/realtimeService');
  const monitoring = await import('../../src/services/monitoringService');
  const logs = await import('../../src/services/logsService');
  const team = await import('../../src/services/teamService');
  const project = await import('../../src/services/projectService');
  const observability = await import('../../src/services/observabilityService');

  assert.equal(services.apiService, api.realApiService, 'RealApiService must be selected in API mode.');
  assert.equal(services.authService, auth.realAuthService, 'RealAuthService must be selected in API mode.');
  assert.equal(services.functionsService, functions.realFunctionsService, 'ApiFunctionsService must be selected in API mode.');
  assert.equal(services.storageService, storage.realStorageService, 'ApiStorageService must be selected in API mode.');
  assert.equal(services.billingService, billing.realBillingService, 'RealBillingService must be selected in API mode.');
  assert.equal(services.infrastructureService, infrastructure.realInfrastructureService, 'RealInfrastructureService must be selected in API mode.');
  assert.equal(services.databaseService, database.realDatabaseService, 'DatabaseServiceAdapter must be real in API mode.');
  assert.equal(services.realtimeService, realtime.realRealtimeService, 'RealtimeServiceAdapter must be real in API mode.');
  assert.equal(services.monitoringService, monitoring.realMonitoringService, 'MonitoringService must be real in API mode.');
  assert.equal(services.logsService, logs.realLogsService, 'LogsService must be real in API mode.');
  assert.equal(services.teamService, team.realTeamService, 'TeamService must be real in API mode.');
  assert.equal(services.projectService, project.realProjectService, 'ProjectService must be real in API mode.');
  assert.equal(services.observabilityService, observability.realObservabilityService, 'ObservabilityService must be real in API mode.');

  await expectReject('RealApiService', () => api.realApiService.listEndpoints());
  await expectReject('RealAuthService', () => auth.realAuthService.listUsers());
  await expectReject('ApiFunctionsService', () => functions.realFunctionsService.listFunctions());
  await expectReject('ApiStorageService', () => storage.realStorageService.listBuckets());
  await expectReject('RealBillingService', () => billing.realBillingService.getPlans());
  await expectReject('RealInfrastructureService', () => infrastructure.realInfrastructureService.overview());
  await expectReject('DatabaseServiceAdapter', () => database.databaseService.getOverview());
  await expectReject('RealtimeServiceAdapter', () => realtime.realtimeService.getMetrics());
  await expectReject('MonitoringService', () => monitoring.realMonitoringService.getCurrentMetrics());
  await expectReject('LogsService', () => logs.realLogsService.listLogs());
  await expectReject('TeamService', () => team.realTeamService.listMembers());
  await expectReject('ProjectService', () => project.realProjectService.listProjects());
  await expectReject('ObservabilityService', () => observability.realObservabilityService.overview());

  console.log('Strict real mode contract passed: API mode selects only real services and propagates failures.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => { (globalThis as any).fetch = originalFetch; });
