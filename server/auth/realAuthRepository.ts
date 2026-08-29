import crypto from 'node:crypto';
import { postgres } from '../db/postgres';
import { normalizeEmail } from './cryptoUtils';
import { config } from '../config';

export type RealAuthUser = {
  id: string; project_id: string; environment_id: string; email: string; email_verified: boolean; display_name: string; avatar_url?: string; phone?: string; phone_verified?: boolean;
  password_hash?: string; role: string; status: 'active' | 'disabled' | 'banned' | 'pending'; provider: string; is_anonymous?: boolean;
  user_metadata: Record<string, unknown>; app_metadata: Record<string, unknown>; custom_claims?: Record<string, unknown>; created_at: string; updated_at: string; last_sign_in_at?: string;
};
export type RealAuthSession = { id: string; user_id: string; project_id: string; environment_id: string; expires_at: string; revoked_at?: string; created_at: string; last_seen_at: string; auth_method?: string; mfa_verified_at?: string; ip_address?: string; user_agent?: string; device_name?: string };
export type RealAuthIdentity = { id:string; user_id:string; project_id:string; environment_id:string; provider:string; provider_user_id:string; provider_email?:string; metadata:Record<string,unknown>; created_at:string; updated_at:string };
export type AuthPasskey = { id:string; user_id:string; project_id:string; environment_id:string; credential_id:string; public_key_jwk:Record<string,unknown>; sign_count:number; transports:string[]; device_name?:string; created_at:string; last_used_at?:string };
export type AuthCustomRole = { id:string; project_id:string; environment_id:string; name:string; description:string; claims:Record<string,unknown>; created_at:string; updated_at:string };
export type RealAuthSettings = { project_id: string; environment_id: string; require_email_verification: boolean; allow_signups: boolean; minimum_password_length: number; require_mfa: boolean; maximum_sessions: number; session_lifetime_seconds: number; jwt_access_lifetime_seconds: number; refresh_token_lifetime_seconds: number; magic_link_enabled:boolean; email_otp_enabled:boolean; phone_otp_enabled:boolean; anonymous_auth_enabled:boolean; passkeys_enabled:boolean; password_require_uppercase:boolean; password_require_lowercase:boolean; password_require_number:boolean; password_require_symbol:boolean; otp_lifetime_seconds:number; login_attempt_limit:number; login_lockout_seconds:number; allowed_redirect_origins:string[] };
export type RealAuthProviderConfig = { project_id: string; environment_id: string; provider: string; name: string; enabled: boolean; client_id?: string; client_secret_encrypted?: string; redirect_url: string; created_at: string; updated_at: string };

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
const defaults = (projectId: string, environmentId: string): RealAuthSettings => ({ project_id: projectId, environment_id: environmentId, require_email_verification: true, allow_signups: true, minimum_password_length: 8, require_mfa: false, maximum_sessions: 10, session_lifetime_seconds: 60 * 60 * 24 * 30, jwt_access_lifetime_seconds: config.auth.jwtAccessTokenTtlSeconds, refresh_token_lifetime_seconds: config.auth.jwtRefreshTokenTtlSeconds, magic_link_enabled:true, email_otp_enabled:true, phone_otp_enabled:false, anonymous_auth_enabled:false, passkeys_enabled:true, password_require_uppercase:false, password_require_lowercase:false, password_require_number:false, password_require_symbol:false, otp_lifetime_seconds:600, login_attempt_limit:10, login_lockout_seconds:900, allowed_redirect_origins:[] });
const providerDefinitions = [
  { provider: 'email', name: 'Email / Password', enabled: true },
  { provider: 'google', name: 'Google OAuth', enabled: false },
  { provider: 'github', name: 'GitHub OAuth', enabled: false },
  { provider: 'apple', name: 'Apple Sign-In', enabled: false },
  { provider: 'microsoft', name: 'Microsoft OAuth', enabled: false },
  { provider: 'discord', name: 'Discord OAuth', enabled: false },
] as const;

export class RealAuthRepository {
  private async ensureProviderConfigs(projectId: string, environmentId: string): Promise<void> {
    for (const item of providerDefinitions) {
      await postgres.execute(
        'INSERT INTO auth_provider_configs(project_id,environment_id,provider,name,enabled,redirect_url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,environment_id,provider) DO NOTHING',
        [projectId, environmentId, item.provider, item.name, item.enabled, config.publicUrl(`/api/auth/oauth/${item.provider}/callback`)],
      );
    }
  }

  public async listProviderConfigs(projectId: string, environmentId: string): Promise<RealAuthProviderConfig[]> {
    await this.ensureProviderConfigs(projectId, environmentId);
    return postgres.query<RealAuthProviderConfig>('SELECT * FROM auth_provider_configs WHERE project_id=$1 AND environment_id=$2 ORDER BY provider', [projectId, environmentId]);
  }

  public async getProviderConfig(projectId: string, environmentId: string, provider: string): Promise<RealAuthProviderConfig | null> {
    await this.ensureProviderConfigs(projectId, environmentId);
    return (await postgres.query<RealAuthProviderConfig>('SELECT * FROM auth_provider_configs WHERE project_id=$1 AND environment_id=$2 AND provider=$3', [projectId, environmentId, provider]))[0] || null;
  }

  public async updateProviderConfig(projectId: string, environmentId: string, provider: string, updates: Partial<Pick<RealAuthProviderConfig, 'enabled' | 'client_id' | 'client_secret_encrypted'>>): Promise<RealAuthProviderConfig | null> {
    if (!providerDefinitions.some((item) => item.provider === provider)) return null;
    const current = await this.getProviderConfig(projectId, environmentId, provider);
    if (!current) return null;
    const next = { ...current, ...updates };
    return (await postgres.query<RealAuthProviderConfig>('UPDATE auth_provider_configs SET enabled=$4,client_id=$5,client_secret_encrypted=$6,updated_at=now() WHERE project_id=$1 AND environment_id=$2 AND provider=$3 RETURNING *', [projectId, environmentId, provider, next.enabled, next.client_id || null, next.client_secret_encrypted || null]))[0] || null;
  }

  public async settings(projectId: string, environmentId: string): Promise<RealAuthSettings> {
    const current = (await postgres.query<RealAuthSettings>('SELECT * FROM auth_settings WHERE project_id=$1 AND environment_id=$2', [projectId, environmentId]))[0];
    if (current) return current;
    const value = defaults(projectId, environmentId);
    return (await postgres.query<RealAuthSettings>(`INSERT INTO auth_settings(project_id,environment_id,require_email_verification,allow_signups,minimum_password_length,require_mfa,maximum_sessions,session_lifetime_seconds,jwt_access_lifetime_seconds,refresh_token_lifetime_seconds,magic_link_enabled,email_otp_enabled,phone_otp_enabled,anonymous_auth_enabled,passkeys_enabled,password_require_uppercase,password_require_lowercase,password_require_number,password_require_symbol,otp_lifetime_seconds,login_attempt_limit,login_lockout_seconds,allowed_redirect_origins) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb) ON CONFLICT(project_id,environment_id) DO UPDATE SET project_id=EXCLUDED.project_id RETURNING *`, [value.project_id,value.environment_id,value.require_email_verification,value.allow_signups,value.minimum_password_length,value.require_mfa,value.maximum_sessions,value.session_lifetime_seconds,value.jwt_access_lifetime_seconds,value.refresh_token_lifetime_seconds,value.magic_link_enabled,value.email_otp_enabled,value.phone_otp_enabled,value.anonymous_auth_enabled,value.passkeys_enabled,value.password_require_uppercase,value.password_require_lowercase,value.password_require_number,value.password_require_symbol,value.otp_lifetime_seconds,value.login_attempt_limit,value.login_lockout_seconds,JSON.stringify(value.allowed_redirect_origins)]))[0];
  }

  public async updateSettings(projectId: string, environmentId: string, updates: Partial<RealAuthSettings>): Promise<RealAuthSettings> {
    const current = await this.settings(projectId, environmentId);
    const next = { ...current, ...updates, project_id: projectId, environment_id: environmentId };
    return (await postgres.query<RealAuthSettings>(`UPDATE auth_settings SET require_email_verification=$3,allow_signups=$4,minimum_password_length=$5,require_mfa=$6,maximum_sessions=$7,session_lifetime_seconds=$8,jwt_access_lifetime_seconds=$9,refresh_token_lifetime_seconds=$10,magic_link_enabled=$11,email_otp_enabled=$12,phone_otp_enabled=$13,anonymous_auth_enabled=$14,passkeys_enabled=$15,password_require_uppercase=$16,password_require_lowercase=$17,password_require_number=$18,password_require_symbol=$19,otp_lifetime_seconds=$20,login_attempt_limit=$21,login_lockout_seconds=$22,allowed_redirect_origins=$23::jsonb WHERE project_id=$1 AND environment_id=$2 RETURNING *`, [projectId,environmentId,next.require_email_verification,next.allow_signups,next.minimum_password_length,next.require_mfa,next.maximum_sessions,next.session_lifetime_seconds,next.jwt_access_lifetime_seconds,next.refresh_token_lifetime_seconds,next.magic_link_enabled,next.email_otp_enabled,next.phone_otp_enabled,next.anonymous_auth_enabled,next.passkeys_enabled,next.password_require_uppercase,next.password_require_lowercase,next.password_require_number,next.password_require_symbol,next.otp_lifetime_seconds,next.login_attempt_limit,next.login_lockout_seconds,JSON.stringify(next.allowed_redirect_origins || [])]))[0];
  }

  public async findUserByEmail(projectId: string, environmentId: string, email: string): Promise<RealAuthUser | null> { return (await postgres.query<RealAuthUser>('SELECT * FROM auth_users WHERE project_id=$1 AND environment_id=$2 AND email=$3', [projectId, environmentId, normalizeEmail(email)]))[0] || null; }
  public async findUserByPhone(projectId: string, environmentId: string, phone: string): Promise<RealAuthUser | null> { return (await postgres.query<RealAuthUser>('SELECT * FROM auth_users WHERE project_id=$1 AND environment_id=$2 AND phone=$3', [projectId, environmentId, phone]))[0] || null; }
  public async findUserById(userId: string): Promise<RealAuthUser | null> { return (await postgres.query<RealAuthUser>('SELECT * FROM auth_users WHERE id=$1', [userId]))[0] || null; }
  public async createUser(input: Omit<RealAuthUser, 'id' | 'created_at' | 'updated_at' | 'last_sign_in_at'>): Promise<RealAuthUser> {
    const user = { ...input, id: id('auth'), email: normalizeEmail(input.email) };
    return (await postgres.query<RealAuthUser>('INSERT INTO auth_users(id,project_id,environment_id,email,email_verified,display_name,avatar_url,password_hash,role,status,provider,user_metadata,app_metadata,phone,phone_verified,is_anonymous,custom_claims) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb) RETURNING *', [user.id,user.project_id,user.environment_id,user.email,user.email_verified,user.display_name,user.avatar_url || null,user.password_hash || null,user.role,user.status,user.provider,JSON.stringify(user.user_metadata || {}),JSON.stringify(user.app_metadata || {}),user.phone || null,Boolean(user.phone_verified),Boolean(user.is_anonymous),JSON.stringify(user.custom_claims || {})]))[0];
  }
  public async updateUser(userId: string, updates: Partial<Pick<RealAuthUser, 'password_hash' | 'status' | 'email_verified' | 'last_sign_in_at' | 'display_name' | 'avatar_url'>>): Promise<RealAuthUser | null> {
    const current = await this.findUserById(userId); if (!current) return null; const next = { ...current, ...updates };
    return (await postgres.query<RealAuthUser>('UPDATE auth_users SET password_hash=$2,status=$3,email_verified=$4,last_sign_in_at=$5,display_name=$6,avatar_url=$7,updated_at=now() WHERE id=$1 RETURNING *', [userId,next.password_hash || null,next.status,next.email_verified,next.last_sign_in_at || null,next.display_name,next.avatar_url || null]))[0] || null;
  }
  public async updateUserInScope(projectId: string, environmentId: string, userId: string, updates: Partial<Pick<RealAuthUser, 'password_hash' | 'status' | 'email_verified' | 'last_sign_in_at' | 'display_name' | 'avatar_url'>>): Promise<RealAuthUser | null> {
    const current = (await postgres.query<RealAuthUser>('SELECT * FROM auth_users WHERE id=$1 AND project_id=$2 AND environment_id=$3', [userId, projectId, environmentId]))[0];
    if (!current) return null;
    return this.updateUser(userId, updates);
  }
  public async listUsers(projectId: string, environmentId: string, search = ''): Promise<RealAuthUser[]> { return postgres.query<RealAuthUser>('SELECT * FROM auth_users WHERE project_id=$1 AND environment_id=$2 AND ($3=\'\' OR email ILIKE $4 OR display_name ILIKE $4) ORDER BY created_at DESC', [projectId, environmentId, search, `%${search}%`]); }
  public async deleteUser(userId: string): Promise<boolean> { return (await postgres.query<{ id: string }>('DELETE FROM auth_users WHERE id=$1 RETURNING id', [userId])).length > 0; }
  public async deleteUserInScope(projectId: string, environmentId: string, userId: string): Promise<boolean> { return (await postgres.query<{ id: string }>('DELETE FROM auth_users WHERE id=$1 AND project_id=$2 AND environment_id=$3 RETURNING id', [userId, projectId, environmentId])).length > 0; }

  public async createSession(input: { user_id: string; project_id: string; environment_id: string; expires_at: string; ip_address?: string; user_agent?: string; device_name?: string; auth_method?: string; mfa_verified_at?: string }): Promise<RealAuthSession> {
    const session = { ...input, id: id('sess') };
    return (await postgres.query<RealAuthSession>('INSERT INTO auth_sessions(id,user_id,project_id,environment_id,expires_at,ip_address,user_agent,device_name,auth_method,mfa_verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [session.id,session.user_id,session.project_id,session.environment_id,session.expires_at,session.ip_address || null,session.user_agent || null,session.device_name || null,session.auth_method || 'password',session.mfa_verified_at || null]))[0];
  }
  public async findSession(sessionId: string): Promise<RealAuthSession | null> { return (await postgres.query<RealAuthSession>('SELECT * FROM auth_sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at > now()', [sessionId]))[0] || null; }
  public async touchSession(sessionId: string): Promise<void> { await postgres.execute('UPDATE auth_sessions SET last_seen_at=now(),updated_at=now() WHERE id=$1 AND revoked_at IS NULL', [sessionId]); }
  public async revokeSession(sessionId: string): Promise<boolean> { return (await postgres.query<{ id: string }>('UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id', [sessionId])).length > 0; }
  public async revokeSessionInScope(projectId: string, environmentId: string, sessionId: string): Promise<boolean> { return (await postgres.query<{ id: string }>('UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE id=$1 AND project_id=$2 AND environment_id=$3 AND revoked_at IS NULL RETURNING id', [sessionId, projectId, environmentId])).length > 0; }
  public async revokeUserSessions(userId: string): Promise<number> { return (await postgres.query<{ id: string }>('UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL RETURNING id', [userId])).length; }
  public async listSessions(projectId: string, environmentId: string): Promise<RealAuthSession[]> { return postgres.query<RealAuthSession>('SELECT * FROM auth_sessions WHERE project_id=$1 AND environment_id=$2 ORDER BY created_at DESC', [projectId, environmentId]); }

  public async createRefreshToken(input: { session_id: string; user_id: string; project_id: string; environment_id: string; token_hash: string; family_id: string; expires_at: string }): Promise<void> { await postgres.execute('INSERT INTO auth_refresh_tokens(id,session_id,user_id,project_id,environment_id,token_hash,family_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id('rt'),input.session_id,input.user_id,input.project_id,input.environment_id,input.token_hash,input.family_id,input.expires_at]); }
  public async findRefreshToken(tokenHash: string): Promise<any | null> { return (await postgres.query<any>('SELECT * FROM auth_refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()', [tokenHash]))[0] || null; }
  public async findRefreshTokenAny(tokenHash: string): Promise<any | null> { return (await postgres.query<any>('SELECT * FROM auth_refresh_tokens WHERE token_hash=$1', [tokenHash]))[0] || null; }
  public async revokeRefreshToken(tokenId: string): Promise<void> { await postgres.execute('UPDATE auth_refresh_tokens SET revoked_at=now() WHERE id=$1', [tokenId]); }
  public async revokeRefreshFamily(familyId: string): Promise<void> { await postgres.execute('UPDATE auth_refresh_tokens SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL', [familyId]); }

  public async createVerificationToken(userId: string, projectId: string, environmentId: string, tokenHash: string, expiresAt: string): Promise<void> { await postgres.execute('INSERT INTO auth_verification_tokens(id,user_id,project_id,environment_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [id('verify'),userId,projectId,environmentId,tokenHash,expiresAt]); }
  public async consumeVerificationToken(tokenHash: string): Promise<any | null> { return (await postgres.query<any>('UPDATE auth_verification_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING *', [tokenHash]))[0] || null; }
  public async createPasswordResetToken(userId: string, projectId: string, environmentId: string, tokenHash: string, expiresAt: string): Promise<void> { await postgres.execute('INSERT INTO auth_password_reset_tokens(id,user_id,project_id,environment_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [id('reset'),userId,projectId,environmentId,tokenHash,expiresAt]); }
  public async findPasswordResetToken(tokenHash: string): Promise<any | null> { return (await postgres.query<any>('SELECT * FROM auth_password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()', [tokenHash]))[0] || null; }
  public async consumePasswordResetToken(tokenHash: string): Promise<any | null> { return (await postgres.query<any>('UPDATE auth_password_reset_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING *', [tokenHash]))[0] || null; }

  public async countActiveSessions(userId:string):Promise<number>{ const rows=await postgres.query<{count:string}>('SELECT count(*)::text AS count FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()',[userId]); return Number(rows[0]?.count||0); }
  public async revokeOldestSessions(userId:string, keep:number):Promise<number>{ if(keep<0) keep=0; const rows=await postgres.query<{id:string}>(`WITH victims AS (SELECT id FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC OFFSET $2) UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE id IN (SELECT id FROM victims) RETURNING id`,[userId,keep]); return rows.length; }
  public async revokeUserSessionsExcept(userId:string, sessionId:string):Promise<number>{ const rows=await postgres.query<{id:string}>(`UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL RETURNING id`,[userId,sessionId]); return rows.length; }

  public async createIdentity(input:{user_id:string;project_id:string;environment_id:string;provider:string;provider_user_id:string;provider_email?:string;metadata?:Record<string,unknown>}):Promise<RealAuthIdentity>{ return (await postgres.query<RealAuthIdentity>('INSERT INTO auth_identities(id,user_id,project_id,environment_id,provider,provider_user_id,provider_email,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(project_id,environment_id,provider,provider_user_id) DO UPDATE SET provider_email=EXCLUDED.provider_email,metadata=EXCLUDED.metadata,updated_at=now() RETURNING *',[id('ident'),input.user_id,input.project_id,input.environment_id,input.provider,input.provider_user_id,input.provider_email||null,JSON.stringify(input.metadata||{})]))[0]; }
  public async findIdentity(projectId:string,environmentId:string,provider:string,providerUserId:string):Promise<RealAuthIdentity|null>{ return (await postgres.query<RealAuthIdentity>('SELECT * FROM auth_identities WHERE project_id=$1 AND environment_id=$2 AND provider=$3 AND provider_user_id=$4',[projectId,environmentId,provider,providerUserId]))[0]||null; }
  public async listIdentities(userId:string):Promise<RealAuthIdentity[]>{ return postgres.query<RealAuthIdentity>('SELECT * FROM auth_identities WHERE user_id=$1 ORDER BY created_at',[userId]); }
  public async findIdentityById(userId:string,identityId:string):Promise<RealAuthIdentity|null>{ return (await postgres.query<RealAuthIdentity>('SELECT * FROM auth_identities WHERE id=$1 AND user_id=$2',[identityId,userId]))[0]||null; }
  public async deleteIdentity(userId:string,identityId:string):Promise<boolean>{ return (await postgres.query<{id:string}>('DELETE FROM auth_identities WHERE id=$1 AND user_id=$2 RETURNING id',[identityId,userId])).length>0; }

  public async createOneTimeCode(input:{project_id:string;environment_id:string;user_id?:string;purpose:string;destination:string;code_hash:string;redirect_url?:string;expires_at:string;max_attempts?:number}):Promise<void>{ await postgres.execute('INSERT INTO auth_one_time_codes(id,project_id,environment_id,user_id,purpose,destination,code_hash,redirect_url,expires_at,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id('otc'),input.project_id,input.environment_id,input.user_id||null,input.purpose,input.destination,input.code_hash,input.redirect_url||null,input.expires_at,input.max_attempts||5]); }
  public async consumeOneTimeCode(projectId:string,environmentId:string,purpose:string,destination:string,codeHash:string):Promise<any|null>{ const current=(await postgres.query<any>('SELECT * FROM auth_one_time_codes WHERE project_id=$1 AND environment_id=$2 AND purpose=$3 AND destination=$4 AND used_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1',[projectId,environmentId,purpose,destination]))[0]; if(!current) return null; if(current.attempts>=current.max_attempts) return null; if(current.code_hash!==codeHash){ await postgres.execute('UPDATE auth_one_time_codes SET attempts=attempts+1 WHERE id=$1',[current.id]); return null; } return (await postgres.query<any>('UPDATE auth_one_time_codes SET used_at=now() WHERE id=$1 AND used_at IS NULL RETURNING *',[current.id]))[0]||null; }

  public async createMfaFactor(userId:string,projectId:string,environmentId:string,type:string,secretEncrypted:string):Promise<any>{ return (await postgres.query<any>('INSERT INTO auth_mfa_factors(id,user_id,project_id,environment_id,type,secret_encrypted) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id('mfa'),userId,projectId,environmentId,type,secretEncrypted]))[0]; }
  public async getVerifiedMfaFactor(userId:string):Promise<any|null>{ return (await postgres.query<any>('SELECT * FROM auth_mfa_factors WHERE user_id=$1 AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 1',[userId]))[0]||null; }
  public async getPendingMfaFactor(userId:string):Promise<any|null>{ return (await postgres.query<any>('SELECT * FROM auth_mfa_factors WHERE user_id=$1 AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1',[userId]))[0]||null; }
  public async verifyMfaFactor(factorId:string):Promise<void>{ await postgres.execute('UPDATE auth_mfa_factors SET verified_at=now(),last_used_at=now() WHERE id=$1',[factorId]); }
  public async touchMfaFactor(factorId:string):Promise<void>{ await postgres.execute('UPDATE auth_mfa_factors SET last_used_at=now() WHERE id=$1',[factorId]); }
  public async deleteMfaFactors(userId:string):Promise<void>{ await postgres.execute('DELETE FROM auth_mfa_factors WHERE user_id=$1',[userId]); }
  public async deletePendingMfaFactors(userId:string):Promise<void>{ await postgres.execute('DELETE FROM auth_mfa_factors WHERE user_id=$1 AND verified_at IS NULL',[userId]); }
  public async deleteOtherMfaFactors(userId:string, factorId:string):Promise<void>{ await postgres.execute('DELETE FROM auth_mfa_factors WHERE user_id=$1 AND id<>$2',[userId,factorId]); }
  public async replaceMfaRecoveryCodes(userId:string,factorId:string,hashes:string[]):Promise<void>{ await postgres.transaction(async(client)=>{ await client.query('DELETE FROM auth_mfa_recovery_codes WHERE user_id=$1',[userId]); for(const codeHash of hashes) await client.query('INSERT INTO auth_mfa_recovery_codes(id,user_id,factor_id,code_hash) VALUES($1,$2,$3,$4)',[id('mrc'),userId,factorId,codeHash]); }); }
  public async consumeMfaRecoveryCode(userId:string,codeHash:string):Promise<boolean>{ return (await postgres.query<{id:string}>('UPDATE auth_mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id',[userId,codeHash])).length>0; }

  public async createPasskey(input:{user_id:string;project_id:string;environment_id:string;credential_id:string;public_key_jwk:Record<string,unknown>;sign_count:number;transports?:string[];device_name?:string}):Promise<AuthPasskey>{ return (await postgres.query<AuthPasskey>('INSERT INTO auth_passkeys(id,user_id,project_id,environment_id,credential_id,public_key_jwk,sign_count,transports,device_name) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9) RETURNING *',[id('pk'),input.user_id,input.project_id,input.environment_id,input.credential_id,JSON.stringify(input.public_key_jwk),input.sign_count,JSON.stringify(input.transports||[]),input.device_name||null]))[0]; }
  public async findPasskey(projectId:string,environmentId:string,credentialId:string):Promise<AuthPasskey|null>{ return (await postgres.query<AuthPasskey>('SELECT * FROM auth_passkeys WHERE project_id=$1 AND environment_id=$2 AND credential_id=$3',[projectId,environmentId,credentialId]))[0]||null; }
  public async listPasskeys(userId:string):Promise<AuthPasskey[]>{ return postgres.query<AuthPasskey>('SELECT * FROM auth_passkeys WHERE user_id=$1 ORDER BY created_at DESC',[userId]); }
  public async updatePasskeyCounter(idValue:string,count:number):Promise<void>{ await postgres.execute('UPDATE auth_passkeys SET sign_count=$2,last_used_at=now() WHERE id=$1',[idValue,count]); }
  public async deletePasskey(userId:string,passkeyId:string):Promise<boolean>{ return (await postgres.query<{id:string}>('DELETE FROM auth_passkeys WHERE id=$1 AND user_id=$2 RETURNING id',[passkeyId,userId])).length>0; }

  public async listRoles(projectId:string,environmentId:string):Promise<AuthCustomRole[]>{ return postgres.query<AuthCustomRole>('SELECT * FROM auth_custom_roles WHERE project_id=$1 AND environment_id=$2 ORDER BY name',[projectId,environmentId]); }
  public async findRole(projectId:string,environmentId:string,name:string):Promise<AuthCustomRole|null>{ return (await postgres.query<AuthCustomRole>('SELECT * FROM auth_custom_roles WHERE project_id=$1 AND environment_id=$2 AND name=$3',[projectId,environmentId,name]))[0]||null; }
  public async countUsersByRole(projectId:string,environmentId:string,name:string):Promise<number>{ const rows=await postgres.query<{count:string}>('SELECT count(*)::text AS count FROM auth_users WHERE project_id=$1 AND environment_id=$2 AND role=$3',[projectId,environmentId,name]); return Number(rows[0]?.count||0); }
  public async upsertRole(projectId:string,environmentId:string,name:string,description:string,claims:Record<string,unknown>):Promise<AuthCustomRole>{ return (await postgres.query<AuthCustomRole>('INSERT INTO auth_custom_roles(id,project_id,environment_id,name,description,claims) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(project_id,environment_id,name) DO UPDATE SET description=EXCLUDED.description,claims=EXCLUDED.claims,updated_at=now() RETURNING *',[id('role'),projectId,environmentId,name,description,JSON.stringify(claims||{})]))[0]; }
  public async deleteRole(projectId:string,environmentId:string,name:string):Promise<boolean>{ return (await postgres.query<{id:string}>('DELETE FROM auth_custom_roles WHERE project_id=$1 AND environment_id=$2 AND name=$3 RETURNING id',[projectId,environmentId,name])).length>0; }
  public async setUserAuthorization(projectId:string,environmentId:string,userId:string,role:string,claims:Record<string,unknown>):Promise<RealAuthUser|null>{ return (await postgres.query<RealAuthUser>('UPDATE auth_users SET role=$4,custom_claims=$5::jsonb,updated_at=now() WHERE id=$3 AND project_id=$1 AND environment_id=$2 RETURNING *',[projectId,environmentId,userId,role,JSON.stringify(claims||{})]))[0]||null; }
  public async updatePhone(userId:string,phone:string,verified:boolean):Promise<RealAuthUser|null>{ return (await postgres.query<RealAuthUser>('UPDATE auth_users SET phone=$2,phone_verified=$3,updated_at=now() WHERE id=$1 RETURNING *',[userId,phone,verified]))[0]||null; }
  public async convertAnonymousUser(userId:string,email:string,passwordHash:string,displayName?:string):Promise<RealAuthUser|null>{
    return (await postgres.query<RealAuthUser>(`UPDATE auth_users SET email=$2,email_verified=FALSE,password_hash=$3,display_name=COALESCE(NULLIF($4,''),display_name),provider='email',is_anonymous=FALSE,status='pending',updated_at=now() WHERE id=$1 AND is_anonymous=TRUE RETURNING *`,[userId,normalizeEmail(email),passwordHash,displayName||'']))[0]||null;
  }

}


export const realAuthRepository = new RealAuthRepository();
