export type SecurityRole = 'anonymous' | 'authenticated' | 'developer' | 'admin' | 'owner' | 'service' | string;
export type SecurityOperation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
export type SecurityResourceType = 'table' | 'storage';

export interface SecurityContext {
  userId?: string;
  role: SecurityRole;
  organizationId: string;
  projectId: string;
  environmentId: string;
  sessionId?: string;
  apiKeyType?: 'public' | 'secret' | 'service';
  claims?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  /** Only accepted for an explicit service-role operation. */
  bypassRls?: boolean;
}

export interface SecurityPolicy {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId: string;
  resourceType: SecurityResourceType;
  resource: string;
  operation: SecurityOperation | '*';
  name: string;
  condition: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type PolicyAst =
  | { type: 'literal'; value: boolean | string | number | null }
  | { type: 'reference'; scope: 'auth' | 'row' | 'new' | 'context'; key: string }
  | { type: 'comparison'; operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'starts_with'; left: PolicyAst; right: PolicyAst | PolicyAst[] }
  | { type: 'logical'; operator: 'and' | 'or'; left: PolicyAst; right: PolicyAst };

export interface CompiledPolicy {
  policyId: string;
  ast: PolicyAst;
  evaluate: (context: SecurityContext, row?: Record<string, any> | null, proposedRow?: Record<string, any> | null, path?: string) => boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  matchedPolicyIds: string[];
  bypassed?: boolean;
}

export interface SecurityPolicyInput {
  resourceType: SecurityResourceType;
  resource: string;
  operation: SecurityOperation | '*';
  name: string;
  condition: string;
  enabled?: boolean;
}
