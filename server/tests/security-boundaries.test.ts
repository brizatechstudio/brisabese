import assert from 'node:assert/strict';
import type { NextFunction, Response } from 'express';
import { controlPlaneAuthorizationMiddleware, roleAllows, type AuthenticatedRequest } from '../middleware/auth';
import { controlRepository } from '../db/controlRepository';
import { ApiGateway, type ApiGatewayRequest } from '../apiEngine/apiGateway';
import { db } from '../db/database';
import { classifyFunctionRoute } from '../functions/routePlane';
import { redisClient } from '../redis';
import { storageGateway } from '../routes/realStorage';

type Captured = { statusCode: number; body?: unknown; nextCalled: boolean };

async function invoke(request: Partial<AuthenticatedRequest>): Promise<Captured> {
  const captured: Captured = { statusCode: 200, nextCalled: false };
  const response = {
    status(code: number) { captured.statusCode = code; return this; },
    json(body: unknown) { captured.body = body; return this; },
  } as unknown as Response;
  const next = (() => { captured.nextCalled = true; }) as NextFunction;
  await controlPlaneAuthorizationMiddleware({ method: 'GET', path: '/', headers: {}, ...request } as AuthenticatedRequest, response, next);
  return captured;
}

async function invokeDataPlane(headers: Record<string, string>): Promise<Captured> {
  const captured: Captured = { statusCode: 200, nextCalled: false };
  const response = {
    setHeader() { return this; },
    status(code: number) { captured.statusCode = code; return this; },
    json(body: unknown) { captured.body = body; return this; },
  } as unknown as Response;
  const next = (() => { captured.nextCalled = true; }) as NextFunction;
  await ApiGateway.gatewayMiddleware({ headers, ip: '127.0.0.1' } as ApiGatewayRequest, response, next);
  return captured;
}


async function invokeStorage(headers: Record<string, string>): Promise<Captured> {
  const captured: Captured = { statusCode: 200, nextCalled: false };
  const response = {
    setHeader() { return this; },
    status(code: number) { captured.statusCode = code; return this; },
    json(body: unknown) { captured.body = body; return this; },
  } as unknown as Response;
  const next = (() => { captured.nextCalled = true; }) as NextFunction;
  await storageGateway({ headers, ip: '127.0.0.1', path: '/storage/v1/bucket' } as any, response, next);
  return captured;
}

async function main(): Promise<void> {
  assert.equal(roleAllows('owner', 'admin'), true);
  assert.equal(roleAllows('admin', 'billing'), true);
  assert.equal(roleAllows('developer', 'write'), true);
  assert.equal(roleAllows('developer', 'admin'), false);
  assert.equal(roleAllows('viewer', 'write'), false);
  assert.equal(roleAllows('authenticated', 'read'), false);
  assert.equal(classifyFunctionRoute('/api/functions'), 'management');
  assert.equal(classifyFunctionRoute('/api/functions/fn_1?environment=env_1'), 'management');
  assert.equal(classifyFunctionRoute('/functions/v1/public-handler'), 'invocation');
  assert.equal(classifyFunctionRoute('/api/projects'), 'unknown');

  const apiKey = await invoke({ path: '/api/projects', authKind: 'api_key', user: { id: 'api_key:key_a', email: '', name: 'public', role: 'authenticated' } });
  assert.equal(apiKey.statusCode, 403, 'Data-plane API keys must be rejected by the control plane.');
  assert.equal(apiKey.nextCalled, false);

  const endUser = await invoke({ path: '/api/projects', authKind: 'end_user', user: { id: 'auth_user_a', email: 'a@example.test', name: 'A', role: 'authenticated' } });
  assert.equal(endUser.statusCode, 403, 'End-user JWTs must be rejected by the control plane.');
  assert.equal(endUser.nextCalled, false);

  const missingScope = await invoke({ path: '/api/database/overview', authKind: 'admin', user: { id: 'admin_a', email: 'admin@example.test', name: 'Admin', role: 'owner' } });
  assert.equal(missingScope.statusCode, 403, 'Project control-plane routes must require both project and environment scope.');
  assert.equal(missingScope.nextCalled, false);

  const originalGetProject = controlRepository.getProject;
  controlRepository.getProject = async () => ({ id: 'project_a', organization_id: 'organization_a' } as any);
  try {
    const conflictingScopes = await invoke({
      path: '/api/organizations/organization_b',
      headers: { 'x-organization-id': 'organization_a', 'x-project-id': 'project_a' },
      authKind: 'admin',
      user: { id: 'admin_a', email: 'admin@example.test', name: 'Admin', role: 'owner' },
    });
    assert.equal(conflictingScopes.statusCode, 403, 'A project header must never override a different organization in the route path.');
    assert.equal(conflictingScopes.nextCalled, false);
  } finally {
    controlRepository.getProject = originalGetProject;
  }

  const sourceProjectId = 'proj_ecommerce_1';
  const targetProjectId = 'proj_mobile_saas';
  const sourceEnvironment = db.getEnvironmentsByProject(sourceProjectId).find((environment) => environment.type === 'production');
  const targetEnvironment = db.getEnvironmentsByProject(targetProjectId).find((environment) => environment.type === 'production');
  assert.ok(sourceEnvironment && targetEnvironment, 'The isolated fixture must include production environments for both projects.');
  const serviceKey = db.createApiKey(sourceProjectId, { name: 'scope-regression', type: 'service', environment_id: sourceEnvironment.id });
  const apiKeyScopeMismatch = await invokeDataPlane({
    apikey: serviceKey.fullSecretKey,
    'x-project-id': targetProjectId,
    'x-environment-id': targetEnvironment.id,
  });
  assert.equal(apiKeyScopeMismatch.statusCode, 401, 'A data-plane API key must not be reusable with another project or environment header.');
  assert.equal(apiKeyScopeMismatch.nextCalled, false);

  const originalIncrement = redisClient.increment;
  const observedRateKeys: string[] = [];
  (redisClient as any).increment = async (key: string) => { observedRateKeys.push(key); return 1; };
  try {
    await invokeDataPlane({ 'x-project-id': 'attacker_rotated_project_a', 'x-environment-id': 'attacker_env_a' });
    await invokeDataPlane({ 'x-project-id': 'attacker_rotated_project_b', 'x-environment-id': 'attacker_env_b' });
    const preAuthKeys = observedRateKeys.filter((key) => key.startsWith('rate:api:preauth:'));
    assert.equal(preAuthKeys.length, 2, 'Each request must hit the pre-authentication limiter.');
    assert.equal(preAuthKeys[0], preAuthKeys[1], 'Unvalidated x-project-id values must not change the pre-authentication rate-limit key.');
  } finally {
    (redisClient as any).increment = originalIncrement;
  }

  const storageRateKeys: string[] = [];
  (redisClient as any).increment = async (key: string) => { storageRateKeys.push(key); return 1; };
  try {
    await invokeStorage({ 'x-project-id': 'attacker_rotated_project_a', 'x-environment-id': 'attacker_env_a' });
    await invokeStorage({ 'x-project-id': 'attacker_rotated_project_b', 'x-environment-id': 'attacker_env_b' });
    const storagePreAuthKeys = storageRateKeys.filter((key) => key.startsWith('rate:storage:preauth:'));
    assert.equal(storagePreAuthKeys.length, 2, 'Each Storage request must hit the pre-authentication limiter.');
    assert.equal(storagePreAuthKeys[0], storagePreAuthKeys[1], 'Storage pre-authentication limiting must ignore unvalidated tenant headers.');
  } finally {
    (redisClient as any).increment = originalIncrement;
  }

  console.log('Security boundary tests passed: data-plane credentials cannot enter the control plane and scoped routes fail closed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
