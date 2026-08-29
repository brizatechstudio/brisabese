import { AuthUser, AuthProviderConfig } from '../types';

export const INITIAL_AUTH_USERS: AuthUser[] = [
  {
    id: 'usr_101a89b',
    name: 'Lucas Silva',
    email: 'lucas@email.com',
    avatarUrl: '',
    provider: 'google',
    status: 'active',
    role: 'admin',
    lastSignInAt: '2026-08-04 09:30:12',
    createdAt: '2025-11-12 10:00:00'
  },
  {
    id: 'usr_202b90c',
    name: 'Maria Souza',
    email: 'maria@email.com',
    avatarUrl: '',
    provider: 'email',
    status: 'active',
    role: 'user',
    lastSignInAt: '2026-08-04 08:15:00',
    createdAt: '2025-12-01 14:20:00'
  },
  {
    id: 'usr_303c01d',
    name: 'João Santos',
    email: 'joao@email.com',
    avatarUrl: '',
    provider: 'github',
    status: 'blocked',
    role: 'user',
    lastSignInAt: '2026-07-28 18:40:11',
    createdAt: '2026-01-10 11:30:00'
  },
  {
    id: 'usr_404d12e',
    name: 'Ana Oliveira',
    email: 'ana@email.com',
    avatarUrl: '',
    provider: 'apple',
    status: 'active',
    role: 'moderator',
    lastSignInAt: '2026-08-03 22:10:05',
    createdAt: '2026-02-18 09:00:00'
  },
  {
    id: 'usr_505e23f',
    name: 'Carlos Ferreira',
    email: 'carlos@email.com',
    avatarUrl: '',
    provider: 'discord',
    status: 'active',
    role: 'user',
    lastSignInAt: '2026-08-04 06:45:30',
    createdAt: '2026-03-05 16:15:00'
  }
];

export const INITIAL_PROVIDERS: AuthProviderConfig[] = [
  { id: 'prov_email', name: 'Email / Senha', provider: 'email', enabled: true, redirectUrl: 'https://auth.brisabase.dev/callback/email' },
  { id: 'prov_google', name: 'Google OAuth', provider: 'google', enabled: true, clientId: '839201923812-googleusercontent.com', clientSecretConfigured: true, redirectUrl: 'https://auth.brisabase.dev/callback/google' },
  { id: 'prov_github', name: 'GitHub OAuth', provider: 'github', enabled: true, clientId: 'gh_client_891023a1', clientSecretConfigured: true, redirectUrl: 'https://auth.brisabase.dev/callback/github' },
  { id: 'prov_apple', name: 'Apple Sign-In', provider: 'apple', enabled: false, clientId: 'com.brisabase.app', clientSecretConfigured: false, redirectUrl: 'https://auth.brisabase.dev/callback/apple' },
  { id: 'prov_microsoft', name: 'Microsoft Azure AD', provider: 'microsoft', enabled: false, clientId: '', clientSecretConfigured: false, redirectUrl: 'https://auth.brisabase.dev/callback/microsoft' },
  { id: 'prov_discord', name: 'Discord OAuth', provider: 'discord', enabled: true, clientId: '109283012938102', clientSecretConfigured: true, redirectUrl: 'https://auth.brisabase.dev/callback/discord' }
];

export interface AuthSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  startedAt: string;
  expiresAt: string;
}

export const MOCK_AUTH_SESSIONS: AuthSession[] = [
  { id: 'sess_991a', userId: 'usr_101a89b', userName: 'Lucas Silva', userEmail: 'lucas@email.com', ipAddress: '189.120.45.12', userAgent: 'Chrome 127.0.0 (macOS)', startedAt: '2026-08-04 09:30:12', expiresAt: '2026-08-11 09:30:12' },
  { id: 'sess_992b', userId: 'usr_202b90c', userName: 'Maria Souza', userEmail: 'maria@email.com', ipAddress: '200.180.99.201', userAgent: 'Safari 17.4 (iOS)', startedAt: '2026-08-04 08:15:00', expiresAt: '2026-08-11 08:15:00' },
  { id: 'sess_993c', userId: 'usr_404d12e', userName: 'Ana Oliveira', userEmail: 'ana@email.com', ipAddress: '177.30.12.88', userAgent: 'Firefox 128.0 (Windows)', startedAt: '2026-08-03 22:10:05', expiresAt: '2026-08-10 22:10:05' }
];

export interface AuthPolicy {
  id: string;
  table: string;
  name: string;
  action: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  roleTarget: string;
  expression: string;
  enabled: boolean;
}

export const MOCK_RLS_POLICIES: AuthPolicy[] = [
  { id: 'pol_1', table: 'profiles', name: 'Public profiles read access', action: 'SELECT', roleTarget: 'public', expression: 'true', enabled: true },
  { id: 'pol_2', table: 'profiles', name: 'Users can update own profile', action: 'UPDATE', roleTarget: 'authenticated', expression: 'auth.uid() = user_id', enabled: true },
  { id: 'pol_3', table: 'orders', name: 'Users view own orders', action: 'SELECT', roleTarget: 'authenticated', expression: 'auth.uid() = user_id', enabled: true },
  { id: 'pol_4', table: 'messages', name: 'Authenticated chat insert', action: 'INSERT', roleTarget: 'authenticated', expression: 'auth.uid() = sender_id', enabled: true }
];
