import { db } from '../db/database';
import { authDatabase } from '../db/authDatabase';
import { ApiPermissionEngine } from '../apiEngine/permissionEngine';
import { SchemaIntrospectionService } from '../apiEngine/schemaIntrospection';
import { verifyJwt } from '../auth/jwt';
import { config } from '../config';
import { controlRepository } from '../db/controlRepository';
import { realAuthRepository } from '../auth/realAuthRepository';
import { RealtimeAuthorizationContext } from './types';

export interface AuthContext {
  valid: boolean;
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  sessionId?: string;
  role: string;
  claims?: Record<string, unknown>;
  apiKeyType?: 'public' | 'secret' | 'service';
  reason?: string;
}

/**
 * Authorization boundary shared by the WebSocket server and event dispatcher.
 * It deliberately does not encode row-level policy yet; Phase 8 can extend the
 * RealtimeAuthorizationContext without replacing the protocol.
 */
export class RealtimePermissionEngine {
  private static readonly PROTECTED_FIELDS = new Set([
    'password', 'password_hash', 'pass_hash', 'refresh_token', 'refresh_token_hash',
    'mfa_secret', 'recovery_code', 'recovery_codes', 'api_secret', 'service_secret',
    'secret_code', 'token', 'access_token', 'authorization', 'private_key', 'secret_key',
  ]);

  public static buildAuthorizationContext(context: AuthContext, requestId?: string): RealtimeAuthorizationContext {
    return {
      organizationId: context.organizationId,
      projectId: context.projectId,
      environmentId: context.environmentId,
      userId: context.userId,
      sessionId: context.sessionId,
      role: context.role,
      claims: context.claims,
      apiKeyType: context.apiKeyType,
      // A service API key is the explicit, privileged mechanism for a backend
      // consumer. It is the only Realtime credential allowed to bypass RLS.
      bypassRls: context.apiKeyType === 'service',
      requestId,
    };
  }

  public static isAnonymousRealtimeEnabled(projectId: string, environmentId: string): boolean {
    const environmentSetting = db.getSettings(projectId, environmentId)
      .find((setting) => setting.key === 'anonymousRealtimeEnabled');
    const projectSetting = db.getSettings(projectId)
      .find((setting) => setting.key === 'anonymousRealtimeEnabled');
    const value = environmentSetting || projectSetting;
    return value?.value.trim().toLowerCase() === 'true';
  }

  public static validateTokenOrKey(
    token?: string,
    apiKeyStr?: string,
    fallbackProjectId?: string,
    fallbackEnvId?: string,
  ): AuthContext {
    if (token) {
      try {
        const payload = verifyJwt(token.startsWith('Bearer ') ? token.slice(7) : token);
        if (!payload.project_id || !payload.environment_id || !this.hasActiveProjectEnvironment(payload.project_id, payload.environment_id)) {
          throw new Error('JWT project or environment is inactive.');
        }
        if (fallbackProjectId && fallbackProjectId !== payload.project_id) throw new Error('JWT project mismatch.');
        if (fallbackEnvId && fallbackEnvId !== payload.environment_id) throw new Error('JWT environment mismatch.');

        const user = authDatabase.findUserById(payload.sub);
        const session = authDatabase.findSessionById(payload.session_id);
        if (!user || user.status !== 'active' || user.project_id !== payload.project_id || user.environment_id !== payload.environment_id) {
          throw new Error('JWT user is inactive or out of scope.');
        }
        if (!session || session.user_id !== payload.sub || session.project_id !== payload.project_id || session.environment_id !== payload.environment_id) {
          throw new Error('JWT session is invalid or revoked.');
        }
        authDatabase.touchSession(session.id);
        const project = db.getProjectById(payload.project_id)!;
        return {
          valid: true,
          organizationId: project.organization_id,
          projectId: payload.project_id,
          environmentId: payload.environment_id,
          userId: payload.sub,
          sessionId: payload.session_id,
          role: payload.role === 'admin' ? 'admin' : 'authenticated',
          claims: Object.fromEntries(Object.entries(payload).filter(([key]) => !['sub', 'role', 'project_id', 'environment_id', 'session_id', 'iat', 'exp', 'iss', 'aud'].includes(key))),
        };
      } catch {
        // A provided but invalid JWT must not be accepted as anonymous.
        if (!apiKeyStr) return this.invalid('Invalid, expired, or revoked JWT.');
      }
    }

    if (apiKeyStr) {
      const key = db.findApiKeyByRawKey(apiKeyStr);
      if (!key || (key.expires_at && Date.parse(key.expires_at) <= Date.now())) return this.invalid('Invalid or expired API key.');

      const environmentId = key.environment_id || fallbackEnvId;
      if (!environmentId || !this.hasActiveProjectEnvironment(key.project_id, environmentId)) {
        return this.invalid('API key does not belong to an active project environment.');
      }
      if (fallbackProjectId && fallbackProjectId !== key.project_id) return this.invalid('API key project mismatch.');
      if (fallbackEnvId && fallbackEnvId !== environmentId) return this.invalid('API key environment mismatch.');

      const role = key.type === 'secret' ? 'service_role' : key.type === 'service' ? 'service' : 'anon';
      if (role === 'anon' && !this.isAnonymousRealtimeEnabled(key.project_id, environmentId)) {
        return this.invalid('Anonymous Realtime is disabled for this environment.');
      }
      const project = db.getProjectById(key.project_id)!;
      return { valid: true, organizationId: project.organization_id, projectId: key.project_id, environmentId, role, apiKeyType: key.type };
    }

    if (fallbackProjectId && fallbackEnvId && this.hasActiveProjectEnvironment(fallbackProjectId, fallbackEnvId)
      && this.isAnonymousRealtimeEnabled(fallbackProjectId, fallbackEnvId)) {
      return {
        valid: true,
        organizationId: db.getProjectById(fallbackProjectId)!.organization_id,
        projectId: fallbackProjectId,
        environmentId: fallbackEnvId,
        role: 'anon',
      };
    }

    return this.invalid('Authentication is required to use Realtime.');
  }

  /** Runtime authorization uses the persisted control/auth plane. The legacy
   * synchronous method above is retained exclusively for isolated test suites. */
  public static async validateTokenOrKeyAsync(
    token?: string,
    apiKeyStr?: string,
    fallbackProjectId?: string,
    fallbackEnvId?: string,
  ): Promise<AuthContext> {
    if (config.testMode) return this.validateTokenOrKey(token, apiKeyStr, fallbackProjectId, fallbackEnvId);

    const activeScope = async (projectId: string, environmentId: string) => {
      const [project, environment] = await Promise.all([
        controlRepository.getProject(projectId),
        controlRepository.getEnvironment(environmentId),
      ]);
      return !!project && project.status === 'active' && !!environment
        && environment.project_id === projectId && environment.status === 'active';
    };

    if (token) {
      try {
        const payload = verifyJwt(token.startsWith('Bearer ') ? token.slice(7) : token);
        if (!payload.project_id || !payload.environment_id || !await activeScope(payload.project_id, payload.environment_id)) throw new Error('JWT project or environment is inactive.');
        if (fallbackProjectId && fallbackProjectId !== payload.project_id) throw new Error('JWT project mismatch.');
        if (fallbackEnvId && fallbackEnvId !== payload.environment_id) throw new Error('JWT environment mismatch.');
        const [user, session, project] = await Promise.all([
          realAuthRepository.findUserById(payload.sub),
          realAuthRepository.findSession(payload.session_id),
          controlRepository.getProject(payload.project_id),
        ]);
        if (!user || user.status !== 'active' || user.project_id !== payload.project_id || user.environment_id !== payload.environment_id) throw new Error('JWT user is inactive or out of scope.');
        if (!session || session.user_id !== payload.sub || session.project_id !== payload.project_id || session.environment_id !== payload.environment_id || !project) throw new Error('JWT session is invalid or revoked.');
        await realAuthRepository.touchSession(session.id);
        return { valid: true, organizationId: project.organization_id, projectId: payload.project_id, environmentId: payload.environment_id, userId: payload.sub, sessionId: payload.session_id, role: payload.role === 'admin' ? 'admin' : 'authenticated', claims: Object.fromEntries(Object.entries(payload).filter(([key]) => !['sub', 'role', 'project_id', 'environment_id', 'session_id', 'iat', 'exp', 'iss', 'aud'].includes(key))) };
      } catch {
        if (!apiKeyStr) return this.invalid('Invalid, expired, or revoked JWT.');
      }
    }

    if (apiKeyStr) {
      const key = await controlRepository.findApiKeyByRawKey(apiKeyStr);
      if (!key) return this.invalid('Invalid or expired API key.');
      const environmentId = key.environment_id || fallbackEnvId;
      if (!environmentId || !await activeScope(key.project_id, environmentId)) return this.invalid('API key does not belong to an active project environment.');
      if (fallbackProjectId && fallbackProjectId !== key.project_id) return this.invalid('API key project mismatch.');
      if (fallbackEnvId && fallbackEnvId !== environmentId) return this.invalid('API key environment mismatch.');
      const project = await controlRepository.getProject(key.project_id);
      if (!project) return this.invalid('API key project is unavailable.');
      if (key.type === 'public') return this.invalid('Anonymous Realtime is disabled unless an explicit policy is configured.');
      return { valid: true, organizationId: project.organization_id, projectId: key.project_id, environmentId, role: key.type === 'service' ? 'service' : 'service_role', apiKeyType: key.type };
    }
    return this.invalid('Authentication is required to use Realtime.');
  }

  public static canConnect(context: AuthContext): { allowed: boolean; reason?: string } {
    if (!config.testMode) return context.valid && context.role !== 'anon'
      ? { allowed: true }
      : { allowed: false, reason: context.reason || 'Authentication is required to use Realtime.' };
    if (!context.valid || !this.hasActiveProjectEnvironment(context.projectId, context.environmentId)) {
      return { allowed: false, reason: 'Invalid Realtime context.' };
    }
    if (context.role === 'anon' && !this.isAnonymousRealtimeEnabled(context.projectId, context.environmentId)) {
      return { allowed: false, reason: 'Anonymous Realtime is disabled.' };
    }
    return { allowed: true };
  }

  public static canSubscribe(
    projectId: string,
    environmentId: string,
    schema: string,
    table: string,
    role: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    organizationId?: string,
  ): { allowed: boolean; reason?: string } {
    const tableName = table.toLowerCase();
    const schemaName = schema.toLowerCase();
    if (!['INSERT', 'UPDATE', 'DELETE', '*'].includes(event)) return { allowed: false, reason: 'Invalid database event.' };
    if (['auth', 'system', 'information_schema', 'pg_catalog', 'storage'].includes(schemaName)) {
      return { allowed: false, reason: `Subscription to protected schema '${schema}' is forbidden.` };
    }
    if (tableName.startsWith('auth_') || ['users_secrets', 'api_keys', 'audit_logs'].includes(tableName)) {
      return { allowed: false, reason: `Subscription to protected table '${table}' is forbidden.` };
    }
    if (!config.testMode) {
      return role === 'anon'
        ? { allowed: false, reason: 'Anonymous Realtime is disabled unless an explicit policy is configured.' }
        : { allowed: true };
    }
    if (organizationId) {
      const resource = SchemaIntrospectionService.getResource(organizationId, projectId, environmentId, tableName);
      if (!resource || resource.schema.toLowerCase() !== schemaName) {
        return { allowed: false, reason: `Table '${table}' is not exposed for Realtime.` };
      }
    }
    const callerRole = (role === 'service_role' ? 'service' : role) as 'anonymous' | 'authenticated' | 'service' | 'admin';
    const permission = ApiPermissionEngine.canExecute(projectId, environmentId, tableName, callerRole, event === '*' ? 'READ' : event);
    return permission.allowed ? { allowed: true } : { allowed: false, reason: permission.reason || 'Subscription is not permitted.' };
  }

  public static canReceive(context: RealtimeAuthorizationContext, schema: string, table: string, event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'): { allowed: boolean; reason?: string } {
    return this.canSubscribe(context.projectId, context.environmentId, schema, table, context.role, event, context.organizationId);
  }

  public static canBroadcast(context: RealtimeAuthorizationContext, channel: string): { allowed: boolean; reason?: string } {
    if (!this.isValidChannel(channel)) return { allowed: false, reason: 'Invalid channel name.' };
    return context.role === 'anon' ? { allowed: false, reason: 'Broadcast requires an authenticated credential.' } : { allowed: true };
  }

  public static canPresence(context: RealtimeAuthorizationContext, channel: string): { allowed: boolean; reason?: string } {
    if (!this.isValidChannel(channel)) return { allowed: false, reason: 'Invalid channel name.' };
    return context.role === 'anon' ? { allowed: false, reason: 'Presence requires an authenticated credential.' } : { allowed: true };
  }

  public static isValidChannel(channel: string): boolean {
    return typeof channel === 'string' && channel.length > 0 && channel.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(channel);
  }

  public static sanitizeRecord(record: Record<string, any> | null): Record<string, any> | null {
    if (!record) return null;
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
      const normalized = key.toLowerCase();
      if (this.PROTECTED_FIELDS.has(normalized) || /(?:^|_)(?:password|secret|token|recovery_code)(?:_|$)/.test(normalized)) continue;
      sanitized[key] = Array.isArray(value)
        ? value.map((item) => item && typeof item === 'object' ? this.sanitizeRecord(item) : item)
        : value && typeof value === 'object' ? this.sanitizeRecord(value) : value;
    }
    return sanitized;
  }

  private static hasActiveProjectEnvironment(projectId: string, environmentId: string): boolean {
    const project = db.getProjectById(projectId);
    return !!project && project.status === 'active' && db.getEnvironmentsByProject(projectId)
      .some((environment) => environment.id === environmentId && environment.status === 'active');
  }

  private static invalid(reason: string): AuthContext {
    return { valid: false, organizationId: '', projectId: '', environmentId: '', role: 'anon', reason };
  }
}
