import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import { verifyJwt } from '../auth/jwt';
import { authDatabase } from '../db/authDatabase';
import { config } from '../config';
import { controlRepository } from '../db/controlRepository';
import { realAuthRepository } from '../auth/realAuthRepository';
import { adminAuthRepository, AdminUser, AdminSession } from '../auth/adminAuthRepository';
import { enterpriseEngine, cidrContains } from '../enterprise/enterpriseEngine';
import { localBillingEngine } from '../billing/localBillingEngine';

export const CONTROL_PLANE_PROJECT = '__brisabase_control_plane__';
export const CONTROL_PLANE_ENVIRONMENT = '__global__';

export type AuthenticationKind = 'admin' | 'api_key' | 'end_user' | 'test_fixture';
export type ControlPlanePermission = 'read' | 'write' | 'admin' | 'billing';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  organizationId?: string;
  projectId?: string;
  environmentId?: string;
  authKind?: AuthenticationKind;
  adminSessionId?: string;
  adminSession?: AdminSession;
}

const rolePermissions: Record<string, ControlPlanePermission[]> = {
  owner: ['read', 'write', 'admin', 'billing'],
  admin: ['read', 'write', 'admin', 'billing'],
  developer: ['read', 'write'],
  viewer: ['read'],
  billing: ['read', 'billing'],
};

export function roleAllows(role: string | undefined, permission: ControlPlanePermission): boolean {
  return Boolean(role && rolePermissions[role]?.includes(permission));
}

function deny(res: Response, status: 401 | 403, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export async function authenticateAdminToken(token: string): Promise<{ user: AdminUser; sessionId: string; session: AdminSession } | null> {
  const payload = verifyJwt(token);
  if (payload.token_use !== 'control_plane' || payload.project_id !== CONTROL_PLANE_PROJECT || payload.environment_id !== CONTROL_PLANE_ENVIRONMENT) return null;
  const [session, user] = await Promise.all([
    adminAuthRepository.findSession(payload.session_id),
    adminAuthRepository.findUserById(payload.sub),
  ]);
  if (!session || session.user_id !== payload.sub || !user || user.status !== 'active') throw new Error('Administrative session is invalid or expired.');
  return { user, sessionId: session.id, session };
}

export async function resolveControlPlaneCredential(token: string, projectId?: string, environmentId?: string): Promise<{
  user: AdminUser;
  sessionId: string;
  role: string;
  organizationId?: string;
  projectId?: string;
  environmentId?: string;
} | null> {
  const admin = await authenticateAdminToken(token);
  if (!admin) return null;
  if (!projectId && !environmentId) return { ...admin, role: admin.user.role };
  if (!projectId || !environmentId) throw new Error('Project and environment scope are both required.');
  const [project, environment] = await Promise.all([
    controlRepository.getProject(projectId),
    controlRepository.getEnvironment(environmentId),
  ]);
  if (!project || !environment || environment.project_id !== project.id) throw new Error('Administrative scope is invalid.');
  const role = await controlRepository.getOrganizationRole(admin.user.id, project.organization_id);
  if (!role) throw new Error('Administrative tenant access is denied.');
  return { ...admin, role, organizationId: project.organization_id, projectId, environmentId };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const isPublicAuthRoute = /^\/api\/auth\/(signup|login|logout|logout-all|refresh|verify-email|resend-verification|password-reset\/request|password-reset\/confirm|magic-link|email-otp|phone-otp|anonymous|oauth|mfa\/(challenge|enroll|verify)|passkeys)/.test(req.path);
  const isPublicAdminAuthRoute = /^\/api\/admin\/auth\/(signup|login|refresh|logout|logout-all|password-reset\/request|password-reset\/confirm|mfa\/setup|mfa\/enable|mfa\/verify|mfa\/disable|mfa\/recovery-codes)/.test(req.path);
  if (isPublicAuthRoute || isPublicAdminAuthRoute) { next(); return; }
  const authorization = req.headers.authorization;
  const apiKey = (req.headers.apikey as string) || (req.headers['x-apikey'] as string);
  try {
    if (apiKey) {
      const key = config.testMode ? db.findApiKeyByRawKey(apiKey) : await controlRepository.findApiKeyByRawKey(apiKey);
      if (!key) throw new Error('Invalid API key.');
      const project = config.testMode ? db.getProjectById(key.project_id) : await controlRepository.getProject(key.project_id);
      if (!project) throw new Error('API key project was not found.');
      if ((req.headers['x-project-id'] && req.headers['x-project-id'] !== key.project_id) || (key.environment_id && req.headers['x-environment-id'] && req.headers['x-environment-id'] !== key.environment_id)) throw new Error('API key scope does not match the requested project or environment.');
      req.user = { id: `api_key:${key.id}`, email: '', name: key.name, role: key.type === 'service' ? 'service' : key.type === 'secret' ? 'developer' : 'authenticated' };
      req.organizationId = project.organization_id;
      req.projectId = key.project_id;
      req.environmentId = key.environment_id;
      req.authKind = 'api_key';
      req.headers['x-organization-id'] = project.organization_id;
      req.headers['x-project-id'] = key.project_id;
      if (key.environment_id) req.headers['x-environment-id'] = key.environment_id;
      next();
      return;
    }
    if (authorization?.startsWith('Bearer ')) {
      const rawToken = authorization.slice(7).trim();
      const admin = await authenticateAdminToken(rawToken);
      if (admin) {
        req.user = { id: admin.user.id, email: admin.user.email, name: admin.user.name, role: admin.user.role };
        req.authKind = 'admin';
        req.adminSessionId = admin.sessionId;
        req.adminSession = admin.session;
        await adminAuthRepository.touchSession(admin.sessionId);
        next();
        return;
      }
      const payload = verifyJwt(rawToken);
      const project = config.testMode ? db.getProjectById(payload.project_id) : await controlRepository.getProject(payload.project_id);
      if (!project || project.organization_id !== ((req.headers['x-organization-id'] as string) || project.organization_id)) throw new Error('JWT project scope is invalid.');
      if ((req.headers['x-project-id'] && req.headers['x-project-id'] !== payload.project_id) || (req.headers['x-environment-id'] && req.headers['x-environment-id'] !== payload.environment_id)) throw new Error('JWT scope does not match the requested project or environment.');
      const session = config.testMode ? authDatabase.findSessionById(payload.session_id) : await realAuthRepository.findSession(payload.session_id);
      const user = config.testMode ? authDatabase.findUserById(payload.sub) : await realAuthRepository.findUserById(payload.sub);
      if (!session || session.user_id !== payload.sub || session.project_id !== payload.project_id || session.environment_id !== payload.environment_id || !user || user.project_id !== payload.project_id || user.environment_id !== payload.environment_id || user.status === 'disabled' || user.status === 'banned') throw new Error('JWT session is no longer valid.');
      req.user = { id: payload.sub, email: payload.email, name: payload.email, role: payload.role };
      req.organizationId = project.organization_id;
      req.projectId = payload.project_id;
      req.environmentId = payload.environment_id;
      req.authKind = 'end_user';
      if (!config.testMode) await realAuthRepository.touchSession(payload.session_id);
      req.headers['x-organization-id'] = project.organization_id;
      req.headers['x-project-id'] = payload.project_id;
      req.headers['x-environment-id'] = payload.environment_id;
      next();
      return;
    }
  } catch (error: any) {
    const message = process.env.NODE_ENV === 'production' ? 'Invalid or expired credentials.' : error.message || 'Invalid credentials.';
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
    return;
  }
  // The fixture is reserved for the explicit test/mock path. A running API must
  // never manufacture an owner when its identity provider is unavailable.
  if (process.env.NODE_ENV === 'production' || (!config.testMode && process.env.VITE_DATA_SOURCE !== 'mock')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' } });
    return;
  }
  req.user = {
    id: 'usr_owner_1',
    email: 'lucas@brisabase.dev',
    name: 'Lucas Silva',
    role: 'owner',
  };
  req.organizationId = (req.headers['x-organization-id'] as string) || 'org_core_1';
  req.authKind = 'test_fixture';
  next();
}

export function requirePermission(permission: ControlPlanePermission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Acesso não autorizado.' } });
      return;
    }
    if (!roleAllows(req.user.role, permission)) { res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Permission denied.' } }); return; }
    next();
  };
}

function requestedPermission(req: Request): ControlPlanePermission {
  if (/^\/api\/billing(?:\/|$)/.test(req.path) && !['GET','HEAD'].includes(req.method)) return 'billing';
  if (req.method === 'GET' || req.method === 'HEAD') return 'read';
  if (/^\/api\/database(?:\/|$)/.test(req.path) || /\/(?:api-keys|members)(?:\/|$)/.test(req.path) || /^\/api\/organization-members\//.test(req.path)) return 'admin';
  if (req.method === 'DELETE' && /^\/api\/(?:organizations|projects)\//.test(req.path)) return 'admin';
  return 'write';
}

function pathIdentifier(pathname: string, segment: string): string | undefined {
  const match = new RegExp(`^/api/${segment}/([^/]+)`).exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Deny-by-default control-plane boundary. Data-plane API keys and end-user JWTs
 * never cross this middleware. Tenant scope is resolved from trusted database
 * relationships, not copied from a request header.
 */
export async function controlPlaneAuthorizationMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (/^\/api\/auth\//.test(req.path)) { next(); return; }
  if (config.testMode && req.authKind === 'test_fixture') { next(); return; }
  if (req.authKind !== 'admin' || !req.user) {
    deny(res, req.user ? 403 : 401, req.user ? 'CONTROL_PLANE_FORBIDDEN' : 'UNAUTHORIZED', 'An administrative session is required.');
    return;
  }
  try {
    const pathOrganizationId = pathIdentifier(req.path, 'organizations');
    let organizationId = pathOrganizationId || (req.headers['x-organization-id'] as string | undefined);
    if (!organizationId && req.path === '/api/projects' && req.method === 'POST' && typeof req.body?.organization_id === 'string') organizationId = req.body.organization_id;
    let projectId = pathIdentifier(req.path, 'projects') || (req.headers['x-project-id'] as string | undefined);
    let environmentId = /^\/api\/projects\/[^/]+\/environments\/([^/]+)/.exec(req.path)?.[1];
    environmentId = environmentId ? decodeURIComponent(environmentId) : pathIdentifier(req.path, 'environments') || (req.headers['x-environment-id'] as string | undefined);

    if (!projectId && environmentId) {
      const environment = await controlRepository.getEnvironment(environmentId);
      if (!environment) { deny(res, 403, 'SCOPE_FORBIDDEN', 'Environment scope is not accessible.'); return; }
      projectId = environment.project_id;
    }
    if (projectId) {
      const project = await controlRepository.getProject(projectId);
      if (!project) { deny(res, 403, 'SCOPE_FORBIDDEN', 'Project scope is not accessible.'); return; }
      if (organizationId && organizationId !== project.organization_id) {
        deny(res, 403, 'SCOPE_FORBIDDEN', 'Project does not belong to the requested organization scope.');
        return;
      }
      organizationId = project.organization_id;
      if (environmentId) {
        const environment = await controlRepository.getEnvironment(environmentId);
        if (!environment || environment.project_id !== project.id) { deny(res, 403, 'SCOPE_FORBIDDEN', 'Environment does not belong to the authenticated project scope.'); return; }
      }
    }

    const requiresProjectScope = /^\/api\/(?:database|developer|graphql|realtime|webhooks|backups|security|observability|infrastructure|ecosystem|advanced|iac)(?:\/|$)/.test(req.path);
    if (requiresProjectScope && (!projectId || !environmentId)) {
      deny(res, 403, 'SCOPE_REQUIRED', 'A project and environment scope is required for this control-plane operation.');
      return;
    }
    if (/^\/api\/billing(?:\/|$)/.test(req.path) && !organizationId) {
      deny(res, 403, 'SCOPE_REQUIRED', 'An organization scope is required for billing operations.');
      return;
    }
    if (/^\/api\/enterprise(?:\/|$)/.test(req.path) && !organizationId) {
      deny(res, 403, 'SCOPE_REQUIRED', 'An organization scope is required for enterprise operations.');
      return;
    }

    if (organizationId) {
      const role = await controlRepository.getOrganizationRole(req.user.id, organizationId);
      if (!role) { deny(res, 403, 'TENANT_FORBIDDEN', 'Organization access is denied.'); return; }
      const permission = requestedPermission(req);
      if (!roleAllows(role, permission) && !await enterpriseEngine.customRoleAllows(organizationId, role, permission)) { deny(res, 403, 'PERMISSION_DENIED', `The ${permission} permission is required.`); return; }
      req.user.role = role;
      req.organizationId = organizationId;
      if (/^\/api\/enterprise(?:\/|$)/.test(req.path)) {
        try { await localBillingEngine.assertEnterpriseAccess(organizationId); }
        catch (error: any) {
          if (error?.code === 'ENTERPRISE_PLAN_REQUIRED') { res.status(402).json({ error: { code: error.code, message: error.message } }); return; }
          throw error;
        }
      }
      const enterprisePolicy = await enterpriseEngine.accessPolicy(organizationId);
      if (enterprisePolicy.ipAllowlistEnforced) {
        if (!enterprisePolicy.allowedCidrs.length || !req.ip || !enterprisePolicy.allowedCidrs.some((cidr) => cidrContains(cidr, req.ip!))) {
          deny(res, 403, 'IP_NOT_ALLOWED', 'This organization only permits administrative access from its configured IP allowlist.');
          return;
        }
      }
      if (enterprisePolicy.enforceSso && req.authKind === 'admin' && !String(req.adminSession?.auth_method || '').startsWith('sso:')) {
        deny(res, 403, 'SSO_REQUIRED', 'This organization requires Enterprise SSO.');
        return;
      }
      if (enterprisePolicy.requireAdminMfa && req.authKind === 'admin') {
        const adminUser = await adminAuthRepository.findUserById(req.user.id);
        if (!adminUser?.mfa_enabled) {
          deny(res, 403, 'ADMIN_MFA_REQUIRED', 'This organization requires MFA for administrative access.');
          return;
        }
      }
    }
    if (projectId) req.projectId = projectId;
    if (environmentId) req.environmentId = environmentId;
    next();
  } catch {
    deny(res, 403, 'CONTROL_PLANE_FORBIDDEN', 'The requested control-plane scope could not be authorized.');
  }
}
