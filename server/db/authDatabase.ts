import crypto from 'crypto';
import { logger } from '../logger';
import { normalizeEmail } from '../auth/cryptoUtils';

export interface AuthUserRow {
  id: string;
  project_id: string;
  environment_id: string;
  email: string;
  email_verified: boolean;
  phone?: string;
  phone_verified?: boolean;
  display_name: string;
  avatar_url?: string;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
  password_hash?: string;
  role: 'user' | 'admin' | 'moderator';
  status: 'active' | 'disabled' | 'banned' | 'pending';
  provider: 'email' | 'google' | 'github' | 'apple' | 'microsoft' | 'discord';
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string;
}

export interface AuthIdentityRow {
  id: string;
  user_id: string;
  project_id: string;
  environment_id: string;
  provider: 'email' | 'google' | 'github' | 'apple' | 'microsoft' | 'discord';
  provider_user_id: string;
  provider_email: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  project_id: string;
  environment_id: string;
  refresh_token_hash?: string;
  ip_address?: string;
  user_agent?: string;
  device_name?: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at?: string;
}

export interface AuthRefreshTokenRow {
  id: string;
  session_id: string;
  token_hash: string;
  user_id: string;
  project_id: string;
  environment_id: string;
  family_id: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string;
}

export interface AuthVerificationTokenRow {
  id: string;
  user_id: string;
  project_id: string;
  environment_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface AuthPasswordResetTokenRow {
  id: string;
  user_id: string;
  project_id: string;
  environment_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface AuthMfaFactorRow {
  id: string;
  user_id: string;
  project_id: string;
  environment_id: string;
  type: 'totp';
  secret_encrypted: string;
  verified_at?: string;
  created_at: string;
  last_used_at?: string;
}

export interface AuthMfaRecoveryCodeRow {
  id: string;
  user_id: string;
  factor_id: string;
  code_hash: string;
  used_at?: string;
  created_at: string;
}

export interface AuthProviderConfigRow {
  id: string;
  project_id: string;
  environment_id: string;
  provider: 'email' | 'google' | 'github' | 'apple' | 'microsoft' | 'discord';
  name: string;
  enabled: boolean;
  client_id?: string;
  client_secret_encrypted?: string;
  redirect_url: string;
  updated_at: string;
}

export interface AuthSettingsRow {
  project_id: string;
  environment_id: string;
  require_email_verification: boolean;
  allow_signups: boolean;
  minimum_password_length: number;
  require_mfa: boolean;
  maximum_sessions: number;
  session_lifetime_seconds: number;
  jwt_access_lifetime_seconds: number;
  refresh_token_lifetime_seconds: number;
}

class AuthDatabaseEngine {
  private usersMap = new Map<string, AuthUserRow>();
  private identitiesMap = new Map<string, AuthIdentityRow>();
  private sessionsMap = new Map<string, AuthSessionRow>();
  private refreshTokensMap = new Map<string, AuthRefreshTokenRow>();
  private verificationTokensMap = new Map<string, AuthVerificationTokenRow>();
  private passwordResetTokensMap = new Map<string, AuthPasswordResetTokenRow>();
  private mfaFactorsMap = new Map<string, AuthMfaFactorRow>();
  private mfaRecoveryCodesMap = new Map<string, AuthMfaRecoveryCodeRow>();
  private providersConfigMap = new Map<string, AuthProviderConfigRow>();
  private settingsMap = new Map<string, AuthSettingsRow>();

  public exportBackupState(projectId: string, environmentId: string): Record<string, unknown> {
    const belongs = (value: any) => value?.project_id === projectId && value?.environment_id === environmentId;
    const relatedUserIds = new Set(Array.from(this.usersMap.values()).filter(belongs).map((item) => item.id));
    const clone = (values: any[]) => JSON.parse(JSON.stringify(values));
    return {
      users: clone(Array.from(this.usersMap.values()).filter(belongs)), identities: clone(Array.from(this.identitiesMap.values()).filter(belongs)), sessions: clone(Array.from(this.sessionsMap.values()).filter(belongs)), refreshTokens: clone(Array.from(this.refreshTokensMap.values()).filter(belongs)), verificationTokens: clone(Array.from(this.verificationTokensMap.values()).filter(belongs)), passwordResetTokens: clone(Array.from(this.passwordResetTokensMap.values()).filter(belongs)), mfaFactors: clone(Array.from(this.mfaFactorsMap.values()).filter(belongs)), mfaRecoveryCodes: clone(Array.from(this.mfaRecoveryCodesMap.values()).filter((item) => relatedUserIds.has(item.user_id))), providers: clone(Array.from(this.providersConfigMap.values()).filter(belongs)), settings: clone(Array.from(this.settingsMap.values()).filter(belongs)),
    };
  }

  public restoreBackupState(projectId: string, environmentId: string, state: any): void {
    if (!state || !Array.isArray(state.users)) throw new Error('Invalid auth backup state.');
    const belongs = (value: any) => value?.project_id === projectId && value?.environment_id === environmentId;
    const previousUserIds = new Set(Array.from(this.usersMap.values()).filter(belongs).map((user) => user.id));
    const purge = (map: Map<string, any>) => { for (const [id, value] of map) if (belongs(value)) map.delete(id); };
    [this.usersMap, this.identitiesMap, this.sessionsMap, this.refreshTokensMap, this.verificationTokensMap, this.passwordResetTokensMap, this.mfaFactorsMap, this.providersConfigMap, this.settingsMap].forEach(purge);
    const add = (map: Map<string, any>, values: any[]) => values?.forEach((value) => map.set(value.id || this.getKey(projectId, environmentId, value.provider || ''), JSON.parse(JSON.stringify(value))));
    add(this.usersMap, state.users); add(this.identitiesMap, state.identities); add(this.sessionsMap, state.sessions); add(this.refreshTokensMap, state.refreshTokens); add(this.verificationTokensMap, state.verificationTokens); add(this.passwordResetTokensMap, state.passwordResetTokens); add(this.mfaFactorsMap, state.mfaFactors); add(this.providersConfigMap, state.providers); add(this.settingsMap, state.settings);
    for (const [id, code] of this.mfaRecoveryCodesMap) if (previousUserIds.has(code.user_id)) this.mfaRecoveryCodesMap.delete(id);
    add(this.mfaRecoveryCodesMap, state.mfaRecoveryCodes);
  }

  constructor() {
    this.seedDefaultData();
  }

  private getKey(projectId: string, environmentId: string, extra = ''): string {
    return `${projectId}:${environmentId}${extra ? ':' + extra : ''}`;
  }

  private seedDefaultData() {
    const defaultProjectId = 'proj_main_1';
    const defaultEnvId = 'env_prod_1';

    // Seed Settings & Policies
    const key = this.getKey(defaultProjectId, defaultEnvId);
    this.settingsMap.set(key, {
      project_id: defaultProjectId,
      environment_id: defaultEnvId,
      require_email_verification: false,
      allow_signups: true,
      minimum_password_length: 8,
      require_mfa: false,
      maximum_sessions: 5,
      session_lifetime_seconds: 86400 * 30, // 30 days
      jwt_access_lifetime_seconds: 900, // 15 mins
      refresh_token_lifetime_seconds: 86400 * 30,
    });

    // Seed Providers
    const providersList: Array<{ id: string; name: string; provider: AuthUserRow['provider']; enabled: boolean }> = [
      { id: 'email', name: 'Email / Password', provider: 'email', enabled: true },
      { id: 'google', name: 'Google OAuth', provider: 'google', enabled: true },
      { id: 'github', name: 'GitHub OAuth', provider: 'github', enabled: false },
      { id: 'apple', name: 'Apple Sign-In', provider: 'apple', enabled: false },
      { id: 'microsoft', name: 'Microsoft OAuth', provider: 'microsoft', enabled: false },
      { id: 'discord', name: 'Discord OAuth', provider: 'discord', enabled: false },
    ];

    for (const p of providersList) {
      const pKey = `${key}:${p.id}`;
      this.providersConfigMap.set(pKey, {
        id: p.id,
        project_id: defaultProjectId,
        environment_id: defaultEnvId,
        provider: p.provider,
        name: p.name,
        enabled: p.enabled,
        redirect_url: `https://api.brisabase.dev/auth/v1/oauth/${p.id}/callback`,
        updated_at: new Date().toISOString(),
      });
    }

    // Seed Auth Users
    const sampleUsers: Array<{
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user' | 'moderator';
      provider: AuthUserRow['provider'];
      status: AuthUserRow['status'];
      avatar: string;
    }> = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'joao.silva@empresa.com.br',
        name: 'João Silva',
        role: 'admin',
        provider: 'google',
        status: 'active',
        avatar: '',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        email: 'maria.oliveira@tech.io',
        name: 'Maria Oliveira',
        role: 'user',
        provider: 'email',
        status: 'active',
        avatar: '',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        email: 'carlos.eduardo@dev.net',
        name: 'Carlos Eduardo',
        role: 'user',
        provider: 'github',
        status: 'active',
        avatar: '',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        email: 'ana.pereira@design.co',
        name: 'Ana Pereira',
        role: 'moderator',
        provider: 'email',
        status: 'pending',
        avatar: '',
      },
    ];

    for (const u of sampleUsers) {
      const userRow: AuthUserRow = {
        id: u.id,
        project_id: defaultProjectId,
        environment_id: defaultEnvId,
        email: normalizeEmail(u.email),
        email_verified: u.status === 'active',
        display_name: u.name,
        avatar_url: u.avatar,
        user_metadata: { preferredLocale: 'pt-BR' },
        app_metadata: { tier: 'pro' },
        role: u.role,
        status: u.status,
        provider: u.provider,
        created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      };
      this.usersMap.set(u.id, userRow);

      // Identity
      const identityId = `id_${crypto.randomBytes(8).toString('hex')}`;
      this.identitiesMap.set(identityId, {
        id: identityId,
        user_id: u.id,
        project_id: defaultProjectId,
        environment_id: defaultEnvId,
        provider: u.provider,
        provider_user_id: `${u.provider}_${u.id}`,
        provider_email: userRow.email,
        created_at: userRow.created_at,
        updated_at: userRow.updated_at,
      });

      // Sample active session for active user
      if (u.status === 'active') {
        const sessId = `sess_${crypto.randomBytes(8).toString('hex')}`;
        this.sessionsMap.set(sessId, {
          id: sessId,
          user_id: u.id,
          project_id: defaultProjectId,
          environment_id: defaultEnvId,
          ip_address: '187.32.112.45',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
          device_name: 'Chrome / Windows',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
        });
      }
    }
  }

  // --- SETTINGS & POLICIES ---
  public getSettings(projectId: string, environmentId: string): AuthSettingsRow {
    const key = this.getKey(projectId, environmentId);
    let settings = this.settingsMap.get(key);
    if (!settings) {
      settings = {
        project_id: projectId,
        environment_id: environmentId,
        require_email_verification: false,
        allow_signups: true,
        minimum_password_length: 8,
        require_mfa: false,
        maximum_sessions: 5,
        session_lifetime_seconds: 86400 * 30,
        jwt_access_lifetime_seconds: 900,
        refresh_token_lifetime_seconds: 86400 * 30,
      };
      this.settingsMap.set(key, settings);
    }
    return { ...settings };
  }

  public updateSettings(projectId: string, environmentId: string, partial: Partial<AuthSettingsRow>): AuthSettingsRow {
    const current = this.getSettings(projectId, environmentId);
    const updated = { ...current, ...partial, project_id: projectId, environment_id: environmentId };
    const key = this.getKey(projectId, environmentId);
    this.settingsMap.set(key, updated);
    return { ...updated };
  }

  // --- PROVIDERS ---
  public getProviders(projectId: string, environmentId: string): AuthProviderConfigRow[] {
    const prefix = this.getKey(projectId, environmentId);
    const results: AuthProviderConfigRow[] = [];

    // Default providers list if none initialized
    const defaultIds = ['email', 'google', 'github', 'apple', 'microsoft', 'discord'];
    for (const pId of defaultIds) {
      const pKey = `${prefix}:${pId}`;
      let prov = this.providersConfigMap.get(pKey);
      if (!prov) {
        prov = {
          id: pId,
          project_id: projectId,
          environment_id: environmentId,
          provider: pId as any,
          name: pId.charAt(0).toUpperCase() + pId.slice(1) + (pId === 'email' ? ' / Password' : ' OAuth'),
          enabled: pId === 'email' || pId === 'google',
          redirect_url: `https://api.brisabase.dev/auth/v1/oauth/${pId}/callback`,
          updated_at: new Date().toISOString(),
        };
        this.providersConfigMap.set(pKey, prov);
      }
      results.push({ ...prov });
    }
    return results;
  }

  public updateProvider(
    projectId: string,
    environmentId: string,
    providerId: string,
    updates: Partial<AuthProviderConfigRow>
  ): AuthProviderConfigRow {
    const providers = this.getProviders(projectId, environmentId);
    const existing = providers.find((p) => p.id === providerId);
    if (!existing) {
      throw new Error(`Provedor ${providerId} não encontrado.`);
    }

    const pKey = `${this.getKey(projectId, environmentId)}:${providerId}`;
    const updated: AuthProviderConfigRow = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.providersConfigMap.set(pKey, updated);
    return { ...updated };
  }

  // --- USERS ---
  public createUser(user: Omit<AuthUserRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }): AuthUserRow {
    const id = user.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const newUser: AuthUserRow = {
      ...user,
      id,
      email: normalizeEmail(user.email),
      user_metadata: user.user_metadata || {},
      app_metadata: user.app_metadata || {},
      created_at: now,
      updated_at: now,
    };

    // Verify duplicate email in same project + environment
    const existing = this.findUserByEmail(newUser.project_id, newUser.environment_id, newUser.email);
    if (existing) {
      throw new Error(`O e-mail '${newUser.email}' já está cadastrado para este projeto/ambiente.`);
    }

    this.usersMap.set(id, newUser);
    return { ...newUser };
  }

  public findUserById(id: string): AuthUserRow | null {
    const u = this.usersMap.get(id);
    return u ? { ...u } : null;
  }

  public findUserByEmail(projectId: string, environmentId: string, email: string): AuthUserRow | null {
    const norm = normalizeEmail(email);
    for (const u of this.usersMap.values()) {
      if (u.project_id === projectId && u.environment_id === environmentId && u.email === norm) {
        return { ...u };
      }
    }
    return null;
  }

  public updateUser(id: string, updates: Partial<AuthUserRow>): AuthUserRow {
    const existing = this.usersMap.get(id);
    if (!existing) {
      throw new Error(`Usuário ${id} não encontrado.`);
    }

    if (updates.email && updates.email !== existing.email) {
      const dup = this.findUserByEmail(existing.project_id, existing.environment_id, updates.email);
      if (dup && dup.id !== id) {
        throw new Error(`O e-mail '${updates.email}' já está em uso.`);
      }
    }

    const updated: AuthUserRow = {
      ...existing,
      ...updates,
      email: updates.email ? normalizeEmail(updates.email) : existing.email,
      updated_at: new Date().toISOString(),
    };
    this.usersMap.set(id, updated);
    return { ...updated };
  }

  public deleteUser(id: string): void {
    this.usersMap.delete(id);
    // Delete associated sessions & tokens
    for (const [sessId, sess] of this.sessionsMap.entries()) {
      if (sess.user_id === id) this.sessionsMap.delete(sessId);
    }
  }

  public listUsers(projectId: string, environmentId: string, search = ''): AuthUserRow[] {
    const results: AuthUserRow[] = [];
    const term = search.toLowerCase().trim();

    for (const u of this.usersMap.values()) {
      if (u.project_id === projectId && u.environment_id === environmentId) {
        if (
          !term ||
          u.display_name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term)
        ) {
          results.push({ ...u });
        }
      }
    }

    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // --- IDENTITIES ---
  public createIdentity(identity: Omit<AuthIdentityRow, 'id' | 'created_at' | 'updated_at'>): AuthIdentityRow {
    const id = `id_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newIdentity: AuthIdentityRow = {
      ...identity,
      id,
      created_at: now,
      updated_at: now,
    };
    this.identitiesMap.set(id, newIdentity);
    return { ...newIdentity };
  }

  public findIdentityByProviderAndId(
    projectId: string,
    environmentId: string,
    provider: AuthUserRow['provider'],
    providerUserId: string
  ): AuthIdentityRow | null {
    for (const iden of this.identitiesMap.values()) {
      if (
        iden.project_id === projectId &&
        iden.environment_id === environmentId &&
        iden.provider === provider &&
        iden.provider_user_id === providerUserId
      ) {
        return { ...iden };
      }
    }
    return null;
  }

  public findIdentitiesByUserId(userId: string): AuthIdentityRow[] {
    const list: AuthIdentityRow[] = [];
    for (const iden of this.identitiesMap.values()) {
      if (iden.user_id === userId) {
        list.push({ ...iden });
      }
    }
    return list;
  }

  // --- SESSIONS ---
  public createSession(session: Omit<AuthSessionRow, 'id' | 'created_at' | 'updated_at' | 'last_seen_at'>): AuthSessionRow {
    const id = `sess_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newSess: AuthSessionRow = {
      ...session,
      id,
      created_at: now,
      updated_at: now,
      last_seen_at: now,
    };
    this.sessionsMap.set(id, newSess);
    return { ...newSess };
  }

  public findSessionById(id: string): AuthSessionRow | null {
    const s = this.sessionsMap.get(id);
    if (!s || s.revoked_at || new Date(s.expires_at).getTime() < Date.now()) {
      return null;
    }
    return { ...s };
  }

  public listSessions(projectId: string, environmentId: string, userId?: string): AuthSessionRow[] {
    const list: AuthSessionRow[] = [];
    for (const s of this.sessionsMap.values()) {
      if (s.project_id === projectId && s.environment_id === environmentId) {
        if (!userId || s.user_id === userId) {
          list.push({ ...s });
        }
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public touchSession(id: string): void {
    const s = this.sessionsMap.get(id);
    if (s) {
      s.last_seen_at = new Date().toISOString();
      s.updated_at = s.last_seen_at;
    }
  }

  public revokeSession(id: string): boolean {
    const s = this.sessionsMap.get(id);
    if (s) {
      s.revoked_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  public revokeAllUserSessions(userId: string): number {
    let count = 0;
    const now = new Date().toISOString();
    for (const s of this.sessionsMap.values()) {
      if (s.user_id === userId && !s.revoked_at) {
        s.revoked_at = now;
        count++;
      }
    }
    return count;
  }

  // --- REFRESH TOKENS ---
  public createRefreshToken(
    token: Omit<AuthRefreshTokenRow, 'id' | 'created_at'>
  ): AuthRefreshTokenRow {
    const id = `rt_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const row: AuthRefreshTokenRow = {
      ...token,
      id,
      created_at: now,
    };
    this.refreshTokensMap.set(id, row);
    return { ...row };
  }

  public findRefreshTokenByHash(tokenHash: string): AuthRefreshTokenRow | null {
    for (const rt of this.refreshTokensMap.values()) {
      if (rt.token_hash === tokenHash) {
        return { ...rt };
      }
    }
    return null;
  }

  public revokeRefreshToken(id: string): void {
    const rt = this.refreshTokensMap.get(id);
    if (rt) {
      rt.revoked_at = new Date().toISOString();
    }
  }

  public revokeRefreshTokenFamily(familyId: string): void {
    const now = new Date().toISOString();
    for (const rt of this.refreshTokensMap.values()) {
      if (rt.family_id === familyId) {
        rt.revoked_at = now;
      }
    }
  }

  // --- VERIFICATION TOKENS ---
  public createVerificationToken(
    token: Omit<AuthVerificationTokenRow, 'id' | 'created_at'>
  ): AuthVerificationTokenRow {
    const id = `vt_${crypto.randomUUID()}`;
    const row: AuthVerificationTokenRow = {
      ...token,
      id,
      created_at: new Date().toISOString(),
    };
    this.verificationTokensMap.set(id, row);
    return { ...row };
  }

  public findVerificationTokenByHash(tokenHash: string): AuthVerificationTokenRow | null {
    for (const vt of this.verificationTokensMap.values()) {
      if (vt.token_hash === tokenHash && !vt.used_at && new Date(vt.expires_at).getTime() > Date.now()) {
        return { ...vt };
      }
    }
    return null;
  }

  public markVerificationTokenUsed(id: string): void {
    const vt = this.verificationTokensMap.get(id);
    if (vt) {
      vt.used_at = new Date().toISOString();
    }
  }

  // --- PASSWORD RESET TOKENS ---
  public createPasswordResetToken(
    token: Omit<AuthPasswordResetTokenRow, 'id' | 'created_at'>
  ): AuthPasswordResetTokenRow {
    const id = `prt_${crypto.randomUUID()}`;
    const row: AuthPasswordResetTokenRow = {
      ...token,
      id,
      created_at: new Date().toISOString(),
    };
    this.passwordResetTokensMap.set(id, row);
    return { ...row };
  }

  public findPasswordResetTokenByHash(tokenHash: string): AuthPasswordResetTokenRow | null {
    for (const prt of this.passwordResetTokensMap.values()) {
      if (prt.token_hash === tokenHash && !prt.used_at && new Date(prt.expires_at).getTime() > Date.now()) {
        return { ...prt };
      }
    }
    return null;
  }

  public markPasswordResetTokenUsed(id: string): void {
    const prt = this.passwordResetTokensMap.get(id);
    if (prt) {
      prt.used_at = new Date().toISOString();
    }
  }

  // --- MFA ---
  public createMfaFactor(
    factor: Omit<AuthMfaFactorRow, 'id' | 'created_at'>
  ): AuthMfaFactorRow {
    const id = `mfa_${crypto.randomUUID()}`;
    const row: AuthMfaFactorRow = {
      ...factor,
      id,
      created_at: new Date().toISOString(),
    };
    this.mfaFactorsMap.set(id, row);
    return { ...row };
  }

  public findMfaFactorsByUserId(userId: string): AuthMfaFactorRow[] {
    const list: AuthMfaFactorRow[] = [];
    for (const m of this.mfaFactorsMap.values()) {
      if (m.user_id === userId && m.verified_at) {
        list.push({ ...m });
      }
    }
    return list;
  }

  public verifyMfaFactor(id: string): void {
    const f = this.mfaFactorsMap.get(id);
    if (f) {
      f.verified_at = new Date().toISOString();
    }
  }

  public disableMfaFactorsForUser(userId: string): void {
    for (const [id, f] of this.mfaFactorsMap.entries()) {
      if (f.user_id === userId) {
        this.mfaFactorsMap.delete(id);
      }
    }
  }

  public setMfaRecoveryCodes(userId: string, factorId: string, hashedCodes: string[]): void {
    // Delete existing
    for (const [id, c] of this.mfaRecoveryCodesMap.entries()) {
      if (c.user_id === userId) {
        this.mfaRecoveryCodesMap.delete(id);
      }
    }

    for (const codeHash of hashedCodes) {
      const id = `rc_${crypto.randomUUID()}`;
      this.mfaRecoveryCodesMap.set(id, {
        id,
        user_id: userId,
        factor_id: factorId,
        code_hash: codeHash,
        created_at: new Date().toISOString(),
      });
    }
  }

  public verifyAndConsumeRecoveryCode(userId: string, codeHash: string): boolean {
    for (const c of this.mfaRecoveryCodesMap.values()) {
      if (c.user_id === userId && c.code_hash === codeHash && !c.used_at) {
        c.used_at = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  // --- CLEANUP ---
  public cleanupExpiredTokens(): { expiredSessions: number; expiredTokens: number } {
    const now = Date.now();
    let expiredSessions = 0;
    let expiredTokens = 0;

    for (const [id, s] of this.sessionsMap.entries()) {
      if (new Date(s.expires_at).getTime() < now) {
        this.sessionsMap.delete(id);
        expiredSessions++;
      }
    }

    for (const [id, rt] of this.refreshTokensMap.entries()) {
      if (new Date(rt.expires_at).getTime() < now) {
        this.refreshTokensMap.delete(id);
        expiredTokens++;
      }
    }

    return { expiredSessions, expiredTokens };
  }
}

export const authDatabase = new AuthDatabaseEngine();
