import { AuthUser, AuthProviderConfig, AuthSessionInfo, AuthSettings, AuthCustomRole } from '../types';
import { INITIAL_AUTH_USERS, INITIAL_PROVIDERS, MOCK_RLS_POLICIES, AuthPolicy } from '../mocks/mockAuth';
import { safeAvatarUrl } from '../utils/avatar';

export interface AuthService {
  listUsers(): Promise<AuthUser[]>;
  createUser(data: { name: string; email: string; role: 'user' | 'admin' | 'moderator'; provider: AuthUser['provider'] }): Promise<AuthUser>;
  toggleUserBlockStatus(userId: string): Promise<AuthUser>;
  deleteUser(userId: string): Promise<void>;
  listProviders(): Promise<AuthProviderConfig[]>;
  toggleProvider(providerId: string, enabled: boolean): Promise<AuthProviderConfig>;
  updateProviderConfig(providerId: string, config: { clientId?: string; clientSecret?: string }): Promise<AuthProviderConfig>;
  listSessions(): Promise<AuthSessionInfo[]>;
  revokeSession(sessionId: string): Promise<void>;
  listPolicies(): Promise<AuthPolicy[]>;
  getSettings(): Promise<AuthSettings>;
  updateSettings(settings: Partial<AuthSettings>): Promise<AuthSettings>;
  listRoles(): Promise<AuthCustomRole[]>;
  saveRole(name: string, description: string, claims: Record<string, unknown>): Promise<AuthCustomRole>;
  deleteRole(name: string): Promise<void>;
  updateUserAuthorization(userId: string, role: string, claims: Record<string, unknown>): Promise<AuthUser>;
}

export class MockAuthService implements AuthService {
  private users: AuthUser[] = [...INITIAL_AUTH_USERS];
  private providers: AuthProviderConfig[] = [...INITIAL_PROVIDERS];
  private policies: AuthPolicy[] = [...MOCK_RLS_POLICIES];

  async listUsers(): Promise<AuthUser[]> {
    return [...this.users];
  }

  async createUser(data: { name: string; email: string; role: 'user' | 'admin' | 'moderator'; provider: AuthUser['provider'] }): Promise<AuthUser> {
    const newUser: AuthUser = {
      id: `usr_${Math.random().toString(36).substring(2, 9)}`,
      name: data.name,
      email: data.email,
      avatarUrl: safeAvatarUrl(undefined, data.name),
      provider: data.provider || 'email',
      status: 'active',
      role: data.role || 'user',
      lastSignInAt: 'Nunca',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    this.users.unshift(newUser);
    return newUser;
  }

  async toggleUserBlockStatus(userId: string): Promise<AuthUser> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error('Usuário não encontrado');
    user.status = user.status === 'blocked' ? 'active' : 'blocked';
    return { ...user };
  }

  async deleteUser(userId: string): Promise<void> {
    this.users = this.users.filter((u) => u.id !== userId);
  }

  async listProviders(): Promise<AuthProviderConfig[]> {
    return [...this.providers];
  }

  async toggleProvider(providerId: string, enabled: boolean): Promise<AuthProviderConfig> {
    const prov = this.providers.find((p) => p.id === providerId);
    if (!prov) throw new Error('Provedor não encontrado');
    prov.enabled = enabled;
    return { ...prov };
  }

  async updateProviderConfig(providerId: string, config: { clientId?: string; clientSecret?: string }): Promise<AuthProviderConfig> {
    const prov = this.providers.find((p) => p.id === providerId);
    if (!prov) throw new Error('Provedor não encontrado');
    if (config.clientId) prov.clientId = config.clientId;
    if (config.clientSecret) prov.clientSecretConfigured = true;
    return { ...prov };
  }

  async listSessions(): Promise<AuthSessionInfo[]> { return []; }
  async revokeSession(_sessionId: string): Promise<void> { return; }
  async getSettings(): Promise<AuthSettings> { return { require_email_verification:true,allow_signups:true,minimum_password_length:8,require_mfa:false,maximum_sessions:10,session_lifetime_seconds:2592000,jwt_access_lifetime_seconds:900,refresh_token_lifetime_seconds:2592000,magic_link_enabled:true,email_otp_enabled:true,phone_otp_enabled:false,anonymous_auth_enabled:false,passkeys_enabled:true,password_require_uppercase:false,password_require_lowercase:false,password_require_number:false,password_require_symbol:false,otp_lifetime_seconds:600,login_attempt_limit:10,login_lockout_seconds:900,allowed_redirect_origins:[] }; }
  async updateSettings(settings: Partial<AuthSettings>): Promise<AuthSettings> { return { ...(await this.getSettings()), ...settings }; }
  async listRoles(): Promise<AuthCustomRole[]> { return []; }
  async saveRole(name:string,description:string,claims:Record<string,unknown>):Promise<AuthCustomRole>{ return {id:`role_${name}`,name,description,claims,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}; }
  async deleteRole(_name:string):Promise<void>{ return; }
  async updateUserAuthorization(userId:string,role:string,claims:Record<string,unknown>):Promise<AuthUser>{ const user=this.users.find(x=>x.id===userId);if(!user)throw new Error('Usuário não encontrado');user.role=role as any;user.customClaims=claims;return {...user}; }

  async listPolicies(): Promise<AuthPolicy[]> {
    return [...this.policies];
  }
}

export const mockAuthService = new MockAuthService();

export class RealAuthService implements AuthService {
  private getScope(): { projectId: string; environmentId: string } {
    const projectId = window.localStorage.getItem('brisabase.projectId') || '';
    const environmentId = window.localStorage.getItem('brisabase.environmentId') || '';
    return { projectId, environmentId };
  }
  async listUsers(): Promise<AuthUser[]> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/users`);
    if (!res.ok) throw new Error('Falha ao buscar usuários no servidor');
    const data = await res.json();
    return data.map((u: any) => ({
      id: u.id,
      name: u.display_name,
      email: u.email,
      avatarUrl: safeAvatarUrl(u.avatar_url, u.display_name || u.email),
      provider: u.provider || 'email',
      status: u.status === 'banned' || u.status === 'disabled' ? 'blocked' : u.status === 'pending' ? 'unverified' : 'active',
      role: u.role || 'user',
      phone: u.phone,
      phoneVerified: !!u.phone_verified,
      isAnonymous: !!u.is_anonymous,
      customClaims: u.custom_claims || {},
      lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca',
      createdAt: u.created_at ? new Date(u.created_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'),
    }));
  }

  async createUser(data: { name: string; email: string; role: 'user' | 'admin' | 'moderator'; provider: AuthUser['provider'] }): Promise<AuthUser> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao criar usuário');
    const u = await res.json();
    return {
      id: u.id,
      name: u.display_name,
      email: u.email,
      avatarUrl: safeAvatarUrl(u.avatar_url, u.display_name || u.email),
      provider: u.provider || 'email',
      status: 'active',
      role: u.role || 'user',
      phone: u.phone,
      phoneVerified: !!u.phone_verified,
      isAnonymous: !!u.is_anonymous,
      customClaims: u.custom_claims || {},
      lastSignInAt: 'Nunca',
      createdAt: new Date().toISOString(),
    };
  }

  async toggleUserBlockStatus(userId: string): Promise<AuthUser> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const users = await this.listUsers();
    const user = users.find((u) => u.id === userId);
    const newStatus = user?.status === 'blocked' ? 'active' : 'banned';
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) throw new Error('Falha ao atualizar status do usuário');
    const u = await res.json();
    return {
      id: u.id,
      name: u.display_name,
      email: u.email,
      avatarUrl: safeAvatarUrl(u.avatar_url, u.display_name || u.email),
      provider: u.provider,
      status: u.status === 'banned' || u.status === 'disabled' ? 'blocked' : 'active',
      role: u.role,
      lastSignInAt: u.last_sign_in_at || 'Nunca',
      createdAt: u.created_at,
    };
  }

  async deleteUser(userId: string): Promise<void> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/users/${userId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Falha ao deletar usuário');
  }

  async listProviders(): Promise<AuthProviderConfig[]> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/providers`);
    if (!res.ok) throw new Error('Falha ao listar provedores');
    const data = await res.json();
    return data.map((p: any) => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      enabled: p.enabled,
      clientId: p.client_id,
      clientSecretConfigured: !!p.client_secret_configured,
      redirectUrl: p.redirect_url,
    }));
  }

  async toggleProvider(providerId: string, enabled: boolean): Promise<AuthProviderConfig> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/providers/${providerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('Falha ao alterar estado do provedor');
    const p = await res.json();
    return {
      id: p.id,
      name: p.name,
      provider: p.provider,
      enabled: p.enabled,
      clientId: p.client_id,
      clientSecretConfigured: !!p.client_secret_configured,
      redirectUrl: p.redirect_url,
    };
  }

  async updateProviderConfig(providerId: string, config: { clientId?: string; clientSecret?: string }): Promise<AuthProviderConfig> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/providers/${providerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
      }),
    });
    if (!res.ok) throw new Error('Falha ao atualizar chaves do provedor');
    const p = await res.json();
    return {
      id: p.id,
      name: p.name,
      provider: p.provider,
      enabled: p.enabled,
      clientId: p.client_id,
      clientSecretConfigured: !!p.client_secret_configured,
      redirectUrl: p.redirect_url,
    };
  }

  async listSessions(): Promise<AuthSessionInfo[]> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/sessions`);
    if (!res.ok) throw new Error('Falha ao buscar sessões');
    const data = await res.json();
    return data.map((s: any) => ({
      id: s.id,
      userId: s.user_id,
      ipAddress: s.ip_address || '127.0.0.1',
      userAgent: s.user_agent || 'Unknown Device',
      deviceName: s.device_name || 'Navegador Web',
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      status: s.revoked_at ? 'revoked' : 'active',
      authMethod: s.auth_method,
      mfaVerified: !!s.mfa_verified_at,
    }));
  }

  async revokeSession(sessionId: string): Promise<void> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/sessions/${sessionId}/revoke`, { method: 'POST' });
    if (!res.ok) throw new Error('Falha ao revogar sessão');
  }

  async getSettings(): Promise<AuthSettings> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/settings`);
    if (!res.ok) throw new Error('Falha ao carregar configurações de autenticação');
    return res.json();
  }

  async updateSettings(settings: Partial<AuthSettings>): Promise<AuthSettings> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    if (!res.ok) throw new Error('Falha ao atualizar configurações de autenticação');
    return res.json();
  }

  async listRoles(): Promise<AuthCustomRole[]> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/roles`);
    if (!res.ok) throw new Error('Falha ao carregar roles customizadas');
    return res.json();
  }

  async saveRole(name: string, description: string, claims: Record<string, unknown>): Promise<AuthCustomRole> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/roles/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description, claims }) });
    if (!res.ok) throw new Error('Falha ao salvar role');
    return res.json();
  }

  async deleteRole(name: string): Promise<void> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/roles/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error('Falha ao excluir role');
  }

  async updateUserAuthorization(userId: string, role: string, claims: Record<string, unknown>): Promise<AuthUser> {
    const { projectId, environmentId } = this.getScope();
    const res = await fetch(`/api/projects/${projectId}/environments/${environmentId}/auth/users/${userId}/authorization`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, claims }) });
    if (!res.ok) throw new Error('Falha ao atualizar autorização do usuário');
    const u = await res.json();
    return { id:u.id,name:u.display_name,email:u.email,avatarUrl:safeAvatarUrl(u.avatar_url,u.display_name||u.email),provider:u.provider,status:u.status==='banned'||u.status==='disabled'?'blocked':u.status==='pending'?'unverified':'active',role:u.role,lastSignInAt:u.last_sign_in_at||'Nunca',createdAt:u.created_at,phone:u.phone,phoneVerified:u.phone_verified,isAnonymous:u.is_anonymous,customClaims:u.custom_claims||{} };
  }

  async listPolicies(): Promise<AuthPolicy[]> {
    const { projectId, environmentId } = this.getScope();
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    const res = await fetch(`/api/security/policies?resourceType=table`);
    if (!res.ok) throw new Error('Falha ao listar políticas RLS.');
    const data = await res.json();
    return data.map((policy: any) => ({
      id: policy.id,
      table: policy.resource,
      name: policy.name,
      action: policy.operation === '*' ? 'ALL' : policy.operation,
      roleTarget: 'claims/RLS',
      expression: policy.condition,
      enabled: !!policy.enabled,
    }));
  }
}

export const realAuthService = new RealAuthService();
