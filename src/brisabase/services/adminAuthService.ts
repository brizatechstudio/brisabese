import { migrateLegacyAdminStorage } from '../../services/legacyBrowserState';
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'blocked' | 'pending';
  role: 'owner' | 'admin' | 'developer' | 'viewer' | 'billing';
  mfa_enabled: boolean;
  created_at: string;
  last_login_at?: string;
}

export interface AdminSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  session_id: string;
  user: AdminUser;
}

const TOKEN_KEY = 'brisabase.admin.access_token';
const REFRESH_TOKEN_KEY = 'brisabase.admin.refresh_token';
const EXPIRES_AT_KEY = 'brisabase.admin.expires_at';
const USER_KEY = 'brisabase.admin.user';

export class AdminAuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private accessTokenExpiresAt: number | null = null;
  private user: AdminUser | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    migrateLegacyAdminStorage();
    this.accessToken = window.sessionStorage.getItem(TOKEN_KEY);
    this.refreshToken = window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
    const persistedExpiry = Number(window.sessionStorage.getItem(EXPIRES_AT_KEY));
    this.accessTokenExpiresAt = Number.isFinite(persistedExpiry) && persistedExpiry > 0 ? persistedExpiry : null;
    const storedUser = window.localStorage.getItem(USER_KEY);
    if (storedUser) {
      try { this.user = JSON.parse(storedUser); } catch { this.user = null; }
    }
    if (this.accessToken && this.refreshToken) this.scheduleRefresh();
  }

  getAccessToken(): string | null { return this.accessToken; }
  getRefreshToken(): string | null { return this.refreshToken; }
  getUser(): AdminUser | null { return this.user; }
  isAuthenticated(): boolean { return Boolean(this.accessToken && this.user); }

  private persist(): void {
    if (this.accessToken) window.sessionStorage.setItem(TOKEN_KEY, this.accessToken);
    else window.sessionStorage.removeItem(TOKEN_KEY);
    if (this.refreshToken) window.sessionStorage.setItem(REFRESH_TOKEN_KEY, this.refreshToken);
    else window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    if (this.accessTokenExpiresAt) window.sessionStorage.setItem(EXPIRES_AT_KEY, String(this.accessTokenExpiresAt));
    else window.sessionStorage.removeItem(EXPIRES_AT_KEY);
    if (this.user) window.localStorage.setItem(USER_KEY, JSON.stringify(this.user));
    else window.localStorage.removeItem(USER_KEY);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.accessToken) return;
    // Refresh one minute before expiry. The fallback retains the default 15m
    // behavior for sessions issued by older servers without expires_in.
    const delay = this.accessTokenExpiresAt
      ? Math.max(0, this.accessTokenExpiresAt - Date.now() - 60_000)
      : 14 * 60 * 1000;
    this.refreshTimer = setTimeout(() => void this.refresh(), delay);
  }

  async signup(data: { email: string; password: string; name?: string; bootstrapToken?: string }): Promise<AdminUser> {
    const { bootstrapToken, ...body } = data;
    const res = await fetch('/api/admin/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bootstrapToken ? { 'x-admin-bootstrap-token': bootstrapToken } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: 'Signup failed.' } }));
      throw new Error(error.error?.message || 'Signup failed.');
    }
    return (await res.json()).user;
  }

  async login(email: string, password: string, totpCode?: string): Promise<AdminSession | { mfa_required: boolean; user_id: string }> {
    const res = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totp_code: totpCode }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: 'Login failed.' } }));
      throw new Error(error.error?.message || 'Login failed.');
    }
    const data = await res.json();
    if (data.mfa_required) return data;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.accessTokenExpiresAt = Number.isFinite(Number(data.expires_in))
      ? Date.now() + Number(data.expires_in) * 1000
      : null;
    this.user = data.user;
    this.persist();
    this.scheduleRefresh();
    return data;
  }

  async refresh(): Promise<boolean> {
    if (!this.refreshToken) {
      await this.logout();
      return false;
    }
    try {
      const res = await fetch('/api/admin/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(this.refreshToken ? { refresh_token: this.refreshToken } : {}),
      });
      if (!res.ok) { this.logout(); return false; }
      const data = await res.json();
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.accessTokenExpiresAt = Number.isFinite(Number(data.expires_in))
        ? Date.now() + Number(data.expires_in) * 1000
        : null;
      this.persist();
      this.scheduleRefresh();
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  async me(): Promise<AdminUser | null> {
    if (!this.accessToken) return null;
    try {
      if (this.accessTokenExpiresAt && Date.now() >= this.accessTokenExpiresAt - 60_000) {
        if (!await this.refresh()) return null;
      }
      const res = await fetch('/api/admin/auth/me', {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok) {
        if (!await this.refresh()) return null;
        const retried = await fetch('/api/admin/auth/me', { headers: { Authorization: `Bearer ${this.accessToken}` } });
        if (!retried.ok) return null;
        this.user = await retried.json();
        this.persist();
        return this.user;
      }
      this.user = await res.json();
      this.persist();
      return this.user;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}` },
        });
      } catch { /* idempotent */ }
    }
    this.accessToken = null;
    this.refreshToken = null;
    this.accessTokenExpiresAt = null;
    this.user = null;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.persist();
  }

  async requestPasswordReset(email: string): Promise<void> {
    const res = await fetch('/api/admin/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error('Password reset request failed.');
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const res = await fetch('/api/admin/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    if (!res.ok) throw new Error('Password reset failed.');
  }
}

export const adminAuthService = new AdminAuthService();
