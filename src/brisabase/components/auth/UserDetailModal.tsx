import React, { useEffect, useState } from 'react';
import { AuthCustomRole, AuthUser } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { X, Shield, Calendar, Key, Ban, Trash2, Save } from 'lucide-react';
import { safeAvatarUrl } from '../../utils/avatar';

interface UserDetailModalProps {
  user: AuthUser;
  roles?: AuthCustomRole[];
  onClose: () => void;
  onToggleBlock: (userId: string) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
  onUpdateAuthorization: (userId: string, role: string, claims: Record<string, unknown>) => Promise<void>;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({ user, roles = [], onClose, onToggleBlock, onDelete, onUpdateAuthorization }) => {
  const [role, setRole] = useState(user.role || 'user');
  const [claims, setClaims] = useState(JSON.stringify(user.customClaims || {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRole(user.role || 'user');
    setClaims(JSON.stringify(user.customClaims || {}, null, 2));
    setError(null);
  }, [user]);

  const saveAuthorization = async () => {
    try {
      const parsed = claims.trim() ? JSON.parse(claims) : {};
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Claims devem ser um objeto JSON.');
      setSaving(true); setError(null);
      await onUpdateAuthorization(user.id, role.trim() || 'user', parsed);
      onClose();
    } catch (err: any) { setError(err.message || 'Não foi possível salvar a autorização.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <img src={safeAvatarUrl(user.avatarUrl, user.name)} alt={user.name} className="w-12 h-12 rounded-full object-cover border-2 border-purple-500/30" />
            <div><h3 className="text-sm font-bold text-slate-100">{user.name}</h3><p className="text-xs text-slate-400">{user.email || user.phone || 'Usuário anônimo'}</p></div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-1"><span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1"><Shield className="w-3 h-3 text-purple-400" />Role</span><span className="font-semibold text-slate-200">{user.role}</span></div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-1"><span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1"><Key className="w-3 h-3 text-cyan-400" />Provedor</span><span className="font-semibold text-slate-200 capitalize">{user.provider}</span></div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-1"><span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1"><Calendar className="w-3 h-3 text-emerald-400" />Último Login</span><span className="font-semibold text-slate-200">{user.lastSignInAt}</span></div>
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-1"><span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Status</span><div><StatusBadge status={user.status} /></div></div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div><h4 className="text-xs font-semibold text-slate-200">Autorização JWT / RLS</h4><p className="text-[11px] text-slate-500 mt-1">Role e claims customizadas entram no token e podem ser usadas em policies RLS.</p></div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="text-[11px] text-slate-400">Role</label><input list="brisabase-auth-roles" value={role} onChange={(e)=>setRole(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100" /><datalist id="brisabase-auth-roles">{['user','authenticated','admin','moderator',...roles.map(r=>r.name)].filter((v,i,a)=>a.indexOf(v)===i).map(r=><option key={r} value={r}/>)}</datalist></div>
            <div><label className="text-[11px] text-slate-400">Claims JSON</label><textarea value={claims} onChange={(e)=>setClaims(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100" /></div>
          </div>
          {error && <div className="text-xs text-rose-300">{error}</div>}
          <button disabled={saving} onClick={saveAuthorization} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50"><Save className="w-3.5 h-3.5" />{saving ? 'Salvando...' : 'Salvar autorização'}</button>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button onClick={async()=>{await onDelete(user.id);onClose();}} className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/50"><Trash2 className="w-3.5 h-3.5" />Excluir Usuário</button>
          <button onClick={async()=>{await onToggleBlock(user.id);onClose();}} className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white ${user.status === 'blocked' ? 'bg-emerald-600 hover:bg-emerald-500':'bg-amber-600 hover:bg-amber-500'}`}><Ban className="w-3.5 h-3.5" />{user.status === 'blocked' ? 'Desbloquear Usuário':'Bloquear Usuário'}</button>
        </div>
      </div>
    </div>
  );
};
