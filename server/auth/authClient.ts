export interface AuthResponse<T = any> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export class AuthClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(baseUrl = 'https://api.brisabase.dev/auth/v1') {
    this.baseUrl = baseUrl;
  }

  setTokens(accessToken: string | null, refreshToken: string | null) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  async signUp(params: {
    email: string;
    password: string;
    displayName?: string;
    projectId: string;
    environmentId: string;
    metadata?: Record<string, any>;
  }): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          password: params.password,
          display_name: params.displayName,
          project_id: params.projectId,
          environment_id: params.environmentId,
          user_metadata: params.metadata,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error };
      if (data.session) {
        this.setTokens(data.session.access_token, data.session.refresh_token);
      }
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async signIn(params: {
    email: string;
    password: string;
    projectId: string;
    environmentId: string;
    totpCode?: string;
  }): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: params.email,
          password: params.password,
          project_id: params.projectId,
          environment_id: params.environmentId,
          totp_code: params.totpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error };
      if (data.session) {
        this.setTokens(data.session.access_token, data.session.refresh_token);
      }
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async signOut(): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
      });
      const data = await res.json();
      this.setTokens(null, null);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async refreshSession(): Promise<AuthResponse> {
    if (!this.refreshToken) {
      return { data: null, error: { code: 'NO_REFRESH_TOKEN', message: 'Nenhum Refresh Token fornecido' } };
    }
    try {
      const res = await fetch(`${this.baseUrl}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error };
      if (data.session) {
        this.setTokens(data.session.access_token, data.session.refresh_token);
      }
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async getUser(): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/user`, {
        method: 'GET',
        headers: {
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async getSession(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  async resetPassword(email: string, projectId: string, environmentId: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, project_id: projectId, environment_id: environmentId }),
      });
      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/password/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async verifyEmail(token: string): Promise<AuthResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) return { data: null, error: data.error };
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { code: 'CLIENT_ERROR', message: err.message } };
    }
  }

  async signInWithOAuth(provider: string, projectId: string, environmentId: string): Promise<string> {
    return `${this.baseUrl}/oauth/${provider}?project_id=${projectId}&environment_id=${environmentId}`;
  }
}
