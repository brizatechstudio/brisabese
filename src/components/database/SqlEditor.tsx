import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Braces,
  Check,
  Clock3,
  Copy,
  Database,
  FileCode2,
  History,
  ListTree,
  Play,
  Save,
  SearchCode,
  ShieldCheck,
  Sparkles,
  Table2,
  TerminalSquare,
  WandSparkles,
  Zap
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { executeSql, getSqlDatabaseState, saveSqlQuery } from '../../services/sqlMock';
import { isRealMode, realDatabaseService } from '../../services/runtime';
import { SqlExecutionResult, SqlQueryHistoryItem, SqlSavedQuery, SqlTable } from '../../types/sql';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';

interface SqlEditorProps {
  onSchemaChange: () => void;
}

const starterSql = `-- BrisaBase SQL Editor • PostgreSQL
-- Em VITE_DATA_SOURCE=api, este script roda no PostgreSQL real do projeto\n-- Ctrl/Cmd + Enter executa o script\n\nselect id, email, full_name, role, created_at\nfrom public.users\norder by created_at desc\nlimit 100;`;

const templates = [
  {
    id: 'create-table',
    label: 'Create table',
    icon: Table2,
    sql: `create table public.customers (\n  id uuid primary key default gen_random_uuid(),\n  email text not null unique,\n  full_name text,\n  plan text not null default 'free',\n  metadata jsonb not null default '{}'::jsonb,\n  created_at timestamptz not null default now()\n);`
  },
  {
    id: 'rls',
    label: 'RLS policy',
    icon: ShieldCheck,
    sql: `alter table public.orders enable row level security;\n\ncreate policy "Users can read own orders"\non public.orders\nfor select\nto authenticated\nusing (auth.uid() = user_id);`
  },
  {
    id: 'function',
    label: 'DB function',
    icon: Zap,
    sql: `create or replace function public.calculate_order_total(order_id uuid)\nreturns numeric\nlanguage sql\nstable\nas $$\n  select coalesce(sum(total), 0)\n  from public.orders\n  where id = order_id;\n$$;`
  },
  {
    id: 'trigger',
    label: 'Trigger',
    icon: Braces,
    sql: `create trigger set_updated_at\nbefore update on public.products\nfor each row\nexecute function public.set_updated_at();`
  },
  {
    id: 'index',
    label: 'Create index',
    icon: SearchCode,
    sql: `create index idx_orders_status_created_at\non public.orders (status, created_at desc);`
  },
  {
    id: 'transaction',
    label: 'Transaction',
    icon: ListTree,
    sql: `begin;\n\nupdate public.orders\nset status = 'paid'\nwhere id = 'ord-1002';\n\ncommit;`
  }
];

function formatSql(sql: string): string {
  return sql
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|LIMIT|RETURNING|VALUES|SET|ON CONFLICT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN)\s+/gi, '\n$1 ')
    .replace(/\s+(CREATE TABLE|ALTER TABLE|CREATE INDEX|CREATE VIEW|CREATE POLICY|CREATE TRIGGER|CREATE OR REPLACE FUNCTION)\s+/gi, '\n$1 ')
    .replace(/;\s*/g, ';\n\n')
    .trim();
}

function resultTone(status?: SqlExecutionResult['status']) {
  return status === 'error' ? 'danger' : 'success';
}

export const SqlEditor: React.FC<SqlEditorProps> = ({ onSchemaChange }) => {
  const { activeProject, showToast } = useApp();
  const projectId = activeProject?.id;
  const [sql, setSql] = useState(starterSql);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SqlExecutionResult | null>(null);
  const [stateRevision, setStateRevision] = useState(0);
  const [sideTab, setSideTab] = useState('saved');
  const [resultTab, setResultTab] = useState('results');
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [copied, setCopied] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
  const [realTables, setRealTables] = useState<SqlTable[]>([]);
  const [realHistory, setRealHistory] = useState<SqlQueryHistoryItem[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dbState = useMemo(() => getSqlDatabaseState(projectId), [projectId, stateRevision]);
  const tables = isRealMode ? realTables : dbState.tables;
  const savedQueries = dbState.savedQueries;
  const history = isRealMode ? realHistory : dbState.history;

  const loadRealMetadata = async () => {
    if (!isRealMode || !projectId) return;
    const [tableList, historyList] = await Promise.all([
      realDatabaseService.listTables(),
      realDatabaseService.getSqlHistory().catch(() => [])
    ]);
    setRealTables(tableList.map((table) => ({
      id: `${table.schema || 'public'}.${table.name}`,
      schema: table.schema || 'public',
      name: table.name,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: column.isNullable !== false,
        primaryKey: Boolean(column.isPrimaryKey),
        unique: Boolean(column.isUnique),
        defaultValue: column.defaultValue
      })),
      rows: [],
      size: table.sizeBytes >= 1024 * 1024 ? `${(table.sizeBytes / 1024 / 1024).toFixed(2)} MB` : `${Math.round(table.sizeBytes / 1024)} KB`,
      rlsEnabled: false,
      realtimeEnabled: false,
      createdAt: table.createdAt || '',
      updatedAt: table.updatedAt || ''
    })));
    setRealHistory(historyList.map((item) => ({
      id: item.id,
      sql: item.query,
      command: item.query.trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase(),
      status: item.status,
      durationMs: item.executionTimeMs,
      affectedRows: item.rowCount,
      executedAt: item.executedAt,
      message: item.errorMessage || `${item.rowCount} row(s)`
    })));
  };

  useEffect(() => {
    if (isRealMode) void loadRealMetadata();
    else setStateRevision((value) => value + 1);
  }, [projectId]);

  const run = async (overrideSql?: string) => {
    const executionSql = (overrideSql ?? sql).trim();
    if (!executionSql) return;

    const destructive = /\b(drop\s+table|truncate|delete\s+from)\b/i.test(executionSql);
    if (safeMode && destructive) {
      const confirmed = window.confirm(`Safe mode: este comando é destrutivo. Executar no ${isRealMode ? 'PostgreSQL REAL' : 'mock'}?`);
      if (!confirmed) return;
    }

    setRunning(true);
    setResultTab(/^\s*explain/i.test(executionSql) ? 'plan' : 'results');
    let execution: SqlExecutionResult;
    try {
      if (isRealMode) {
        const response = await realDatabaseService.executeQuery(executionSql);
        const schemaChanged = /\b(create|alter|drop|truncate|comment|grant|revoke)\b/i.test(executionSql);
        const command = executionSql.replace(/^--.*$/gm, '').trim().split(/\s+/).slice(0, 2).join(' ').toUpperCase() || 'SQL';
        const plan = /^\s*explain/i.test(executionSql)
          ? response.rows.map((row) => String(Object.values(row)[0] ?? ''))
          : undefined;
        execution = {
          status: 'success',
          command,
          message: `${response.rowCount} row(s) retornada(s)/afetada(s) pelo PostgreSQL real.`,
          durationMs: response.executionTimeMs,
          affectedRows: response.rowCount,
          columns: response.columns,
          rows: response.rows,
          plan,
          schemaChanged
        };
      } else {
        execution = await executeSql(projectId, executionSql);
      }
    } catch (error) {
      execution = {
        status: 'error',
        command: 'ERROR',
        message: error instanceof Error ? error.message : 'Falha ao executar SQL.',
        durationMs: 0,
        affectedRows: 0,
        columns: [],
        rows: []
      };
    }
    setResult(execution);
    setRunning(false);
    setStateRevision((value) => value + 1);
    if (isRealMode) await loadRealMetadata().catch(() => undefined);
    if (execution.schemaChanged) onSchemaChange();

    if (execution.status === 'success') {
      showToast('SQL executado', `${execution.command} • ${execution.durationMs} ms`, 'success');
    } else {
      showToast('Erro SQL', execution.message, 'error');
    }
  };

  const runExplain = () => {
    const base = sql.trim().replace(/^explain(?:\s+analyze)?\s+/i, '');
    if (!/^select\b/i.test(base)) {
      showToast('EXPLAIN indisponível', 'Use EXPLAIN em uma consulta SELECT.', 'info');
      return;
    }
    const explainSql = `EXPLAIN ANALYZE ${base}`;
    setSql(explainSql);
    run(explainSql);
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!saveName.trim() || !sql.trim()) return;
    saveSqlQuery(projectId, saveName.trim(), sql);
    setSaveName('');
    setIsSaveOpen(false);
    setStateRevision((value) => value + 1);
    showToast('Query salva', 'A query foi adicionada aos snippets do projeto.', 'success');
  };

  const copySql = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    showToast('SQL copiado', 'Script copiado para a área de transferência.', 'info');
    window.setTimeout(() => setCopied(false), 1500);
  };

  const insertTemplate = (templateSql: string) => {
    setSql(templateSql);
    setResult(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const tableColumns = result?.columns || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100">SQL Editor</h2>
            <Badge variant={isRealMode ? "success" : "cyan"} size="sm">{isRealMode ? "PostgreSQL REAL" : "PostgreSQL mock"}</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">{isRealMode ? "Execute DDL/DML diretamente no PostgreSQL isolado do projeto. CREATE TABLE e ALTER TABLE aparecem no Table Editor real." : "Execute DDL e DML simulados. CREATE TABLE e ALTER TABLE atualizam o Table Editor localmente."}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[11px] text-slate-400">
            <input type="checkbox" checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} className="accent-cyan-500" />
            Safe mode
          </label>
          <Button variant="outline" size="sm" onClick={() => setSql(formatSql(sql))} leftIcon={<WandSparkles className="w-3.5 h-3.5" />}>Formatar</Button>
          <Button variant="outline" size="sm" onClick={() => setIsSaveOpen(true)} leftIcon={<Save className="w-3.5 h-3.5" />}>Salvar</Button>
          <Button variant="gradient" size="sm" onClick={() => run()} isLoading={running} leftIcon={<Play className="w-3.5 h-3.5" />}>Run</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[260px_minmax(0,1fr)] gap-4">
        <aside className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden h-fit 2xl:sticky 2xl:top-20">
          <div className="px-3 pt-3">
            <Tabs tabs={[{ id: 'saved', label: 'Saved' }, { id: 'history', label: 'History' }, { id: 'schema', label: 'Schema' }]} activeTab={sideTab} onChange={setSideTab} variant="pills" />
          </div>
          <div className="p-3 max-h-[560px] overflow-y-auto">
            {sideTab === 'saved' && (
              <div className="space-y-1.5">
                {savedQueries.map((item: SqlSavedQuery) => (
                  <button key={item.id} onClick={() => setSql(item.sql)} className="w-full text-left rounded-xl p-3 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-colors">
                    <div className="flex items-start gap-2"><FileCode2 className="w-3.5 h-3.5 text-cyan-400 mt-0.5" /><div className="min-w-0"><div className="text-xs font-semibold text-slate-200 truncate">{item.name}</div><div className="text-[10px] text-slate-500 mt-1 font-mono line-clamp-2">{item.sql}</div></div></div>
                  </button>
                ))}
              </div>
            )}

            {sideTab === 'history' && (
              <div className="space-y-1.5">
                {history.length === 0 && <div className="p-6 text-center text-xs text-slate-500">Execute uma query para gerar histórico.</div>}
                {history.map((item: SqlQueryHistoryItem) => (
                  <button key={item.id} onClick={() => setSql(item.sql)} className="w-full text-left rounded-xl p-3 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-colors">
                    <div className="flex items-center justify-between gap-2"><span className={`text-[10px] font-bold ${item.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{item.command}</span><span className="text-[10px] text-slate-600">{item.durationMs}ms</span></div>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono line-clamp-2">{item.sql}</div>
                  </button>
                ))}
              </div>
            )}

            {sideTab === 'schema' && (
              <div className="space-y-2">
                <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">public</div>
                {tables.map((table: SqlTable) => (
                  <button key={table.id} onClick={() => setSql(`select *\nfrom ${table.schema}.${table.name}\nlimit 100;`)} className="w-full rounded-xl p-2.5 text-left hover:bg-white/[0.05] transition-colors">
                    <div className="flex items-center gap-2"><Table2 className="w-3.5 h-3.5 text-cyan-400" /><span className="text-xs font-semibold text-slate-300">{table.name}</span></div>
                    <div className="pl-5 mt-1 text-[10px] text-slate-600">{table.columns.length} columns • {table.rows.length} rows</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-2.5 bg-[#0B1628] border-b border-white/[0.08]">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 mr-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" /><span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" /></div>
                <Badge variant="neutral" size="sm">database: postgres</Badge>
                <Badge variant="neutral" size="sm">schema: public</Badge>
                <Badge variant="neutral" size="sm">role: postgres</Badge>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={copySql} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-xs text-slate-300">{copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}{copied ? 'Copiado' : 'Copy'}</button>
                <button onClick={runExplain} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] text-xs text-slate-300"><SearchCode className="w-3.5 h-3.5" />Explain</button>
              </div>
            </div>

            <div className="grid grid-cols-[44px_minmax(0,1fr)] bg-[#020617] min-h-[360px]">
              <div className="border-r border-white/[0.06] px-2 py-4 text-right text-[11px] leading-6 font-mono text-slate-700 select-none">
                {Array.from({ length: Math.max(15, sql.split('\n').length) }).map((_, index) => <div key={index}>{index + 1}</div>)}
              </div>
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={(event) => setSql(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    run();
                  }
                }}
                className="w-full min-h-[360px] bg-transparent resize-y outline-none p-4 font-mono text-xs leading-6 text-slate-200 selection:bg-cyan-500/30"
                spellCheck={false}
                aria-label="SQL Editor"
              />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-white/[0.08] bg-[#07111F] text-[10px] text-slate-500">
              <div className="flex items-center gap-2"><Database className="w-3.5 h-3.5" /><span>PostgreSQL 17 compatible mock</span><span>•</span><span>{activeProject?.region || 'sa-east-1'}</span></div>
              <span>Ctrl/Cmd + Enter para executar</span>
            </div>
          </div>

          <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden">
            <div className="px-4 pt-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <Tabs tabs={[{ id: 'results', label: 'Results', count: result?.rows.length || 0 }, { id: 'messages', label: 'Messages' }, { id: 'plan', label: 'Query Plan' }]} activeTab={resultTab} onChange={setResultTab} />
              {result && <div className="flex items-center gap-2 pb-2"><Badge variant={resultTone(result.status)} size="sm">{result.status === 'success' ? result.command : 'ERROR'}</Badge><span className="text-[10px] text-slate-500">{result.durationMs} ms • {result.affectedRows} affected/returned</span></div>}
            </div>

            <div className="p-4 min-h-[170px]">
              {!result && <div className="h-36 grid place-items-center text-center"><div><Play className="w-6 h-6 text-slate-700 mx-auto mb-2" /><div className="text-xs text-slate-500">Execute SQL para ver resultados, mensagens e plano de query.</div></div></div>}

              {result && resultTab === 'results' && (
                result.status === 'error' ? <div className="rounded-xl bg-rose-500/[0.06] border border-rose-500/20 p-4 text-xs text-rose-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{result.message}</div>
                : tableColumns.length > 0 && result.rows.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                    <table className="w-full text-left text-xs text-slate-300"><thead className="bg-[#0B1628] text-[10px] uppercase tracking-wider text-slate-500"><tr>{tableColumns.map((column) => <th key={column} className="px-3 py-2.5 whitespace-nowrap">{column}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.05] font-mono">{result.rows.map((row, index) => <tr key={index} className="hover:bg-white/[0.03]">{tableColumns.map((column) => <td key={column} className="px-3 py-2.5 max-w-[240px] truncate">{row[column] === null || row[column] === undefined ? <span className="text-slate-600">NULL</span> : String(row[column])}</td>)}</tr>)}</tbody></table>
                  </div>
                ) : <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/15 p-4 text-xs text-emerald-300">{result.message}</div>
              )}

              {result && resultTab === 'messages' && (
                <div className="font-mono text-xs space-y-2"><div className="flex items-center gap-2 text-slate-400"><Clock3 className="w-3.5 h-3.5" /><span>{new Date().toLocaleTimeString('pt-BR')}</span></div><div className={result.status === 'success' ? 'text-emerald-300' : 'text-rose-300'}>{result.message}</div><div className="text-slate-600">NOTICE: execução realizada pelo parser local do BrisaBase; nenhuma conexão PostgreSQL real foi aberta.</div></div>
              )}

              {result && resultTab === 'plan' && (
                result.plan?.length ? <div className="rounded-xl bg-[#020617] border border-white/[0.06] p-4 font-mono text-xs text-cyan-300 space-y-1">{result.plan.map((line, index) => <div key={index}>{line}</div>)}</div> : <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-500">Use o botão Explain em uma consulta SELECT para gerar um plano simulado.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-cyan-400" /><h3 className="text-xs font-bold text-slate-200">Templates SQL</h3><Badge variant="neutral" size="sm">mock snippets</Badge></div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
              {templates.map((template) => { const Icon = template.icon; return <button key={template.id} onClick={() => insertTemplate(template.sql)} className="rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-cyan-500/20 p-3 text-left transition-colors"><Icon className="w-4 h-4 text-cyan-400 mb-2" /><div className="text-[11px] font-semibold text-slate-300">{template.label}</div></button>; })}
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isSaveOpen} onClose={() => setIsSaveOpen(false)} title="Salvar query SQL" subtitle="O snippet será persistido somente no localStorage deste projeto." footer={<><Button variant="outline" size="sm" onClick={() => setIsSaveOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={handleSave} disabled={!saveName.trim()}>Salvar query</Button></>}>
        <form onSubmit={handleSave} className="space-y-4"><Input label="Nome da query" placeholder="ex: Criar tabela customers" value={saveName} onChange={(event) => setSaveName(event.target.value)} autoFocus /><div className="rounded-xl bg-[#020617] border border-white/[0.06] p-3 font-mono text-[11px] text-slate-400 max-h-44 overflow-auto whitespace-pre-wrap">{sql}</div></form>
      </Modal>
    </div>
  );
};
