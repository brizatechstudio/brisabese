import React, { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { databaseService, ExecuteQueryResult } from '../../services';
import { SqlQueryHistory, SqlSavedQuery, SqlExplainResult, SqlMetrics, TableSchema } from '../../types';
import { useApp } from '../../../context/AppContext';
import { Play, History, Clock, CheckCircle2, AlertTriangle, Square, Wand2, Save, Star, Trash2, Download, Activity } from 'lucide-react';

interface SqlEditorViewProps {
  onExecuteSql: (query: string, options?: { queryId?: string; timeoutMs?: number; maxRows?: number }) => Promise<ExecuteQueryResult>;
  tables?: TableSchema[];
}

function readableError(error: unknown): string {
  if (!(error instanceof Error)) return 'Falha ao executar SQL.';
  if (!error.message || error.message === '[object Object]') return 'Falha ao executar SQL. Verifique o comando e tente novamente.';
  return error.message;
}

function formatSql(source: string): string {
  let text = source.trim().replace(/\s+/g, ' ');
  const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'RETURNING', 'VALUES', 'SET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN'];
  for (const keyword of keywords) text = text.replace(new RegExp(`\\s+${keyword.replace(' ', '\\s+')}\\s+`, 'ig'), `\n${keyword} `);
  return text.replace(/,\s*/g, ',\n  ').trim();
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const SqlEditorView: React.FC<SqlEditorViewProps> = ({ onExecuteSql, tables = [] }) => {
  const { activeOrganizationId, activeProjectId, activeEnvironmentId, addToast } = useApp();
  const [sqlQuery, setSqlQuery] = useState('SELECT current_timestamp AS server_time;');
  const [history, setHistory] = useState<SqlQueryHistory[]>([]);
  const [saved, setSaved] = useState<SqlSavedQuery[]>([]);
  const [savedName, setSavedName] = useState('');
  const [queryResult, setQueryResult] = useState<ExecuteQueryResult | null>(null);
  const [explainResult, setExplainResult] = useState<SqlExplainResult | null>(null);
  const [queryError, setQueryError] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [runningQueryId, setRunningQueryId] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [maxRows, setMaxRows] = useState(1000);
  const [metrics, setMetrics] = useState<SqlMetrics>({ total:0, successCount:0, errorCount:0, avgExecutionTimeMs:0, p95ExecutionTimeMs:0, avgRowCount:0, last24hCount:0 });

  const scoped = Boolean(activeOrganizationId && activeProjectId && activeEnvironmentId);
  const snippets = useMemo(() => tables.slice(0, 8).map((table) => `SELECT * FROM ${table.name} LIMIT 100;`), [tables]);

  const loadSidebar = async () => {
    if (!scoped) return;
    try {
      const [historyItems, savedItems, sqlMetrics] = await Promise.all([
        databaseService.getSqlHistory(activeOrganizationId, activeProjectId, activeEnvironmentId),
        databaseService.listSavedQueries(activeOrganizationId, activeProjectId, activeEnvironmentId),
        databaseService.getSqlMetrics(activeOrganizationId, activeProjectId, activeEnvironmentId),
      ]);
      setHistory(historyItems.slice(0, 30));
      setSaved(savedItems);
      setMetrics(sqlMetrics);
    } catch (error) {
      console.error('Erro ao carregar histórico SQL:', error);
    }
  };

  useEffect(() => { void loadSidebar(); }, [activeOrganizationId, activeProjectId, activeEnvironmentId]);

  const run = async () => {
    if (!sqlQuery.trim() || isExecuting) return;
    const queryId = `ui_${crypto.randomUUID().replaceAll('-', '')}`;
    setRunningQueryId(queryId);
    setIsExecuting(true);
    setQueryError('');
    setExplainResult(null);
    try {
      const res = await onExecuteSql(sqlQuery, { queryId, timeoutMs, maxRows });
      const columns = res.columns?.length ? res.columns : Object.keys(res.rows?.[0] || {});
      setQueryResult({ ...res, columns });
      await loadSidebar();
    } catch (error) {
      setQueryResult(null);
      setQueryError(readableError(error));
      await loadSidebar();
    } finally {
      setIsExecuting(false);
      setRunningQueryId('');
    }
  };

  const cancel = async () => {
    if (!runningQueryId) return;
    try {
      const cancelled = await databaseService.cancelQuery(runningQueryId, activeOrganizationId, activeProjectId, activeEnvironmentId);
      if (!cancelled) addToast('SQL Editor', 'A query já havia terminado ou não estava mais ativa.', 'warning');
    } catch (error) {
      addToast('Não foi possível cancelar', readableError(error), 'error');
    }
  };

  const explain = async (analyze: boolean) => {
    if (!sqlQuery.trim() || isExecuting) return;
    setQueryError('');
    try {
      const queryId = `explain_${crypto.randomUUID().replaceAll('-', '')}`;
      setExplainResult(await databaseService.explainQuery(sqlQuery, analyze, { queryId, timeoutMs }, activeOrganizationId, activeProjectId, activeEnvironmentId));
      setQueryResult(null);
    } catch (error) {
      setExplainResult(null);
      setQueryError(readableError(error));
    }
  };

  const saveCurrent = async () => {
    const name = savedName.trim();
    if (!name) { addToast('SQL Editor', 'Informe um nome para salvar a query.', 'warning'); return; }
    try {
      await databaseService.saveQuery(name, sqlQuery, false, activeOrganizationId, activeProjectId, activeEnvironmentId);
      setSavedName('');
      await loadSidebar();
      addToast('Query salva', name, 'success');
    } catch (error) { addToast('Não foi possível salvar', readableError(error), 'error'); }
  };

  const toggleFavorite = async (item: SqlSavedQuery) => {
    await databaseService.updateSavedQuery(item.id, { favorite: !item.favorite }, activeOrganizationId, activeProjectId, activeEnvironmentId);
    await loadSidebar();
  };

  const removeSaved = async (id: string) => {
    await databaseService.deleteSavedQuery(id, activeOrganizationId, activeProjectId, activeEnvironmentId);
    await loadSidebar();
  };

  const exportResult = (format: 'csv' | 'json') => {
    if (!queryResult) return;
    const content = format === 'json'
      ? JSON.stringify(queryResult.rows, null, 2)
      : [queryResult.columns.join(','), ...queryResult.rows.map((row) => queryResult.columns.map((column) => csvCell(row[column])).join(','))].join('\n');
    downloadText(`query-result.${format}`, content, format === 'json' ? 'application/json' : 'text/csv');
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run(); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-semibold text-slate-300"><Star className="h-4 w-4 text-amber-400" /> Queries salvas</div>
          <div className="mb-3 flex gap-2"><input value={savedName} onChange={(e)=>setSavedName(e.target.value)} placeholder="Nome da query" className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"/><button onClick={()=>void saveCurrent()} className="rounded-md bg-purple-600 p-2 text-white" title="Salvar"><Save className="h-3.5 w-3.5"/></button></div>
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {saved.length === 0 && <p className="text-[11px] text-slate-500">Nenhuma query salva.</p>}
            {saved.map((item)=><div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/80 p-2"><button onClick={()=>setSqlQuery(item.query)} className="w-full text-left"><span className="block text-[11px] font-medium text-slate-200">{item.name}</span><span className="line-clamp-2 font-mono text-[9px] text-slate-500">{item.query}</span></button><div className="mt-1 flex justify-end gap-1"><button onClick={()=>void toggleFavorite(item)} className={item.favorite?'text-amber-400':'text-slate-600'}><Star className="h-3 w-3"/></button><button onClick={()=>void removeSaved(item.id)} className="text-slate-600 hover:text-rose-400"><Trash2 className="h-3 w-3"/></button></div></div>)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-semibold text-slate-300"><History className="h-4 w-4 text-purple-400" /> Histórico</div>
          <div className="max-h-72 space-y-2 overflow-y-auto">{history.length===0?<p className="text-[11px] text-slate-500">Nenhuma execução.</p>:history.map((item)=><button key={item.id} onClick={()=>setSqlQuery(item.query)} className="w-full rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-left font-mono text-[10px] text-slate-300"><span className="line-clamp-2">{item.query}</span><span className={`mt-1 block text-[9px] ${item.status==='success'?'text-emerald-400':'text-rose-400'}`}>{item.status} · {item.executionTimeMs}ms</span></button>)}</div>
        </div>
      </aside>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">Queries 24h</div><div className="mt-1 text-lg font-semibold text-slate-100">{metrics.last24hCount}</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">Sucesso / erro</div><div className="mt-1 text-lg font-semibold text-emerald-300">{metrics.successCount}<span className="text-slate-600"> / </span><span className="text-rose-300">{metrics.errorCount}</span></div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">Latência média</div><div className="mt-1 text-lg font-semibold text-cyan-300">{metrics.avgExecutionTimeMs}ms</div></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">P95</div><div className="mt-1 text-lg font-semibold text-purple-300">{metrics.p95ExecutionTimeMs}ms</div></div>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
            <div><span className="text-xs font-mono font-medium text-slate-300">query.sql</span><span className="ml-2 text-[10px] text-slate-500">1 instrução · escopo isolado</span></div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={timeoutMs} onChange={(e)=>setTimeoutMs(Number(e.target.value))} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"><option value={5000}>5s</option><option value={10000}>10s</option><option value={30000}>30s</option></select>
              <select value={maxRows} onChange={(e)=>setMaxRows(Number(e.target.value))} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"><option value={100}>100 linhas</option><option value={1000}>1.000 linhas</option><option value={5000}>5.000 linhas</option></select>
              <button onClick={()=>setSqlQuery(formatSql(sqlQuery))} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300"><Wand2 className="h-3 w-3"/>Formatar</button>
              <button onClick={()=>void explain(false)} disabled={isExecuting} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300"><Activity className="h-3 w-3"/>EXPLAIN</button>
              <button onClick={()=>void explain(true)} disabled={isExecuting} className="rounded border border-slate-700 px-2 py-1.5 text-[10px] text-amber-300">ANALYZE</button>
              {isExecuting?<button onClick={()=>void cancel()} className="flex items-center gap-1 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"><Square className="h-3 w-3"/>Cancelar</button>:<button onClick={()=>void run()} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white"><Play className="h-3.5 w-3.5 fill-current"/>Executar</button>}
            </div>
          </div>
          {snippets.length>0&&<div className="flex gap-1 overflow-x-auto border-b border-slate-900 px-3 py-2">{snippets.map((snippet)=><button key={snippet} onClick={()=>setSqlQuery(snippet)} className="whitespace-nowrap rounded bg-slate-900 px-2 py-1 font-mono text-[9px] text-slate-500 hover:text-purple-300">{snippet.split(' ')[3]}</button>)}</div>}
          <textarea value={sqlQuery} onChange={(e)=>setSqlQuery(e.target.value)} onKeyDown={handleEditorKeyDown} rows={12} className="w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200 focus:outline-none" spellCheck={false}/>
        </div>

        {queryError&&<div className="flex items-start gap-3 rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-xs text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"/><div><strong className="mb-1 block">SQL não executado</strong>{queryError}</div></div>}
        {explainResult&&<div className="rounded-xl border border-indigo-900/50 bg-slate-900/60 p-4"><div className="mb-2 text-xs font-semibold text-indigo-300">{explainResult.analyze?'EXPLAIN ANALYZE':'EXPLAIN'} · {explainResult.executionTimeMs}ms</div><pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-slate-300">{JSON.stringify(explainResult.plan,null,2)}</pre></div>}
        {queryResult&&<div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-400"><CheckCircle2 className="h-4 w-4"/>SQL executado</div><div className="flex items-center gap-3 text-xs text-slate-400"><span>{queryResult.rowCount} linha(s){queryResult.truncated?' · resultado truncado':''}</span><span className="flex items-center gap-1 text-purple-400"><Clock className="h-3.5 w-3.5"/>{queryResult.executionTimeMs}ms</span>{queryResult.columns.length>0&&<><button onClick={()=>exportResult('csv')} title="Exportar CSV"><Download className="h-3.5 w-3.5"/></button><button onClick={()=>exportResult('json')} className="font-mono text-[10px]">JSON</button></>}</div></div>{queryResult.columns.length>0?<div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950"><table className="w-full border-collapse text-left font-mono text-xs"><thead><tr className="border-b border-slate-800 bg-slate-900 text-slate-400">{queryResult.columns.map((col)=><th key={col} className="px-4 py-2.5 font-semibold">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-800/60">{queryResult.rows.map((row,i)=><tr key={i}>{queryResult.columns.map((col)=><td key={col} className="whitespace-nowrap px-4 py-2 text-slate-300">{typeof row[col]==='object'?JSON.stringify(row[col]):String(row[col]??'null')}</td>)}</tr>)}</tbody></table></div>:<div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">Comando concluído sem conjunto de linhas.</div>}</div>}
      </div>
    </div>
  );
};
