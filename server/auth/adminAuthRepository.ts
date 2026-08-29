import crypto from 'node:crypto';
import { postgres } from '../db/postgres';
import { hashPasswordAsync, hashToken, generateRandomToken, encryptSecret, decryptSecret, normalizeEmail } from './cryptoUtils';

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'blocked' | 'pending';
  role: 'owner' | 'admin' | 'developer' | 'viewer' | 'billing';
  password_hash?: string;
  mfa_secret_encrypted?: string;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
};

export type AdminSession = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
  last_seen_at: string;
  ip_address?: string;
  user_agent?: string;
  auth_method?: string;
  organization_id?: string;
};

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

export class AdminAuthRepository {
  public async countPasswordUsers(): Promise<number> {
    const row = (await postgres.query<{ count: string }>('SELECT count(*)::text AS count FROM users WHERE password_hash IS NOT NULL'))[0];
    return Number(row?.count || 0);
  }
  public async findUserByEmail(email: string): Promise<AdminUser | null> {
    return (await postgres.query<AdminUser>('SELECT * FROM users WHERE email=$1', [normalizeEmail(email)]))[0] || null;
  }

  public async findUserById(userId: string): Promise<AdminUser | null> {
    return (await postgres.query<AdminUser>('SELECT * FROM users WHERE id=$1', [userId]))[0] || null;
  }

  public async createUser(input: { email: string; name: string; password: string; role?: AdminUser['role'] }): Promise<AdminUser> {
    const user: AdminUser = {
      id: id('usr'),
      email: normalizeEmail(input.email),
      name: input.name,
      status: 'active',
      role: input.role || 'viewer',
      password_hash: await hashPasswordAsync(input.password),
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return (await postgres.query<AdminUser>('INSERT INTO users(id,email,name,status,role,password_hash,mfa_enabled,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [user.id,user.email,user.name,user.status,user.role,user.password_hash,user.mfa_enabled,user.created_at,user.updated_at]))[0];
  }

  public async claimPasswordlessUser(userId: string, input: { name: string; password: string; role: AdminUser['role'] }): Promise<AdminUser | null> {
    const passwordHash = await hashPasswordAsync(input.password);
    return (await postgres.query<AdminUser>(
      "UPDATE users SET name=$2,password_hash=$3,role=$4,status='active',updated_at=now() WHERE id=$1 AND password_hash IS NULL RETURNING *",
      [userId, input.name, passwordHash, input.role],
    ))[0] || null;
  }

  public async updateUser(userId: string, updates: Partial<Pick<AdminUser, 'password_hash' | 'status' | 'role' | 'mfa_secret_encrypted' | 'mfa_enabled' | 'last_login_at' | 'name'>>): Promise<AdminUser | null> {
    const current = await this.findUserById(userId);
    if (!current) return null;
    const next = { ...current, ...updates, updated_at: new Date().toISOString() };
    return (await postgres.query<AdminUser>('UPDATE users SET password_hash=$2,status=$3,role=$4,mfa_secret_encrypted=$5,mfa_enabled=$6,last_login_at=$7,name=$8,updated_at=$9 WHERE id=$1 RETURNING *', [userId,next.password_hash || null,next.status,next.role,next.mfa_secret_encrypted || null,next.mfa_enabled,next.last_login_at || null,next.name,next.updated_at]))[0] || null;
  }

  public async createSession(input: { user_id: string; expires_at: string; ip_address?: string; user_agent?: string; auth_method?: string; organization_id?: string }): Promise<{ session: AdminSession; refreshToken: string }> {
    const refreshToken = generateRandomToken(32);
    const session: AdminSession = {
      id: id('asess'),
      user_id: input.user_id,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: input.expires_at,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      ip_address: input.ip_address,
      user_agent: input.user_agent,
      auth_method: input.auth_method || 'password',
      organization_id: input.organization_id,
    };
    await postgres.execute('INSERT INTO admin_sessions(id,user_id,refresh_token_hash,expires_at,ip_address,user_agent,auth_method,organization_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [session.id,session.user_id,session.refresh_token_hash,session.expires_at,session.ip_address || null,session.user_agent || null,session.auth_method || 'password',session.organization_id || null]);
    await postgres.execute('INSERT INTO admin_refresh_tokens(id,session_id,user_id,token_hash,family_id,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [id('art'),session.id,session.user_id,hashToken(refreshToken),`fam_${crypto.randomUUID()}`,input.expires_at]);
    return { session, refreshToken };
  }

  public async findSession(sessionId: string): Promise<AdminSession | null> {
    return (await postgres.query<AdminSession>('SELECT * FROM admin_sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at > now()', [sessionId]))[0] || null;
  }

  public async touchSession(sessionId: string): Promise<void> {
    await postgres.execute('UPDATE admin_sessions SET last_seen_at=now() WHERE id=$1 AND revoked_at IS NULL', [sessionId]);
  }

  public async revokeSession(sessionId: string): Promise<boolean> {
    return (await postgres.query<{ id: string }>('UPDATE admin_sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id', [sessionId])).length > 0;
  }

  public async revokeUserSessions(userId: string): Promise<number> {
    return (await postgres.query<{ id: string }>('UPDATE admin_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL RETURNING id', [userId])).length;
  }

  public async findRefreshToken(tokenHash: string): Promise<any | null> {
    return (await postgres.query<any>('SELECT * FROM admin_refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()', [tokenHash]))[0] || null;
  }

  public async revokeRefreshToken(tokenId: string): Promise<void> {
    await postgres.execute('UPDATE admin_refresh_tokens SET revoked_at=now() WHERE id=$1', [tokenId]);
  }

  public async revokeRefreshFamily(familyId: string): Promise<void> {
    await postgres.execute('UPDATE admin_refresh_tokens SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL', [familyId]);
  }

  public async setMfaSecret(userId: string, secret: string): Promise<void> {
    await postgres.execute('UPDATE users SET mfa_secret_encrypted=$2 WHERE id=$1', [userId, encryptSecret(secret)]);
  }

  public async getMfaSecret(userId: string): Promise<string | null> {
    const user = await this.findUserById(userId);
    if (!user?.mfa_secret_encrypted) return null;
    return decryptSecret(user.mfa_secret_encrypted);
  }

  public async enableMfa(userId: string): Promise<void> {
    await postgres.execute('UPDATE users SET mfa_enabled=true WHERE id=$1', [userId]);
  }

  public async disableMfa(userId: string): Promise<void> {
    await postgres.execute('UPDATE users SET mfa_enabled=false,mfa_secret_encrypted=NULL WHERE id=$1', [userId]);
    await postgres.execute('DELETE FROM admin_mfa_recovery_codes WHERE user_id=$1', [userId]);
  }

  public async createRecoveryCodes(userId: string, hashedCodes: string[]): Promise<void> {
    for (const codeHash of hashedCodes) {
      await postgres.execute('INSERT INTO admin_mfa_recovery_codes(id,user_id,code_hash) VALUES($1,$2,$3)', [id('arc'),userId,codeHash]);
    }
  }

  public async verifyAndConsumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
    const rows = await postgres.query<{ id: string }>('UPDATE admin_mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id', [userId, codeHash]);
    return rows.length > 0;
  }
}

export const adminAuthRepository = new AdminAuthRepository();
