import React, { useEffect, useMemo, useState } from 'react';
import { authService } from '../services';
import { AuthCustomRole, AuthProviderConfig, AuthSessionInfo, AuthSettings, AuthUser } from '../types';
import { AuthPolicy } from '../mocks/mockAuth';
import { MetricCard } from '../components/common/MetricCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { UserDetailModal } from '../components/auth/UserDetailModal';
import { ProviderConfigModal } from '../components/auth/ProviderConfigModal';
import { safeAvatarUrl } from '../utils/avatar';
import { Users, Key, ShieldCheck, Search, Lock, Globe, Settings, Smartphone, Save, Trash2, RefreshCw, UserCog, Plus } from 'lucide-react';

type AuthTab = 'users' | 'providers' | 'sessions' | 'roles' | 'settings' | 'policies';
const defaultSettings: AuthSettings = {
  require_email_verification: true, allow_signups: true, minimum_password_length: 8, require_mfa: false, maximum_sessions: 10,
  session_lifetime_seconds: 2592000, jwt_access_lifetime_seconds: 900, refresh_token_lifetime_seconds: 2592000,
  magic_link_enabled: true, email_otp_enabled: true, phone_otp_enabled: false, anonymous_auth_enabled: false, passkeys_enabled: true,
  password_require_uppercase: false, password_require_lowercase: false, password_require_number: false, password_require_symbol: false,
  otp_lifetime_seconds: 600, login_attempt_limit: 10, login_lockout_seconds: 900, allowed_redirect_origins: [],
};

export const AuthPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AuthTab>('users');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [providers, setProviders] = useState<AuthProviderConfig[]>([]);
  const [sessions, setSessions] = useState<AuthSessionInfo[]>([]);
  const [roles, setRoles] = useState<AuthCustomRole[]>([]);
  const [policies, setPolicies] = useState<AuthPolicy[]>([]);
  const [settings, setSettings] = useState<AuthSettings>(defaultSettings);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<AuthProviderConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleClaims, setRoleClaims] = useState('{}');

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [u, p, s, r, a, pol] = await Promise.all([
        authService.listUsers(), authService.listProviders(), authService.listSessions(), authService.listRoles(), authService.getSettings(), authService.listPolicies(),
      ]);
      setUsers(u); setProviders(p); setSessions(s); setRoles(r); setSettings(a); setPolicies(pol);
    } catch (err: any) { setError(err.message || 'Não foi possível carregar os dados de autenticação.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadData(); }, []);

  const filteredUsers = useMemo(() => users.filter((u) => `${u.name} ${u.email} ${u.phone || ''}`.toLowerCase().includes(searchTerm.toLowerCase())), [users, searchTerm]);
  const activeSessions = sessions.filter(s => s.status === 'active').length;

  const handleToggleBlockUser = async (id: string) => { await authService.toggleUserBlockStatus(id); await loadData(); };
  const handleDeleteUser = async (id: string) => { await authService.deleteUser(id); await loadData(); };
  const handleAuthorization = async (id: string, role: string, claims: Record<string, unknown>) => { await authService.updateUserAuthorization(id, role, claims); await loadData(); };
  const handleToggleProvider = async (id: string, enabled: boolean) => { await authService.toggleProvider(id, enabled); await loadData(); };
  const handleSaveProviderKeys = async (id: string, clientId: string, clientSecret: string) => { await authService.updateProviderConfig(id, { clientId, clientSecret }); await loadData(); };
  const updateSetting = <K extends keyof AuthSettings>(key: K, value: AuthSettings[K]) => setSettings(prev => ({ ...prev, [key]: value }));
  const saveSettings = async () => { try { setSavingSettings(true); setError(null); setSettings(await authService.updateSettings(settings)); } catch (err: any) { setError(err.message || 'Falha ao salvar configurações.'); } finally { setSavingSettings(false); } };
  const createRole = async () => { try { const parsed = roleClaims.trim() ? JSON.parse(roleClaims) : {}; if (!roleName.trim()) throw new Error('Informe o nome da role.'); await authService.saveRole(roleName.trim(), roleDescription.trim(), parsed); setRoleName(''); setRoleDescription(''); setRoleClaims('{}'); await loadData(); } catch (err: any) { setError(err.message || 'Falha ao salvar role.'); } };

  const tabs: Array<{id: AuthTab; label: string; icon: React.ComponentType<{className?: string}>}> = [
    { id:'users', label:'Usuários', icon:Users }, { id:'providers', label:'Provedores', icon:Key }, { id:'sessions', label:'Sessões', icon:Lock },
    { id:'roles', label:'Roles & Claims', icon:UserCog }, { id:'settings', label:'Segurança', icon:Settings }, { id:'policies', label:'Policies RLS', icon:ShieldCheck },
  ];

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
      <div><h1 className="text-xl font-bold text-slate-100 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-purple-400" />Autenticação & Segurança</h1><p className="text-xs text-slate-400 mt-1">Email/senha, OAuth, MFA, Magic Link, OTP, passkeys, sessões, JWT, RBAC, claims e RLS por projeto/ambiente.</p></div>
      <button onClick={()=>void loadData()} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="w-3.5 h-3.5" />Atualizar</button>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard title="Usuários" value={loading?'...':String(users.length)} badge="Projeto atual" badgeType="neutral" icon={Users}/>
      <MetricCard title="Provedores ativos" value={loading?'...':String(providers.filter(p=>p.enabled).length)} badge="OAuth / Email" badgeType="neutral" icon={Globe}/>
      <MetricCard title="Sessões ativas" value={loading?'...':String(activeSessions)} badge={settings.maximum_sessions ? `máx. ${settings.maximum_sessions}/usuário` : '—'} badgeType="neutral" icon={Smartphone}/>
      <MetricCard title="MFA obrigatório" value={settings.require_mfa?'Sim':'Não'} badge={settings.passkeys_enabled?'Passkeys ativas':'TOTP'} badgeType="neutral" icon={ShieldCheck}/>
    </div>

    {error && <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">{error}</div>}

    <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 text-xs font-medium">
      {tabs.map(tab=>{const Icon=tab.icon;const active=activeTab===tab.id;return <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl border-t border-x shrink-0 ${active?'border-purple-500/50 bg-slate-900 text-white':'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'}`}><Icon className="w-4 h-4 text-purple-400" />{tab.label}</button>;})}
    </div>

    {activeTab==='users' && <div className="space-y-4">
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800"><div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone..." className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"/></div></div>
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400"><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Provedor</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Último login</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-800/60">{filteredUsers.map(u=><tr key={u.id} className="hover:bg-slate-800/30"><td className="px-4 py-3"><div className="flex items-center gap-3"><img src={safeAvatarUrl(u.avatarUrl,u.name)} className="w-8 h-8 rounded-full border border-slate-700" alt={u.name}/><div><p className="font-semibold text-slate-200">{u.name || 'Sem nome'}</p><p className="text-[11px] text-slate-400 font-mono">{u.email || u.phone || 'anônimo'}</p></div></div></td><td className="px-4 py-3"><span className="capitalize bg-slate-800 px-2 py-1 rounded text-slate-300">{u.provider}</span></td><td className="px-4 py-3"><span className="text-purple-300 bg-purple-950/60 px-2 py-1 rounded">{u.role}</span></td><td className="px-4 py-3 text-slate-400">{u.lastSignInAt}</td><td className="px-4 py-3"><StatusBadge status={u.status}/></td><td className="px-4 py-3 text-right"><button onClick={()=>setSelectedUser(u)} className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-700">Gerenciar</button></td></tr>)}</tbody></table></div>
    </div>}

    {activeTab==='providers' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{providers.map(p=>{const oauth=p.provider!=='email';return <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-100">{p.name}</h3><p className="text-[11px] text-slate-500 mt-1">{oauth?(p.clientSecretConfigured?'Credenciais configuradas':'Credenciais pendentes'):'Credenciais gerenciadas pelo Auth Engine'}</p></div><button onClick={()=>void handleToggleProvider(p.id,!p.enabled)} className={`relative h-6 w-11 rounded-full ${p.enabled?'bg-purple-600':'bg-slate-800'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${p.enabled?'left-5':'left-0.5'}`}/></button></div>{oauth?<><div className="rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] text-slate-400 break-all">{p.redirectUrl}</div><button onClick={()=>setSelectedProvider(p)} className="w-full rounded-lg border border-purple-700/40 bg-purple-950/30 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-900/40">Configurar OAuth</button></>:<div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">Use a aba Segurança para política de senha, verificação de e-mail e métodos passwordless.</div>}</div>;})}</div>}

    {activeTab==='sessions' && <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400"><th className="px-4 py-3">Dispositivo</th><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Método</th><th className="px-4 py-3">MFA</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">Expira</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-800/60">{sessions.map(s=><tr key={s.id}><td className="px-4 py-3"><p className="text-slate-200">{s.deviceName}</p><p className="text-[10px] text-slate-500 max-w-xs truncate">{s.userAgent}</p></td><td className="px-4 py-3 font-mono text-slate-400">{s.userId.slice(0,12)}…</td><td className="px-4 py-3 text-slate-300">{s.authMethod||'password'}</td><td className="px-4 py-3">{s.mfaVerified?<span className="text-emerald-300">Verificado</span>:<span className="text-slate-500">Não</span>}</td><td className="px-4 py-3 font-mono text-slate-400">{s.ipAddress}</td><td className="px-4 py-3 text-slate-400">{new Date(s.expiresAt).toLocaleString('pt-BR')}</td><td className="px-4 py-3 text-right">{s.status==='active'?<button onClick={async()=>{await authService.revokeSession(s.id);await loadData();}} className="rounded-lg border border-rose-800/50 px-3 py-1.5 text-rose-300 hover:bg-rose-950">Revogar</button>:<span className="text-slate-600">Revogada</span>}</td></tr>)}</tbody></table></div>}

    {activeTab==='roles' && <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5"><div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400"><th className="px-4 py-3">Role</th><th className="px-4 py-3">Descrição</th><th className="px-4 py-3">Claims padrão</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-slate-800">{roles.map(r=><tr key={r.id}><td className="px-4 py-3 font-mono text-purple-300">{r.name}</td><td className="px-4 py-3 text-slate-400">{r.description||'—'}</td><td className="px-4 py-3"><code className="text-[10px] text-cyan-300">{JSON.stringify(r.claims)}</code></td><td className="px-4 py-3 text-right"><button onClick={async()=>{await authService.deleteRole(r.name);await loadData();}} className="p-1.5 text-rose-400 hover:bg-rose-950 rounded"><Trash2 className="w-4 h-4"/></button></td></tr>)}</tbody></table></div><div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3"><h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><Plus className="w-4 h-4 text-purple-400"/>Nova role</h3><input value={roleName} onChange={e=>setRoleName(e.target.value)} placeholder="editor" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"/><input value={roleDescription} onChange={e=>setRoleDescription(e.target.value)} placeholder="Descrição" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"/><textarea value={roleClaims} onChange={e=>setRoleClaims(e.target.value)} rows={6} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200"/><button onClick={()=>void createRole()} className="w-full rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white">Salvar role</button></div></div>}

    {activeTab==='settings' && <div className="space-y-5"><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{[
      ['allow_signups','Permitir novos cadastros'],['require_email_verification','Exigir verificação de e-mail'],['require_mfa','Exigir MFA'],['magic_link_enabled','Magic Link'],['email_otp_enabled','OTP por e-mail'],['phone_otp_enabled','OTP por telefone'],['anonymous_auth_enabled','Auth anônimo'],['passkeys_enabled','Passkeys / WebAuthn'],['password_require_uppercase','Senha: maiúscula'],['password_require_lowercase','Senha: minúscula'],['password_require_number','Senha: número'],['password_require_symbol','Senha: símbolo']
    ].map(([key,label])=><label key={key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-300"><span>{label}</span><input type="checkbox" checked={Boolean(settings[key as keyof AuthSettings])} onChange={e=>updateSetting(key as keyof AuthSettings,e.target.checked as never)} className="accent-purple-600"/></label>)}</div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">{[
        ['minimum_password_length','Mínimo da senha'],['maximum_sessions','Sessões por usuário'],['otp_lifetime_seconds','TTL OTP (s)'],['login_attempt_limit','Tentativas de login'],['login_lockout_seconds','Bloqueio login (s)'],['jwt_access_lifetime_seconds','TTL Access JWT (s)'],['session_lifetime_seconds','TTL sessão (s)'],['refresh_token_lifetime_seconds','TTL Refresh (s)']
      ].map(([key,label])=><label key={key} className="text-[11px] text-slate-400">{label}<input type="number" min={1} value={Number(settings[key as keyof AuthSettings])} onChange={e=>updateSetting(key as keyof AuthSettings,Number(e.target.value) as never)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"/></label>)}</div>
      <label className="block text-[11px] text-slate-400">Origens adicionais permitidas para redirects (uma por linha)<textarea value={(settings.allowed_redirect_origins||[]).join('\n')} onChange={e=>updateSetting('allowed_redirect_origins',e.target.value.split('\n').map(v=>v.trim()).filter(Boolean))} rows={4} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200"/></label>
      <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/20 p-4 text-xs text-cyan-200"><strong>Hardening ativo:</strong> refresh tokens rotativos, cookies HttpOnly/Secure conforme ambiente, bloqueio por tentativas, OAuth state vinculado ao navegador, secrets criptografados, suporte a rotação de JWT/encryption keys, CSP/CORS e auditoria de eventos Auth.</div>
      <button disabled={savingSettings} onClick={()=>void saveSettings()} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="w-4 h-4"/>{savingSettings?'Salvando...':'Salvar configurações'}</button>
    </div>}

    {activeTab==='policies' && <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400"><th className="px-4 py-3">Tabela</th><th className="px-4 py-3">Policy</th><th className="px-4 py-3">Ação</th><th className="px-4 py-3">Expressão</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-800">{policies.map(p=><tr key={p.id}><td className="px-4 py-3 font-mono text-cyan-300">{p.table}</td><td className="px-4 py-3 text-slate-200">{p.name}</td><td className="px-4 py-3 text-purple-300">{p.action}</td><td className="px-4 py-3 font-mono text-[10px] text-slate-400">{p.expression}</td><td className="px-4 py-3">{p.enabled?<span className="text-emerald-300">Ativa</span>:<span className="text-slate-500">Inativa</span>}</td></tr>)}</tbody></table><div className="border-t border-slate-800 p-3 text-[11px] text-slate-500">Criação e edição avançada de policies permanecem no módulo Database/RLS; aqui a visão é integrada ao Auth.</div></div>}

    {selectedUser && <UserDetailModal user={selectedUser} roles={roles} onClose={()=>setSelectedUser(null)} onToggleBlock={handleToggleBlockUser} onDelete={handleDeleteUser} onUpdateAuthorization={handleAuthorization}/>}
    {selectedProvider && <ProviderConfigModal provider={selectedProvider} onClose={()=>setSelectedProvider(null)} onSave={handleSaveProviderKeys}/>}
  </div>;
};
