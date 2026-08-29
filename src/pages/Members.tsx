import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import {
  UserCheck,
  UserPlus,
  Shield,
  Trash2,
  Mail,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { TeamMember } from '../types';
import { useApp } from '../context/AppContext';
import { isRealMode } from '../services/runtime';

export const Members: React.FC = () => {
  const { showToast, activeProject } = useApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Admin' | 'Developer' | 'Viewer'>('Developer');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    mockApi.getMembers().then(setMembers).catch((error) => showToast('Equipe indisponível', error instanceof Error ? error.message : undefined, 'error'));
  }, [activeProject?.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;

    try {
      setIsInviting(true);
      const newMem = await mockApi.inviteMember(inviteName, inviteEmail, inviteRole);
      setMembers((prev) => [newMem, ...prev]);
      setIsInviteModalOpen(false);
      setInviteName('');
      setInviteEmail('');
      showToast('Convite Enviado!', `E-mail de acesso enviado para ${newMem.email}`, 'success');
    } catch (err) {
      showToast('Erro ao convidar', 'Tente novamente', 'error');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!window.confirm(`Remover ${name} da equipe?`)) return;
    try {
      await mockApi.removeMember(id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
      showToast('Membro removido', `${name} não tem mais acesso à organização`, 'info');
    } catch (error) { showToast('Falha ao remover membro', error instanceof Error ? error.message : undefined, 'error'); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Equipe & Controle de Acesso (RBAC)"
        subtitle="Gerencie desenvolvedores, administradores e permissões de acesso ao cluster BrisaBase."
        badge={
          <Badge variant="cyan" dot>
            {members.length} Membros • {isRealMode ? 'RBAC REAL' : 'mock'}
          </Badge>
        }
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setIsInviteModalOpen(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Convidar Membro
          </Button>
        }
      />

      {/* Members Table */}
      <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0B1628] text-slate-400 font-mono text-[11px] uppercase border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-4">Membro</th>
                <th className="py-3 px-4">Função</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Último Acesso</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {members.map((mem) => (
                <tr key={mem.id} className="hover:bg-white/[0.04] transition-colors">
                  <td className="py-3 px-4 flex items-center gap-3">
                    <img
                      src={mem.avatar}
                      alt={mem.name}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-xl object-cover ring-1 ring-white/10"
                    />
                    <div>
                      <div className="font-semibold text-slate-100">{mem.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{mem.email}</div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <Badge
                      variant={
                        mem.role === 'Owner'
                          ? 'danger'
                          : mem.role === 'Admin'
                          ? 'cyan'
                          : mem.role === 'Developer'
                          ? 'primary'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {mem.role}
                    </Badge>
                  </td>

                  <td className="py-3 px-4">
                    <Badge variant={mem.status === 'active' ? 'success' : 'warning'} size="sm" dot>
                      {mem.status === 'active' ? 'Ativo' : 'Convite Pendente'}
                    </Badge>
                  </td>

                  <td className="py-3 px-4 text-slate-400">{mem.lastAccess}</td>

                  <td className="py-3 px-4 text-right">
                    {mem.role !== 'Owner' && (
                      <button
                        onClick={() => void handleRemove(mem.id, mem.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Remover Membro"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Matrix */}
      <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Matriz de Permissões RBAC</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-[#0B1628] border border-white/[0.06] space-y-2">
            <div className="font-bold text-rose-400">Owner</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Acesso irrestrito a faturamento, exclusão do cluster, delegação de chaves e governança total.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0B1628] border border-white/[0.06] space-y-2">
            <div className="font-bold text-cyan-400">Admin</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Pode criar e editar coleções, configurar webhooks, gerenciar membros e gerar API Keys.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0B1628] border border-white/[0.06] space-y-2">
            <div className="font-bold text-blue-400">Developer</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Pode criar/editar documentos, realizar deploy de funções e inspecionar logs em tempo real.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0B1628] border border-white/[0.06] space-y-2">
            <div className="font-bold text-slate-300">Viewer</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Apenas visualização de dados, documentos e gráficos de telemetria sem permissão de escrita.
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Invite Member */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Convidar Membro para o Projeto"
        subtitle="O usuário receberá um convite por e-mail com acesso autenticado."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsInviteModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleInvite}
              isLoading={isInviting}
              disabled={!inviteName.trim() || !inviteEmail.trim()}
            >
              Enviar Convite
            </Button>
          </>
        }
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            label="Nome do Colega"
            placeholder="ex: Carlos Drummond"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="E-mail de Trabalho"
            type="email"
            placeholder="ex: carlos@suaempresa.com.br"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Função no Projeto</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
            >
              <option value="Developer">Developer (Desenvolvedor)</option>
              <option value="Admin">Admin (Administrador)</option>
              <option value="Viewer">Viewer (Somente Leitura)</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
};
