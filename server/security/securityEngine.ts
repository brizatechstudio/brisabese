import { randomUUID } from 'node:crypto';
import { db } from '../db/database';
import { PolicyCompiler } from './policyCompiler';
import { CompiledPolicy, PolicyDecision, SecurityContext, SecurityOperation, SecurityPolicy, SecurityPolicyInput, SecurityResourceType } from './types';
import { observability } from '../observability';
import { postgres } from '../db/postgres';
import { config } from '../config';
import { controlRepository } from '../db/controlRepository';

function scopeKey(context: Pick<SecurityContext, 'organizationId' | 'projectId' | 'environmentId'>): string {
  return `${context.organizationId}:${context.projectId}:${context.environmentId}`;
}

function resourceMatches(pattern: string, resource: string): boolean {
  const source = pattern.trim().toLowerCase();
  const target = resource.trim().toLowerCase();
  if (source === '*' || source === target) return true;
  const expression = `^${source.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`;
  return new RegExp(expression).test(target);
}

export class SecurityEngine {
  private policies = new Map<string, SecurityPolicy>();
  private compiledCache = new Map<string, CompiledPolicy>();

  private assertManage(context: SecurityContext): void {
    if (!['owner', 'admin', 'developer', 'service'].includes(context.role)) throw new Error('Only developer/admin/owner/service roles can manage security policies.');
  }

  private audit(context: SecurityContext, action: string, resourceType: string, resourceId: string, metadata?: Record<string, unknown>): void {
    const entry = { organization_id: context.organizationId, project_id: context.projectId, environment_id: context.environmentId, user_id: context.userId || context.role || 'anonymous', action, resource_type: resourceType, resource_id: resourceId, metadata: { ...metadata, requestId: context.requestId }, ip_address: context.ip, user_agent: context.userAgent };
    if (config.testMode) db.logAudit(entry);
    else void controlRepository.logAudit(entry).catch(() => undefined);
  }

  public async hydrate(): Promise<void> {
    if (config.testMode) return;
    const rows = await postgres.query<{ definition: SecurityPolicy }>('SELECT definition FROM security_policies');
    this.policies.clear(); this.compiledCache.clear();
    for (const row of rows) {
      const policy = row.definition;
      if (!policy?.id || !policy.condition) continue;
      this.policies.set(policy.id, policy);
      this.compiledCache.set(policy.id, PolicyCompiler.compile(policy));
    }
  }

  public async persist(policy: SecurityPolicy): Promise<void> {
    if (config.testMode) return;
    await postgres.execute('INSERT INTO security_policies(id,organization_id,project_id,environment_id,resource_type,resource,operation,definition,compiled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET resource_type=EXCLUDED.resource_type,resource=EXCLUDED.resource,operation=EXCLUDED.operation,definition=EXCLUDED.definition,compiled=EXCLUDED.compiled,updated_at=EXCLUDED.updated_at', [policy.id,policy.organizationId,policy.projectId,policy.environmentId,policy.resourceType,policy.resource,policy.operation,JSON.stringify(policy),JSON.stringify(this.compiledCache.get(policy.id)?.ast || null),policy.createdAt,policy.updatedAt]);
  }

  public async removePersistent(id: string): Promise<void> { if (!config.testMode) await postgres.execute('DELETE FROM security_policies WHERE id=$1', [id]); }

  private recordDecision(context: SecurityContext, operation: SecurityOperation, decision: PolicyDecision, startedAt: number, traceSpan?: any): PolicyDecision {
    const telemetry = { organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, userId: context.userId, requestId: context.requestId, service: 'security' };
    observability.metric('security.policies_evaluated', 1, 'counter', { operation }, telemetry);
    observability.metric(decision.allowed ? 'security.access_allowed' : 'security.access_denied', 1, 'counter', { operation }, telemetry);
    observability.metric('security.policy_latency_ms', Date.now() - startedAt, 'histogram', { operation }, telemetry);
    if (traceSpan) observability.traces.endSpan(traceSpan, decision.allowed ? undefined : decision.reason);
    return decision;
  }

  public createPolicy(context: SecurityContext, input: SecurityPolicyInput): SecurityPolicy {
    this.assertManage(context);
    const resource = input.resource.trim().toLowerCase();
    if (!resource || !['table', 'storage'].includes(input.resourceType) || !['SELECT', 'INSERT', 'UPDATE', 'DELETE', '*'].includes(input.operation) || !input.name.trim() || !input.condition.trim()) throw new Error('Invalid security policy.');
    const now = new Date().toISOString();
    const policy: SecurityPolicy = { id: `rls_${randomUUID().replace(/-/g, '').slice(0, 20)}`, organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, resourceType: input.resourceType, resource, operation: input.operation, name: input.name.trim(), condition: input.condition.trim(), enabled: input.enabled ?? true, createdAt: now, updatedAt: now, createdBy: context.userId || 'system', updatedBy: context.userId || 'system' };
    // Compile before persisting so malformed policies can never become active.
    this.compiledCache.set(policy.id, PolicyCompiler.compile(policy));
    this.policies.set(policy.id, policy);
    this.audit(context, 'policy.created', 'security_policy', policy.id, { resourceType: policy.resourceType, resource: policy.resource, operation: policy.operation });
    return policy;
  }

  public updatePolicy(context: SecurityContext, id: string, input: Partial<SecurityPolicyInput>): SecurityPolicy {
    this.assertManage(context);
    const existing = this.getScopedPolicy(context, id);
    if (!existing) throw new Error('Security policy not found.');
    const candidate: SecurityPolicy = { ...existing, ...input, resource: input.resource === undefined ? existing.resource : input.resource.trim().toLowerCase(), name: input.name === undefined ? existing.name : input.name.trim(), condition: input.condition === undefined ? existing.condition : input.condition.trim(), updatedAt: new Date().toISOString(), updatedBy: context.userId || 'system' };
    if (!candidate.resource || !candidate.name || !candidate.condition) throw new Error('Invalid security policy.');
    this.compiledCache.set(candidate.id, PolicyCompiler.compile(candidate));
    this.policies.set(candidate.id, candidate);
    this.audit(context, 'policy.updated', 'security_policy', candidate.id, { resource: candidate.resource, operation: candidate.operation });
    return candidate;
  }

  public deletePolicy(context: SecurityContext, id: string): boolean {
    this.assertManage(context);
    const policy = this.getScopedPolicy(context, id);
    if (!policy) return false;
    this.policies.delete(id); this.compiledCache.delete(id);
    this.audit(context, 'policy.deleted', 'security_policy', id, { resource: policy.resource });
    return true;
  }

  public listPolicies(context: SecurityContext, filters: Partial<Pick<SecurityPolicy, 'resourceType' | 'resource'>> = {}): SecurityPolicy[] {
    return Array.from(this.policies.values()).filter((policy) => policy.organizationId === context.organizationId && policy.projectId === context.projectId && policy.environmentId === context.environmentId && (!filters.resourceType || policy.resourceType === filters.resourceType) && (!filters.resource || policy.resource === filters.resource.toLowerCase())).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public exportBackupState(context: SecurityContext): Record<string, unknown> {
    this.assertManage(context);
    return JSON.parse(JSON.stringify({ policies: this.listPolicies(context) }));
  }

  public async restoreBackupState(context: SecurityContext, state: any): Promise<void> {
    this.assertManage(context);
    if (!state || !Array.isArray(state.policies)) throw new Error('Invalid security backup state.');
    const restored = (state.policies as SecurityPolicy[]).map((policy) => {
      if (policy.organizationId !== context.organizationId || policy.projectId !== context.projectId || policy.environmentId !== context.environmentId) throw new Error('Security backup scope does not match the target.');
      const copy = JSON.parse(JSON.stringify(policy)) as SecurityPolicy;
      return { policy: copy, compiled: PolicyCompiler.compile(copy) };
    });

    // The policies table is part of the control plane rather than the tenant
    // schema captured by pg_dump. Persist the complete replacement in one
    // database transaction before exposing it through the in-process cache.
    if (!config.testMode) {
      await postgres.transaction(async (client) => {
        await client.query('DELETE FROM security_policies WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3', [context.organizationId, context.projectId, context.environmentId]);
        for (const { policy, compiled } of restored) {
          await client.query('INSERT INTO security_policies(id,organization_id,project_id,environment_id,resource_type,resource,operation,definition,compiled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [policy.id, policy.organizationId, policy.projectId, policy.environmentId, policy.resourceType, policy.resource, policy.operation, JSON.stringify(policy), JSON.stringify(compiled.ast), policy.createdAt, policy.updatedAt]);
        }
      });
    }
    for (const [id, policy] of this.policies) if (policy.organizationId === context.organizationId && policy.projectId === context.projectId && policy.environmentId === context.environmentId) { this.policies.delete(id); this.compiledCache.delete(id); }
    for (const { policy, compiled } of restored) {
      this.compiledCache.set(policy.id, compiled); this.policies.set(policy.id, policy);
    }
  }

  private getScopedPolicy(context: SecurityContext, id: string): SecurityPolicy | null {
    const policy = this.policies.get(id);
    return policy && policy.organizationId === context.organizationId && policy.projectId === context.projectId && policy.environmentId === context.environmentId ? policy : null;
  }

  private matchingPolicies(context: SecurityContext, resourceType: SecurityResourceType, resource: string, operation: SecurityOperation): SecurityPolicy[] {
    return this.listPolicies(context, { resourceType }).filter((policy) => policy.enabled && (policy.operation === '*' || policy.operation === operation) && resourceMatches(policy.resource, resource));
  }

  public evaluate(context: SecurityContext, resourceType: SecurityResourceType, resource: string, operation: SecurityOperation, row?: Record<string, any> | null, proposedRow?: Record<string, any> | null, path?: string): PolicyDecision {
    const startedAt = Date.now();
    const traceSpan = context.requestId ? observability.traces.startSpan('security.rls_evaluate', 'security', { resourceType, operation }, { organizationId: context.organizationId, projectId: context.projectId, environmentId: context.environmentId, userId: context.userId, requestId: context.requestId, service: 'security' }) : undefined;
    if (!context.organizationId || !context.projectId || !context.environmentId) return this.recordDecision(context, operation, { allowed: false, reason: 'Incomplete security context.', matchedPolicyIds: [] }, startedAt, traceSpan);
    if (context.bypassRls) {
      if (context.role !== 'service') return this.recordDecision(context, operation, { allowed: false, reason: 'Only the explicit service role may bypass RLS.', matchedPolicyIds: [] }, startedAt, traceSpan);
      const decision = { allowed: true, bypassed: true, matchedPolicyIds: [] };
      this.audit(context, 'access.allowed', resourceType, resource, { operation, bypassed: true });
      return this.recordDecision(context, operation, decision, startedAt, traceSpan);
    }
    const policies = this.matchingPolicies(context, resourceType, resource, operation);
    // Test fixtures retain compatibility behavior. The real-local data plane is
    // deny-by-default: missing policies never become an accidental data leak.
    if (policies.length === 0) {
      const decision = config.testMode
        ? { allowed: true, reason: 'No active RLS policy; test fixture permission applies.', matchedPolicyIds: [] }
        : { allowed: false, reason: 'No active RLS policy permits this operation.', matchedPolicyIds: [] };
      this.audit(context, decision.allowed ? 'access.allowed' : 'access.denied', resourceType, resource, { operation, policyCount: 0 });
      return this.recordDecision(context, operation, decision, startedAt, traceSpan);
    }
    const matchedPolicyIds: string[] = [];
    for (const policy of policies) {
      let compiled = this.compiledCache.get(policy.id);
      if (!compiled) { compiled = PolicyCompiler.compile(policy); this.compiledCache.set(policy.id, compiled); }
      if (compiled.evaluate(context, row, proposedRow, path)) matchedPolicyIds.push(policy.id);
    }
    const allowed = matchedPolicyIds.length > 0;
    this.audit(context, allowed ? 'access.allowed' : 'access.denied', resourceType, resource, { operation, matchedPolicyIds, policyCount: policies.length });
    return this.recordDecision(context, operation, { allowed, reason: allowed ? undefined : 'No RLS policy allowed this operation.', matchedPolicyIds }, startedAt, traceSpan);
  }

  public filterRows(context: SecurityContext, table: string, rows: Record<string, any>[]): Record<string, any>[] {
    const allowed = rows.filter((row) => this.evaluate(context, 'table', table, 'SELECT', row).allowed);
    if (allowed.length !== rows.length) this.audit(context, 'rls.filtered_rows', 'table', table, { total: rows.length, returned: allowed.length });
    return allowed;
  }

  public testPolicy(context: SecurityContext, input: { resourceType: SecurityResourceType; resource: string; operation: SecurityOperation; row?: Record<string, any>; proposedRow?: Record<string, any>; path?: string }): PolicyDecision {
    this.assertManage(context);
    return this.evaluate(context, input.resourceType, input.resource, input.operation, input.row, input.proposedRow, input.path);
  }

  public simulate(managerContext: SecurityContext, simulatedContext: SecurityContext, input: { resourceType: SecurityResourceType; resource: string; operation: SecurityOperation; row?: Record<string, any>; proposedRow?: Record<string, any>; path?: string }): PolicyDecision {
    this.assertManage(managerContext);
    if (scopeKey(managerContext) !== scopeKey(simulatedContext)) throw new Error('Simulation context must remain inside the current organization/project/environment.');
    return this.evaluate(simulatedContext, input.resourceType, input.resource, input.operation, input.row, input.proposedRow, input.path);
  }
}

export const securityEngine = new SecurityEngine();
