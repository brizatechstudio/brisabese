import React, { useState, useEffect } from 'react';
import { teamService } from '../services';
import { TeamMember } from '../types';
import { InviteMemberModal } from '../components/team/InviteMemberModal';
import { StatusBadge } from '../components/common/StatusBadge';
import { UsersRound, Plus, Mail, Shield, Trash2, CheckCircle2 } from 'lucide-react';
import { safeAvatarUrl } from '../utils/avatar';

export const TeamPage: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      const list = await teamService.listMembers();
      setMembers(list);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os membros da equipe.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInvite = async (email: string, role: TeamMember['role']) => {
    await teamService.inviteMember(email, role);
    await loadData();
  };

  const handleRemove = async (memberId: string) => {
    await teamService.removeMember(memberId);
    await loadData();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <UsersRound className="w-5 h-5 text-purple-400" />
            Equipe, Colaboradores & Permissões RBAC
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie engenheiros, desenvolvedores e administradores com acesso ao projeto BrisaBase.
          </p>
        </div>

        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-lg shadow-purple-900/40 transition-all"
        >
          <Plus className="w-4 h-4" />
          Convidar Membro
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {members.map((m) => (
          <div
            key={m.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={safeAvatarUrl(m.avatarUrl, m.name)}
                    alt={m.name}
                    className="w-10 h-10 rounded-full object-cover border border-purple-500/30"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{m.name}</h3>
                    <p className="text-xs text-slate-400 font-mono truncate max-w-[150px]">{m.email}</p>
                  </div>
                </div>
                <StatusBadge status={m.status} />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
                <span className="text-slate-500 font-semibold uppercase text-[10px]">Função</span>
                <span className="font-bold text-purple-300 font-mono">{m.role}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
              <span>Adicionado: {m.addedAt}</span>
              {m.role !== 'Owner' && (
                <button
                  onClick={() => handleRemove(m.id)}
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                  title="Remover Membro"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invite Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  );
};
