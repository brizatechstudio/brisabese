import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/ui/Drawer';
import { Input } from '../components/ui/Input';
import { TableSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Shield,
  Key,
  Mail,
  MoreVertical,
  CheckCircle,
  XCircle,
  Trash2,
  Lock,
  Globe,
  ExternalLink,
  Edit2
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { AuthUser } from '../types';
import type { AuthProviderConfig } from '../brisabase/types';
import { isRealMode, realAuthService } from '../services/runtime';

export const Authentication: React.FC = () => {
  const { showToast, activeProject } = useApp();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<AuthProviderConfig[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  // Modal / Drawer States
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);

  // Form State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'Admin' | 'Developer' | 'Viewer'>('Developer');
  const [newProvider, setNewProvider] = useState<'email' | 'google' | 'github'>('email');
  const [isCreating, setIsCreating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [data, providerList] = await Promise.all([
        mockApi.getUsers(),
        isRealMode ? realAuthService.listProviders().catch(() => []) : Promise.resolve([])
      ]);
      setUsers(data);
      setProviders(providerList);
    } catch (error) {
      showToast('Auth indisponível', error instanceof Error ? error.message : 'Falha ao acessar o serviço de identidade.', 'error');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [activeProject?.id]);

  const providerEnabled = (name: string) => providers.find((provider) => provider.provider === name)?.enabled ?? !isRealMode;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    try {
      setIsCreating(true);
      const created = await mockApi.createUser({
        name: newName,
        email: newEmail,
        role: newRole,
        provider: newProvider
      });
      setUsers((prev) => [created, ...prev]);
      setIsNewUserModalOpen(false);
      setNewName('');
      setNewEmail('');
      showToast('Usuário cadastrado!', `${created.name} foi adicionado ao sistema de autenticação.`, 'success');
    } catch (err) {
      showToast('Erro ao criar usuário', 'Tente novamente', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStatus = async (user: AuthUser, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    const updated = await mockApi.updateUser(user.id, { status: newStatus });
    setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    showToast(
      newStatus === 'active' ? 'Usuário reativado' : 'Usuário suspenso',
      `O status de ${user.name} foi atualizado para ${newStatus}`,
      'info'
    );
  };

  const handleDeleteUser = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Deseja realmente excluir a conta de ${name}?`)) return;
    await mockApi.deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    if (selectedUser?.id === id) setIsUserDrawerOpen(false);
    showToast('Usuário removido', `${name} foi removido com sucesso.`, 'info');
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Autenticação & Usuários"
        subtitle={isRealMode ? 'Usuários, sessões, JWT, OAuth e políticas reais isoladas por projeto e ambiente.' : 'Gerenciamento simulado de identidades, sessões, tokens JWT e provedores OAuth.'}
        badge={
          <Badge variant={isRealMode ? 'success' : 'purple'} dot>
            {isRealMode ? 'BrisaAuth • REAL' : 'BrisaAuth • mock'}
          </Badge>
        }
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setIsNewUserModalOpen(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Novo Usuário
          </Button>
        }
      />

      {/* Auth Providers & Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Total de Contas</div>
            <div className="text-xl font-bold text-slate-100 mt-1">{users.length} usuários</div>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">Google OAuth</div>
            <div className={`text-xl font-bold mt-1 ${providerEnabled('google') ? 'text-emerald-400' : 'text-slate-500'}`}>{providerEnabled('google') ? 'Ativo' : 'Desativado'}</div>
          </div>
          <Badge variant={providerEnabled('google') ? 'success' : 'neutral'} size="sm">{providerEnabled('google') ? 'Configurado' : 'Off'}</Badge>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">GitHub OAuth</div>
            <div className={`text-xl font-bold mt-1 ${providerEnabled('github') ? 'text-emerald-400' : 'text-slate-500'}`}>{providerEnabled('github') ? 'Ativo' : 'Desativado'}</div>
          </div>
          <Badge variant={providerEnabled('github') ? 'success' : 'neutral'} size="sm">{providerEnabled('github') ? 'Configurado' : 'Off'}</Badge>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium">JWT & Sessões</div>
            <div className="text-xl font-bold text-cyan-400 mt-1">{isRealMode ? 'JWT • real' : 'RS256 • 24h'}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Users Table Panel */}
      <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail ou UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0B1628] border border-white/10 text-slate-100 text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0B1628] border border-white/10 text-slate-300 text-xs focus:outline-none focus:border-cyan-400"
            >
              <option value="all">Todas as Funções</option>
              <option value="Admin">Admin</option>
              <option value="Developer">Developer</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            variant="users"
            title="Nenhum usuário encontrado"
            description="Tente ajustar os filtros de busca ou crie uma nova conta."
            actionText="Cadastrar Usuário"
            onAction={() => setIsNewUserModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0B1628] text-slate-400 font-mono text-[11px] uppercase border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4">Usuário</th>
                  <th className="py-3 px-4">Provedor</th>
                  <th className="py-3 px-4">Função</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Último Acesso</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      setIsUserDrawerOpen(true);
                    }}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-xl object-cover ring-1 ring-white/10"
                        />
                        <div>
                          <div className="font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                            {user.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="capitalize font-mono text-slate-300">{user.provider}</span>
                    </td>

                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          user.role === 'Admin'
                            ? 'cyan'
                            : user.role === 'Developer'
                            ? 'primary'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {user.role}
                      </Badge>
                    </td>

                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          user.status === 'active'
                            ? 'success'
                            : user.status === 'suspended'
                            ? 'danger'
                            : 'warning'
                        }
                        size="sm"
                        dot
                      >
                        {user.status === 'active'
                          ? 'Ativo'
                          : user.status === 'suspended'
                          ? 'Suspenso'
                          : 'Convidado'}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px]">{user.lastLogin}</td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={(e) => handleToggleStatus(user, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/[0.06]"
                          title={user.status === 'active' ? 'Suspender Usuário' : 'Ativar Usuário'}
                        >
                          {user.status === 'active' ? (
                            <XCircle className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleDeleteUser(user.id, user.name, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                          title="Excluir Usuário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer: User Details & Sessions */}
      <Drawer
        isOpen={isUserDrawerOpen}
        onClose={() => setIsUserDrawerOpen(false)}
        title={selectedUser?.name || 'Detalhes do Usuário'}
        subtitle={`UID: ${selectedUser?.uid}`}
        footer={
          <Button variant="outline" size="sm" onClick={() => setIsUserDrawerOpen(false)}>
            Fechar
          </Button>
        }
      >
        {selectedUser && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#020617] border border-white/[0.08]">
              <img
                src={selectedUser.avatar}
                alt={selectedUser.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl object-cover ring-2 ring-cyan-400/40 shadow-lg"
              />
              <div>
                <h4 className="text-base font-bold text-slate-100">{selectedUser.name}</h4>
                <p className="text-xs text-cyan-400 font-mono">{selectedUser.email}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="primary" size="sm">
                    {selectedUser.role}
                  </Badge>
                  <Badge variant={selectedUser.status === 'active' ? 'success' : 'danger'} size="sm">
                    {selectedUser.status}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Informações de Segurança & Sessão
              </h4>
              <div className="p-4 rounded-xl bg-[#0B1628]/60 border border-white/[0.06] space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">UID do Usuário:</span>
                  <span className="font-mono text-slate-200">{selectedUser.uid}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Provedor de Login:</span>
                  <span className="font-mono text-cyan-300 capitalize">{selectedUser.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Criado em:</span>
                  <span className="text-slate-200">{selectedUser.createdAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Último Acesso:</span>
                  <span className="text-slate-200">{selectedUser.lastLogin}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Localização Detectada:</span>
                  <span className="text-slate-200">{selectedUser.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sessões Concorrentes:</span>
                  <span className="text-emerald-400 font-semibold">{selectedUser.sessionsCount} ativas</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Ações Administrativas
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!isRealMode) return showToast('Link de Redefinição', `Simulado para ${selectedUser.email}`, 'info');
                    try {
                      const response = await fetch('/api/auth/password-reset/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: localStorage.getItem('brisabase.projectId'), environmentId: localStorage.getItem('brisabase.environmentId'), email: selectedUser.email }) });
                      if (!response.ok) throw new Error('Falha ao solicitar reset.');
                      showToast('Recuperação solicitada', `Fluxo real iniciado para ${selectedUser.email}`, 'success');
                    } catch (error) { showToast('Falha no reset', error instanceof Error ? error.message : undefined, 'error'); }
                  }}
                >
                  Resetar Senha
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => handleDeleteUser(selectedUser.id, selectedUser.name, e)}
                >
                  Excluir Conta
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal: Create New User */}
      <Modal
        isOpen={isNewUserModalOpen}
        onClose={() => setIsNewUserModalOpen(false)}
        title="Cadastrar Novo Usuário"
        subtitle="Crie uma nova credencial no provedor de autenticação do BrisaBase."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsNewUserModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleCreateUser}
              isLoading={isCreating}
              disabled={!newName.trim() || !newEmail.trim()}
            >
              Criar Usuário
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Nome Completo"
            placeholder="ex: Mariana Souza"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Endereço de E-mail"
            type="email"
            placeholder="ex: mariana@empresa.com.br"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Função (RBAC)</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
              >
                <option value="Developer">Developer</option>
                <option value="Admin">Admin</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Provedor</label>
              <select
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value as any)}
                className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
              >
                <option value="email">E-mail / Senha</option>
                <option value="google">Google OAuth</option>
                <option value="github">GitHub OAuth</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};
