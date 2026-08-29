import React, { useState, useEffect } from 'react';
import { DbMigration } from '../../types';
import { databaseService } from '../../services/databaseService';
import { useApp } from '../../../context/AppContext';
import { GitCommit, Clock, CheckCircle2, Play, X, Code, Undo2 } from 'lucide-react';

interface MigrationsViewProps {
  migrations: DbMigration[];
  onApplied?: () => Promise<void> | void;
}

export const MigrationsView: React.FC<MigrationsViewProps> = ({ migrations, onApplied }) => {
  const { activeOrganizationId, activeProjectId, activeEnvironmentId, addToast } = useApp();
  const [migList, setMigList] = useState<DbMigration[]>(migrations);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [migName, setMigName] = useState('');
  const [sqlUp, setSqlUp] = useState('CREATE TABLE IF NOT EXISTS tags (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  title TEXT NOT NULL\n);');
  const [sqlDown, setSqlDown] = useState('DROP TABLE IF EXISTS tags;');

  useEffect(() => {
    setMigList(migrations);
  }, [migrations]);

  const handleRollback = async (migration: DbMigration) => {
    if (!activeOrganizationId || !activeProjectId || !activeEnvironmentId) return;
    if (!migration.sqlDown) { addToast('Rollback indisponível', 'Esta migração não possui SQL DOWN.', 'warning'); return; }
    if (!window.confirm(`Reverter a migração '${migration.name}'? Somente a migração aplicada mais recentemente pode ser revertida automaticamente.`)) return;
    try {
      await databaseService.rollbackMigration(migration.id, activeOrganizationId, activeProjectId, activeEnvironmentId);
      await onApplied?.();
      addToast('Rollback concluído', `Migração '${migration.name}' revertida com SQL DOWN.`, 'success');
    } catch (err: any) {
      addToast('Rollback bloqueado', err.message, 'error');
    }
  };

  const handleCreateMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!migName.trim()) return;
    if (!activeOrganizationId || !activeProjectId || !activeEnvironmentId) {
      addToast('Escopo indisponível', 'Selecione um projeto e ambiente válidos antes de criar uma migração.', 'warning');
      return;
    }

    try {
      const created = await databaseService.createMigration(
        migName.trim(),
        sqlUp,
        sqlDown,
        activeOrganizationId,
        activeProjectId,
        activeEnvironmentId
      );
      setMigList((current) => [created, ...current]);
      await onApplied?.();
      addToast('Migração executada!', `Migração '${migName}' aplicada com sucesso no PostgreSQL.`, 'success');
      setIsModalOpen(false);
      setMigName('');
    } catch (err: any) {
      addToast('Erro na migração', err.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-purple-400" />
            Histórico de Migrações DDL
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Cada migração aplica uma instrução SQL UP no schema isolado e registra o SQL DOWN para rollback controlado posterior.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 transition-colors shadow-md shadow-purple-900/30"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>+ Nova Migração DDL</span>
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="divide-y divide-slate-800/80">
          {migList.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Nenhuma migração aplicada neste ambiente.</div>
          ) : migList.map((mig) => (
            <div key={mig.id} className="p-4 space-y-2 hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className={`w-5 h-5 shrink-0 ${mig.status === 'rolled_back' ? 'text-slate-500' : 'text-emerald-400'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-slate-100">{mig.name}</span>
                      <span className="text-[10px] font-mono text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/30">{mig.version}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-0.5 block">Aplicada em: {mig.appliedAt}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{mig.executionTimeMs}ms</span>
                  <span className={`rounded px-2 py-0.5 text-[9px] ${mig.status === 'rolled_back' ? 'bg-slate-800 text-slate-400' : 'bg-emerald-950 text-emerald-400'}`}>{mig.status}</span>
                  {mig.status === 'success' && mig.sqlDown && <button onClick={() => void handleRollback(mig)} className="flex items-center gap-1 rounded border border-amber-800/50 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-950/40"><Undo2 className="h-3 w-3"/>Rollback</button>}
                </div>
              </div>

              {mig.sqlUp && (
                <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">{mig.sqlUp}</pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Code className="w-4 h-4 text-purple-400" />
                Criar e Aplicar Migração DDL
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleCreateMigration} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Nome da Migração</label>
                <input
                  type="text"
                  placeholder="ex: create_tags_table"
                  value={migName}
                  onChange={(e) => setMigName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">SQL UP (aplicado agora)</label>
                <textarea
                  rows={4}
                  value={sqlUp}
                  onChange={(e) => setSqlUp(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">SQL DOWN (registrado para rollback posterior)</label>
                <textarea
                  rows={2}
                  value={sqlDown}
                  onChange={(e) => setSqlDown(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-500">Uma instrução por SQL UP/DOWN. O BrisaBase aceita ponto e vírgula final e mantém o escopo preso ao ambiente atual.</p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30">Executar Migração</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
