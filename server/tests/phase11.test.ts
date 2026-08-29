import assert from 'node:assert/strict';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { infrastructureEngine } from '../infrastructure/infrastructureEngine';
import { InfrastructureContext } from '../infrastructure/types';
import { infrastructureRouter } from '../routes/infrastructure';

const context: InfrastructureContext = { organizationId: 'org_core_1', projectId: 'proj_ecommerce_1', environmentId: 'env_proj_ecommerce_1_production', userId: 'usr_owner_1', role: 'owner' };
function expect(value: unknown, message: string): asserts value { assert.ok(value, `TEST FAILED (Phase 11): ${message}`); }

export async function runPhase11Tests() {
  console.log('Starting Phase 11 infrastructure engine tests...\n');
  infrastructureEngine.start();
  const regions = infrastructureEngine.regions.list();
  expect(regions.length >= 6 && regions.every((region) => region.zones.length >= 3), 'Region manager must provide multi-region availability zones');
  const placement = infrastructureEngine.regions.setPlacement(context, { primaryRegion: 'sa-east-1', secondaryRegion: 'us-east-1', disasterRecoveryRegion: 'eu-west-1' });
  expect(placement.primaryRegion === 'sa-east-1' && placement.secondaryRegion === 'us-east-1', 'Project placement must retain primary and secondary regions');
  expect(infrastructureEngine.cluster.summary().healthy >= 4, 'Cluster manager must expose healthy logical nodes');
  console.log('Test 1: multi-region placement, zones and cluster nodes.');

  infrastructureEngine.loadBalancer.setStrategy('round_robin');
  const first = infrastructureEngine.loadBalancer.select('api');
  const second = infrastructureEngine.loadBalancer.select('api');
  expect(first.id !== second.id, 'Round-robin load balancing must rotate through API instances');
  infrastructureEngine.cache.set('schemas', 'products', { columns: 4 }, 5_000);
  expect(infrastructureEngine.cache.get<{ columns: number }>('schemas', 'products')?.columns === 4, 'Cache manager must return cached values');
  expect(infrastructureEngine.cache.invalidate('schemas', 'products') === 1 && infrastructureEngine.cache.get('schemas', 'products') === undefined, 'Cache invalidation must remove scoped keys');
  console.log('Test 2: load balancing and distributed-cache foundation.');

  const firstDeployment = await infrastructureEngine.deploy(context, { service: 'api', version: 'v11.0.0', strategy: 'rolling', provider: 'docker' });
  const secondDeployment = await infrastructureEngine.deploy(context, { service: 'api', version: 'v11.1.0', strategy: 'canary', canaryPercent: 10, provider: 'kubernetes' });
  const rollback = await infrastructureEngine.rollback(context, secondDeployment.id);
  expect(firstDeployment.status === 'completed' && infrastructureEngine.deployments.list(context).some((item) => item.id === secondDeployment.id && item.status === 'rolled_back') && rollback.version === 'v11.0.0', 'Deployment history must support rolling/canary deployments and rollback');
  console.log('Test 3: provider-agnostic deployment and rollback.');

  const replicasBefore = infrastructureEngine.services.list('functions').length;
  const scaling = infrastructureEngine.evaluateScaling(context, 'functions', { cpuUsage: 96, memoryUsage: 91, activeConnections: 4_000, queueDepth: 300, requestsPerSecond: 1_000 });
  expect(scaling.desiredReplicas > replicasBefore && scaling.applied && infrastructureEngine.services.list('functions').length > replicasBefore, 'Autoscaler must add logical capacity when thresholds are exceeded');
  const replication = infrastructureEngine.configureReplication(context, { resource: 'storage', sourceRegion: 'sa-east-1', targetRegions: ['us-east-1', 'eu-west-1'], mode: 'async' });
  expect(replication.status === 'healthy' && replication.lastReplicatedAt, 'Replication must complete and track its lag state');
  const queued = infrastructureEngine.scheduler.enqueue({ service: 'functions', payload: { task: 'image-resize' }, priority: 10, regionAffinity: 'sa-east-1', maxAttempts: 3 });
  const assigned = infrastructureEngine.scheduler.dispatch();
  expect(assigned?.id === queued.id && assigned.status === 'assigned' && assigned.assignedNodeId, 'Scheduler must assign prioritized work to a healthy node');
  console.log('Test 4: autoscaling, replication, and distributed scheduling.');

  const node = infrastructureEngine.nodes.list('sa-east-1')[0];
  const nodeFailover = infrastructureEngine.failNode(context, node.id, 'phase11 health simulation');
  expect(nodeFailover.status === 'completed' && nodeFailover.target !== node.id, 'Node failure must select a same-region replica target');
  const regionFailover = infrastructureEngine.failRegion(context, 'sa-east-1', 'phase11 region simulation');
  expect(regionFailover.target === 'us-east-1', 'Region failover must route the project to its configured secondary region');
  expect(infrastructureEngine.health.check().status !== 'unhealthy', 'Remaining replicas must keep the logical platform available');
  console.log('Test 5: node/region failover and health-aware disaster routing.');

  const app = express(); app.use(express.json()); app.use(infrastructureRouter);
  const server = await new Promise<import('node:http').Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const address = server.address() as import('node:net').AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const [overview, nodes, scalingResponse, health] = await Promise.all(['/overview', '/nodes', '/scaling', '/health'].map(async (path) => { const response = await fetch(`${base}/api/infrastructure${path}`); expect(response.ok, `Infrastructure API ${path} must respond`); return response.json(); }));
    expect(overview.cluster && Array.isArray(nodes) && Array.isArray(scalingResponse.policies) && health.status, 'Infrastructure API must expose control-plane resources');
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  console.log('Test 6: /api/infrastructure control-plane endpoints.');
  console.log('All Phase 11 infrastructure engine tests passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runPhase11Tests().catch((error) => { console.error(error); process.exitCode = 1; });
