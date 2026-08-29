import React, { useState, useEffect } from 'react';
import { backupsService } from '../services';
import { BackupItem } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { MetricCard } from '../components/common/MetricCard';
import {
  HardDriveDownload,
  ShieldCheck,
  Download,
  RotateCcw,
  Plus,
  Clock,
  HardDrive,
  AlertTriangle
} from 'lucide-react';

export const BackupsPage: React.FC = () => {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);

  const loadData = async () => {
    setError(null);
    try {
      const [list, recoveryStatus, scheduleList] = await Promise.all([backupsService.listBackups(), backupsService.recoveryStatus(), backupsService.listSchedules()]);
      setBackups(list); setRecovery(recoveryStatus); setSchedules(scheduleList);
    } catch (err: any) {
      setError(err.message || 'Não foi possível carregar os backups.');
    }
  };

  useEffect(() => { void loadData(); }, []);

  const handleCreateManualBackup = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await backupsService.createManualBackup();
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Não foi possível criar o backup.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRestorePreview = async (backup: BackupItem) => {
    setError(null);
    try {
      const preview = await backupsService.previewRestore(backup.id);
      const components = Array.isArray(preview.components) ? preview.components.join(', ') : 'dados do projeto';
      if (confirm(`Restore preview: ${components}. Continuar com a restauração deste snapshot?`)) {
        const result = await backupsService.restoreBackup(backup.id);
        alert(result.message);
        await loadData();
      }
    } catch (err: any) {
      setError(err.message || 'Não foi possível restaurar o backup.');
    }
  };

  const handleVerify = async (backup: BackupItem) => {
    setError(null);
    try {
      const result = await backupsService.verifyBackup(backup.id);
      alert(result.valid ? 'Integridade do backup verificada.' : 'A verificação de integridade falhou.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Não foi possível verificar o backup.');
    }
  };

  const handleDownload = async (backup: BackupItem) => {
    setError(null);
    try {
      const blob = await backupsService.exportBackup(backup.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${backup.id}.bbbak`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err: any) {
      setError(err.message || 'Não foi possível baixar o artefato de backup.');
    }
  };

  const totalSizeMb = backups.reduce((total, backup) => total + backup.sizeMb, 0);
  const verified = backups.filter((backup) => backup.integrity === 'verified').length;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-purple-400" />
            Backup & Restore
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Snapshots criptografados do PostgreSQL e componentes do projeto, com verificação de integridade e restore preview.
          </p>
        </div>

        <button
          onClick={() => void handleCreateManualBackup()}
          disabled={isGenerating}
          className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-lg shadow-purple-900/40 transition-all disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {isGenerating ? 'Gerando Snapshot...' : 'Criar Backup Manual'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>{recovery?.restoreCertified ? 'Restore de produção certificado.' : 'Restore destrutivo ainda exige certificação.'}</strong>
          <p className="mt-1 text-amber-200/80">PITR do provedor: {recovery?.pitr?.configured ? 'configurado' : 'não configurado'} · último recovery drill: {recovery?.latestRecoveryDrill?.status || 'nenhum registrado'}. O BrisaBase não anuncia PITR quando o provedor não confirma a janela de histórico.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard title="Snapshots" value={backups.length ? 'DISPONÍVEIS' : 'AGUARDANDO'} badge="Criptografia AES-256-GCM" badgeType={backups.length ? 'positive' : 'neutral'} icon={ShieldCheck} />
        <MetricCard title="PITR / Recovery" value={recovery?.pitr?.configured ? 'ATIVO' : 'EXTERNO'} badge={recovery?.restoreCertified ? 'Restore certificado' : 'Drill obrigatório'} badgeType={recovery?.restoreCertified ? 'positive' : 'neutral'} icon={Clock} />
        <MetricCard title="Volume de Snapshots" value={`${totalSizeMb.toFixed(1)} MB`} badge={`${verified} verificado(s)`} badgeType="neutral" icon={HardDrive} />
      </div>


      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-100">Agendamentos</h2><p className="text-xs text-slate-500">Backups automáticos persistidos por projeto/ambiente.</p></div><button onClick={() => void backupsService.createSchedule({ expression: '0 3 * * *', type: 'full' }).then(loadData).catch((e:any)=>setError(e.message))} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">+ Diário 03:00 UTC</button></div>
        <div className="space-y-2">{schedules.length ? schedules.map((item:any)=><div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3"><div><div className="font-mono text-xs text-slate-200">{item.expression}</div><div className="text-[10px] text-slate-500">{item.type} · {item.enabled ? 'ativo' : 'pausado'} · último: {item.lastRunAt || 'nunca'}</div></div><div className="flex gap-2"><button onClick={() => void backupsService.updateSchedule(item.id,{enabled:!item.enabled}).then(loadData)} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300">{item.enabled ? 'Pausar' : 'Ativar'}</button><button onClick={() => void backupsService.deleteSchedule(item.id).then(loadData)} className="rounded border border-red-900 px-2 py-1 text-xs text-red-300">Excluir</button></div></div>) : <div className="text-xs text-slate-500">Nenhum agendamento.</div>}</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full border-collapse text-left text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
              <th className="px-4 py-3 font-semibold">Criação</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Tamanho</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Integridade</th>
              <th className="px-4 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {backups.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhum snapshot disponível neste ambiente.</td></tr>
            ) : backups.map((backup) => (
              <tr key={backup.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-slate-200 font-bold">{backup.timestamp}</td>
                <td className="px-4 py-3 whitespace-nowrap"><span className="text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/30 uppercase text-[10px]">{backup.type}</span></td>
                <td className="px-4 py-3 whitespace-nowrap text-cyan-400">{backup.sizeMb} MB</td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={backup.status} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-400">{backup.integrity || 'pending'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-sans">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => void handleDownload(backup)} className="p-1.5 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded flex items-center gap-1 text-xs font-semibold"><Download className="w-4 h-4" />Artefato</button>
                    <button onClick={() => void handleVerify(backup)} className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded text-xs font-semibold">Verificar</button>
                    <button onClick={() => void handleRestorePreview(backup)} className="flex items-center gap-1 rounded bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white px-2.5 py-1 text-xs font-semibold border border-purple-500/30 transition-all"><RotateCcw className="w-3.5 h-3.5" />Restaurar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
