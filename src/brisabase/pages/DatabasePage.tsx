import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { databaseService, ExecuteQueryResult } from '../services';
import {
  TableSchema,
  TableRow,
  DbRelationship,
  DbMigration,
  DbSchema,
  DbIndex,
  DbFunction,
  DbTrigger,
  DatabaseOverview,
  ColumnDefinition,
  DatabaseRowFilter
} from '../types';
import { TableSpreadsheet } from '../components/database/TableSpreadsheet';
import { SqlEditorView } from '../components/database/SqlEditorView';
import { RelationshipsGraph } from '../components/database/RelationshipsGraph';
import { MigrationsView } from '../components/database/MigrationsView';
import { DatabaseObjectsView } from '../components/database/DatabaseObjectsView';
import { DatabasePoliciesView } from '../components/database/DatabasePoliciesView';
import {
  Database,
  Table as TableIcon,
  Code2,
  Network,
  Zap,
  Layers,
  GitCommit,
  Plus,
  Activity,
  X,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Boxes
} from 'lucide-react';

export const DatabasePage: React.FC = () => {
  const { activeOrganizationId, activeProjectId, activeEnvironmentId, currentProject, environment, isLoadingProjects, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'tables' | 'sql' | 'relationships' | 'functions' | 'triggers' | 'indexes' | 'migrations' | 'policies' | 'objects'>('tables');
  const [overview, setOverview] = useState<DatabaseOverview | null>(null);
  const [schemas, setSchemas] = useState<DbSchema[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>('public');
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [rowTotalCount, setRowTotalCount] = useState(0);
  const [rowPage, setRowPage] = useState(0);
  const [rowPageSize] = useState(25);
  const [rowSearch, setRowSearch] = useState('');
  const [rowSortField, setRowSortField] = useState('');
  const [rowSortOrder, setRowSortOrder] = useState<'asc' | 'desc'>('asc');
  const [rowFilters, setRowFilters] = useState<DatabaseRowFilter[]>([]);
  const [relationships, setRelationships] = useState<DbRelationship[]>([]);
  const [indexes, setIndexes] = useState<DbIndex[]>([]);
  const [migrations, setMigrations] = useState<DbMigration[]>([]);
  const [functions, setFunctions] = useState<DbFunction[]>([]);
  const [triggers, setTriggers] = useState<DbTrigger[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isNewTableModalOpen, setIsNewTableModalOpen] = useState(false);
  const [isNewIndexModalOpen, setIsNewIndexModalOpen] = useState(false);
  const [isNewFunctionModalOpen, setIsNewFunctionModalOpen] = useState(false);
  const [isNewTriggerModalOpen, setIsNewTriggerModalOpen] = useState(false);
  const [isNewRelModalOpen, setIsNewRelModalOpen] = useState(false);

  // New Table Form State
  const [newTableName, setNewTableName] = useState('');
  const [newTableCols, setNewTableCols] = useState<ColumnDefinition[]>([
    { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
    { name: 'name', type: 'text', isNullable: false },
    { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
  ]);

  // New Index Form State
  const [newIdxName, setNewIdxName] = useState('');
  const [newIdxTable, setNewIdxTable] = useState('');
  const [newIdxCols, setNewIdxCols] = useState('');
  const [newIdxType, setNewIdxType] = useState<'btree' | 'hash' | 'gin' | 'gist' | 'brin'>('btree');
  const [newIdxUnique, setNewIdxUnique] = useState(false);

  // New Function Form State
  const [newFnName, setNewFnName] = useState('');
  const [newFnArgs, setNewFnArgs] = useState('');
  const [newFnReturn, setNewFnReturn] = useState('trigger');
  const [newFnLang, setNewFnLang] = useState<'plpgsql' | 'sql'>('plpgsql');
  const [newFnCode, setNewFnCode] = useState('BEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;');

  // New Trigger Form State
  const [newTrigName, setNewTrigName] = useState('');
  const [newTrigTable, setNewTrigTable] = useState('');
  const [newTrigEvent, setNewTrigEvent] = useState<'INSERT' | 'UPDATE' | 'DELETE'>('UPDATE');
  const [newTrigTiming, setNewTrigTiming] = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const [newTrigFn, setNewTrigFn] = useState('');

  // New Relationship Form State
  const [newRelFromTable, setNewRelFromTable] = useState('');
  const [newRelFromCol, setNewRelFromCol] = useState('');
  const [newRelToTable, setNewRelToTable] = useState('');
  const [newRelToCol, setNewRelToCol] = useState('id');

  const orgId = activeOrganizationId;
  const projId = activeProjectId || '';
  const envId = activeEnvironmentId || '';
  const hasResolvedScope = Boolean(orgId && projId && envId && !isLoadingProjects);
  const scopeKey = hasResolvedScope ? `${orgId}:${projId}:${envId}` : '';
  const loadedScopeRef = useRef<string>('');
  const loadingScopeRef = useRef<string>('');
  const requestSequenceRef = useRef(0);
  const loadedRowsRef = useRef<string>('');

  const loadAllData = async (force = false) => {
    if (!hasResolvedScope) return;
    if (!force && (loadedScopeRef.current === scopeKey || loadingScopeRef.current === scopeKey)) return;

    const requestSequence = ++requestSequenceRef.current;
    loadingScopeRef.current = scopeKey;
    setIsLoading(true);
    try {
      const [ov, sList, tList, rels, idxs, migs, fns, trigs] = await Promise.all([
        databaseService.getOverview(orgId, projId, envId),
        databaseService.listSchemas(orgId, projId, envId),
        databaseService.listTables(orgId, projId, envId),
        databaseService.getRelationships(orgId, projId, envId),
        databaseService.getIndexes(orgId, projId, envId),
        databaseService.getMigrations(orgId, projId, envId),
        databaseService.getFunctions(orgId, projId, envId),
        databaseService.getTriggers(orgId, projId, envId)
      ]);

      if (requestSequence !== requestSequenceRef.current) return;
      setOverview(ov);
      setSchemas(sList);
      setTables(tList);
      setRelationships(rels);
      setIndexes(idxs);
      setMigrations(migs);
      setFunctions(fns);
      setTriggers(trigs);
      loadedScopeRef.current = scopeKey;

      if (sList.length > 0 && !sList.some((schema) => schema.name === selectedSchema)) {
        setSelectedSchema(sList[0].name);
      }
      if (tList.length === 0) {
        setSelectedTableName('');
        setTableRows([]);
        setRowTotalCount(0);
      } else if (!selectedTableName || !tList.some((table) => table.name === selectedTableName)) {
        setSelectedTableName(tList[0].name);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do banco:', err);
    } finally {
      if (loadingScopeRef.current === scopeKey) loadingScopeRef.current = '';
      if (requestSequence === requestSequenceRef.current) setIsLoading(false);
    }
  };

  const loadRowsForTable = async (tName: string, force = false) => {
    if (!tName || !hasResolvedScope) return;
    const rowsKey = `${scopeKey}:${tName}:${rowPage}:${rowPageSize}:${rowSearch}:${rowSortField}:${rowSortOrder}:${JSON.stringify(rowFilters)}`;
    if (!force && loadedRowsRef.current === rowsKey) return;
    loadedRowsRef.current = rowsKey;
    try {
      const res = await databaseService.getTableRows(tName, { limit: rowPageSize, offset: rowPage * rowPageSize, search: rowSearch || undefined, sortField: rowSortField || undefined, sortOrder: rowSortOrder, filters: rowFilters.length ? rowFilters : undefined }, orgId, projId, envId);
      setTableRows(res.rows);
      setRowTotalCount(res.totalCount);
    } catch (err) {
      loadedRowsRef.current = '';
      console.error('Erro ao carregar linhas:', err);
    }
  };

  const refreshDatabaseView = async () => {
    loadedRowsRef.current = '';
    await loadAllData(true);
    if (selectedTableName) {
      loadedRowsRef.current = '';
      await loadRowsForTable(selectedTableName, true);
    }
  };

  const handleExecuteSql = async (query: string, options?: { queryId?: string; timeoutMs?: number; maxRows?: number }): Promise<ExecuteQueryResult> => {
    const result = await databaseService.executeQuery(query, orgId, projId, envId, options);
    // SQL can change rows, tables or indexes outside the visual editor. Invalidate
    // both metadata and row caches after a successful execution.
    loadedRowsRef.current = '';
    await loadAllData(true);
    if (selectedTableName) {
      loadedRowsRef.current = '';
      await loadRowsForTable(selectedTableName, true);
    }
    return result;
  };

  useEffect(() => {
    if (!hasResolvedScope) {
      setIsLoading(true);
      return;
    }
    void loadAllData();
  }, [hasResolvedScope, scopeKey]);

  useEffect(() => {
    if (hasResolvedScope && selectedTableName) void loadRowsForTable(selectedTableName);
  }, [hasResolvedScope, scopeKey, selectedTableName, rowPage, rowSearch, rowSortField, rowSortOrder, rowFilters]);

  // Handlers for Row Operations
  const handleInsertRow = async (rowData: any) => {
    try {
      await databaseService.insertRow(selectedTableName, rowData, orgId, projId, envId);
      addToast('Registro inserido', `Novo registro adicionado em ${selectedTableName}.`, 'success');
      loadedRowsRef.current = '';
      await loadRowsForTable(selectedTableName, true);
      await loadAllData(true);
    } catch (err: any) {
      addToast('Erro ao inserir', err.message, 'error');
    }
  };

  const handleUpdateRow = async (rowId: string, rowData: any) => {
    try {
      await databaseService.updateRow(selectedTableName, rowId, rowData, orgId, projId, envId);
      addToast('Registro atualizado', `Registro ${rowId} modificado com sucesso.`, 'success');
      loadedRowsRef.current = '';
      await loadRowsForTable(selectedTableName, true);
    } catch (err: any) {
      addToast('Erro ao atualizar', err.message, 'error');
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    try {
      await databaseService.deleteRow(selectedTableName, rowId, orgId, projId, envId);
      addToast('Registro excluído', `Registro ${rowId} removido da tabela.`, 'warning');
      loadedRowsRef.current = '';
      await loadRowsForTable(selectedTableName, true);
      await loadAllData(true);
    } catch (err: any) {
      addToast('Erro ao excluir', err.message, 'error');
    }
  };

  // Handler for Creating New Table
  const handleCreateTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tableName = newTableName.toLowerCase().trim();
    if (!tableName) return;
    try {
      await databaseService.createTable(
        { name: tableName, schema: selectedSchema, columns: newTableCols },
        orgId,
        projId,
        envId
      );
      addToast('Tabela criada!', `A tabela '${tableName}' foi criada no banco de dados.`, 'success');
      setIsNewTableModalOpen(false);
      setNewTableName('');
      await loadAllData(true);
      setSelectedTableName(tableName);
    } catch (err: any) {
      addToast('Erro ao criar tabela', err.message, 'error');
    }
  };

  // Handler for Creating Index
  const handleCreateIndexSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdxName.trim() || !newIdxTable || !newIdxCols.trim()) return;
    try {
      const colsArray = newIdxCols.split(',').map((c) => c.trim()).filter(Boolean);
      await databaseService.createIndex(
        {
          name: newIdxName.trim(),
          tableName: newIdxTable,
          columns: colsArray,
          type: newIdxType,
          isUnique: newIdxUnique
        },
        orgId,
        projId,
        envId
      );
      addToast('Índice criado!', `Índice '${newIdxName}' aplicado à tabela ${newIdxTable}.`, 'success');
      setIsNewIndexModalOpen(false);
      setNewIdxName('');
      setNewIdxCols('');
      await loadAllData(true);
    } catch (err: any) {
      addToast('Erro ao criar índice', err.message, 'error');
    }
  };

  // Handler for Creating Function
  const handleCreateFunctionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFnName.trim() || !newFnCode.trim()) return;
    try {
      await databaseService.createFunction(
        {
          name: newFnName.trim(),
          schema: 'public',
          arguments: newFnArgs.trim(),
          returnType: newFnReturn,
          language: newFnLang,
          definition: newFnCode
        },
        orgId,
        projId,
        envId
      );
      addToast('Função PL/pgSQL salva!', `Função '${newFnName}' compilada com sucesso.`, 'success');
      setIsNewFunctionModalOpen(false);
      setNewFnName('');
      setNewFnCode('');
      await loadAllData(true);
    } catch (err: any) {
      addToast('Erro ao criar função', err.message, 'error');
    }
  };

  // Handler for Creating Trigger
  const handleCreateTriggerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrigName.trim() || !newTrigTable || !newTrigFn) return;
    try {
      await databaseService.createTrigger(
        {
          name: newTrigName.trim(),
          tableName: newTrigTable,
          event: newTrigEvent,
          timing: newTrigTiming,
          functionName: newTrigFn,
          enabled: true
        },
        orgId,
        projId,
        envId
      );
      addToast('Trigger ativado!', `Trigger '${newTrigName}' registrado em ${newTrigTable}.`, 'success');
      setIsNewTriggerModalOpen(false);
      setNewTrigName('');
      await loadAllData(true);
    } catch (err: any) {
      addToast('Erro ao criar trigger', err.message, 'error');
    }
  };

  // Handler for Creating Relationship
  const handleCreateRelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelFromTable || !newRelFromCol || !newRelToTable || !newRelToCol) return;
    try {
      await databaseService.createRelationship(
        {
          fromTable: newRelFromTable,
          fromColumn: newRelFromCol,
          toTable: newRelToTable,
          toColumn: newRelToCol,
          type: 'one-to-many',
          onDelete: 'CASCADE'
        },
        orgId,
        projId,
        envId
      );
      addToast('Chave Estrangeira adicionada!', `FK criada: ${newRelFromTable}.${newRelFromCol} -> ${newRelToTable}.${newRelToCol}.`, 'success');
      setIsNewRelModalOpen(false);
      await loadAllData(true);
    } catch (err: any) {
      addToast('Erro ao criar relacionamento', err.message, 'error');
    }
  };

  const handleDeleteTable = async () => {
    if (!selectedTableName) return;
    if (!window.confirm(`Excluir a tabela '${selectedTableName}' e todos os dados dependentes permitidos pelo CASCADE? Esta ação não pode ser desfeita automaticamente.`)) return;
    try {
      await databaseService.deleteTable(selectedTableName, orgId, projId, envId);
      addToast('Tabela excluída', selectedTableName, 'warning');
      setSelectedTableName(''); setTableRows([]); setRowTotalCount(0); setRowFilters([]); loadedRowsRef.current='';
      await loadAllData(true);
    } catch (err: any) { addToast('Exclusão bloqueada', err.message, 'error'); }
  };

  const handleDeleteRelationship = async (relationship: DbRelationship) => {
    if (!window.confirm(`Remover a foreign key ${relationship.fromTable}.${relationship.fromColumn} → ${relationship.toTable}.${relationship.toColumn}?`)) return;
    try { await databaseService.deleteRelationship(relationship.id, orgId, projId, envId); await loadAllData(true); addToast('Relacionamento removido', relationship.id, 'warning'); }
    catch (err: any) { addToast('Falha ao remover relacionamento', err.message, 'error'); }
  };

  const handleDeleteIndex = async (index: DbIndex) => {
    if (!window.confirm(`Excluir o índice '${index.name}'?`)) return;
    try { await databaseService.deleteIndex(index.id, orgId, projId, envId); await loadAllData(true); addToast('Índice removido', index.name, 'warning'); }
    catch (err: any) { addToast('Falha ao remover índice', err.message, 'error'); }
  };

  const handleDeleteFunction = async (fn: DbFunction) => {
    if (fn.arguments.trim()) { addToast('Exclusão manual necessária', 'Funções com argumentos exigem migration SQL revisada para evitar ambiguidade de assinatura.', 'warning'); return; }
    if (!window.confirm(`Excluir a função '${fn.name}()'?`)) return;
    try { await databaseService.deleteFunction(fn.name, orgId, projId, envId); await loadAllData(true); addToast('Função removida', fn.name, 'warning'); }
    catch (err: any) { addToast('Falha ao remover função', err.message, 'error'); }
  };

  const handleToggleTrigger = async (trigger: DbTrigger) => {
    try { await databaseService.setTriggerEnabled(trigger.name, !trigger.enabled, orgId, projId, envId); await loadAllData(true); addToast('Trigger atualizado', `${trigger.name}: ${trigger.enabled ? 'desativado' : 'ativado'}.`, 'success'); }
    catch (err: any) { addToast('Falha ao atualizar trigger', err.message, 'error'); }
  };

  const handleDeleteTrigger = async (trigger: DbTrigger) => {
    if (!window.confirm(`Excluir o trigger '${trigger.name}'?`)) return;
    try { await databaseService.deleteTrigger(trigger.name, orgId, projId, envId); await loadAllData(true); addToast('Trigger removido', trigger.name, 'warning'); }
    catch (err: any) { addToast('Falha ao remover trigger', err.message, 'error'); }
  };

  const currentSchema = tables.find((t) => t.name === selectedTableName);
  const hasTriggerDependencies = tables.length > 0 && functions.length > 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Active Project Context */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-slate-100">Database Engine (PostgreSQL 16)</h1>
            <span className="text-xs font-mono font-semibold text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800/40 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Projeto: <strong className="text-slate-200">{currentProject?.name || projId}</strong> &bull; Ambiente: <strong className="text-purple-300 uppercase">{environment}</strong>
          </p>
        </div>

        {/* Database Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Tabelas</span>
            <span className="text-sm font-bold font-mono text-slate-200">{overview?.tableCount ?? tables.length}</span>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Tamanho</span>
            <span className="text-sm font-bold font-mono text-purple-300">{overview?.sizeMb ?? 0} MB</span>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Conexões</span>
            <span className="text-sm font-bold font-mono text-slate-200">{overview?.activeConnections ?? 0} / {overview?.maxConnections ?? 0}</span>
          </div>
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Schemas</span>
            <span className="text-sm font-bold font-mono text-slate-200">{schemas.length}</span>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 overflow-x-auto pb-1 text-xs font-medium">
        <div className="flex items-center gap-1 shrink-0">
          {[
            { id: 'tables', label: 'Tables & Data', icon: TableIcon },
            { id: 'sql', label: 'SQL Editor', icon: Code2 },
            { id: 'relationships', label: 'Relationships', icon: Network },
            { id: 'indexes', label: 'Indexes', icon: Activity },
            { id: 'functions', label: 'Functions', icon: Zap },
            { id: 'triggers', label: 'Triggers', icon: Layers },
            { id: 'migrations', label: 'Migrations', icon: GitCommit },
            { id: 'policies', label: 'RLS Policies', icon: ShieldCheck },
            { id: 'objects', label: 'Objects', icon: Boxes }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl border-t border-x transition-all shrink-0 ${
                  isActive
                    ? 'border-purple-500/50 bg-slate-900 text-white font-semibold shadow-lg'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className="w-4 h-4 text-purple-400" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => void refreshDatabaseView()}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors"
          title="Recarregar Dados do Banco"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab 1: Tables & Table Editor */}
      {activeTab === 'tables' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-1 space-y-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800 h-fit">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
                Tabelas ({tables.length})
              </span>
              <div className="flex items-center gap-1">
                {selectedTableName && <button onClick={() => void handleDeleteTable()} className="rounded border border-rose-900/60 p-1 text-rose-400 hover:bg-rose-950/40" title="Excluir tabela"><Trash2 className="h-3 w-3"/></button>}
                <button onClick={() => setIsNewTableModalOpen(true)} className="flex items-center gap-1 rounded bg-purple-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-purple-500 shadow"><Plus className="w-3 h-3" />Nova Tabela</button>
              </div>
            </div>

            <div className="pt-1 border-t border-slate-800">
              <span className="text-[9px] font-bold uppercase text-slate-500 block mb-1">Schema Isolado</span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSchema}
                  onChange={(e) => setSelectedSchema(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-purple-300 focus:outline-none"
                >
                  {schemas.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <span
                  className="shrink-0 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] font-semibold uppercase text-slate-500"
                  title="O BrisaBase expõe um schema public isolado por projeto e ambiente."
                >
                  gerenciado
                </span>
              </div>
            </div>

            <div className="space-y-1 pt-2 border-t border-slate-800/80 max-h-[420px] overflow-y-auto">
              {tables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => { setSelectedTableName(t.name); setRowPage(0); setRowSearch(''); setRowSortField(''); setRowFilters([]); loadedRowsRef.current=''; }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-all ${
                    selectedTableName === t.name
                      ? 'bg-purple-600/20 text-white border border-purple-500/30 font-bold shadow-md'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-[10px] font-normal text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded">{t.rowCount}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4">
            {currentSchema ? (
              <TableSpreadsheet
                tableSchema={currentSchema}
                rows={tableRows}
                totalCount={rowTotalCount}
                page={rowPage}
                pageSize={rowPageSize}
                searchTerm={rowSearch}
                sortField={rowSortField}
                sortOrder={rowSortOrder}
                filters={rowFilters}
                onPageChange={(page) => { setRowPage(page); loadedRowsRef.current=''; }}
                onSearchChange={(value) => { setRowSearch(value); setRowPage(0); loadedRowsRef.current=''; }}
                onSortChange={(field, order) => { setRowSortField(field); setRowSortOrder(order); setRowPage(0); loadedRowsRef.current=''; }}
                onFiltersChange={(filters) => { setRowFilters(filters); setRowPage(0); loadedRowsRef.current=''; }}
                onInsertRow={handleInsertRow}
                onUpdateRow={handleUpdateRow}
                onDeleteRow={handleDeleteRow}
                onDataChanged={async () => { loadedRowsRef.current=''; await loadRowsForTable(selectedTableName, true); await loadAllData(true); }}
                onSchemaChanged={async (renamedTo) => { loadedRowsRef.current=''; await loadAllData(true); if (renamedTo) setSelectedTableName(renamedTo); else await loadRowsForTable(selectedTableName, true); }}
              />
            ) : (
              <div className="p-12 text-center text-slate-500 rounded-2xl border border-slate-800 bg-slate-900/40">
                Selecione ou crie uma tabela para visualizar e gerenciar registros.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: SQL Editor */}
      {activeTab === 'sql' && <SqlEditorView onExecuteSql={handleExecuteSql} tables={tables} />}

      {/* Tab 3: Relationships Graph */}
      {activeTab === 'relationships' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Network className="w-4 h-4 text-purple-400" />
              Relacionamentos & Chaves Estrangeiras ({relationships.length})
            </h3>
            <button
              onClick={() => setIsNewRelModalOpen(true)}
              disabled={tables.length < 2}
              title={tables.length < 2 ? 'Crie pelo menos duas tabelas para definir uma chave estrangeira.' : 'Criar chave estrangeira'}
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40 shadow-md shadow-purple-900/30"
            >
              <Plus className="w-4 h-4" />
              + Nova Chave Estrangeira
            </button>
          </div>
          <RelationshipsGraph relationships={relationships} tables={tables} onDelete={(relationship) => void handleDeleteRelationship(relationship)} />
        </div>
      )}

      {/* Tab 4: Indexes */}
      {activeTab === 'indexes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Índices do PostgreSQL ({indexes.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Otimização de consultas usando índices reais B-tree, Hash, GIN e GiST.</p>
            </div>
            <button
              onClick={() => {
                if (tables.length > 0) setNewIdxTable(tables[0].name);
                setIsNewIndexModalOpen(true);
              }}
              disabled={tables.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors shadow-md shadow-purple-900/30"
            >
              <Plus className="w-4 h-4" />
              + Criar Novo Índice
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                  <th className="px-4 py-3 font-semibold">Nome do Índice</th>
                  <th className="px-4 py-3 font-semibold">Tabela</th>
                  <th className="px-4 py-3 font-semibold">Colunas</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Único</th>
                  <th className="px-4 py-3 font-semibold text-right">Tamanho</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {indexes.map((idx) => (
                  <tr key={idx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-slate-200">{idx.name}</td>
                    <td className="px-4 py-2.5 text-purple-300">{idx.tableName}</td>
                    <td className="px-4 py-2.5 text-slate-300">{idx.columns.join(', ')}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] uppercase font-bold text-purple-400 bg-purple-950 px-2 py-0.5 rounded border border-purple-800/40">{idx.type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">{idx.isUnique ? 'Sim (UNIQUE)' : 'Não'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{idx.sizeKb} KB</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => void handleDeleteIndex(idx)} className="p-1 text-slate-500 hover:text-rose-400" title="Excluir índice"><Trash2 className="h-3.5 w-3.5"/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Functions */}
      {activeTab === 'functions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                Funções PostgreSQL ({functions.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Funções PL/pgSQL ou SQL executadas dentro do schema isolado deste ambiente.</p>
            </div>
            <button
              onClick={() => setIsNewFunctionModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"
            >
              <Plus className="w-4 h-4" />
              + Criar Função PostgreSQL
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {functions.map((fn) => (
              <div key={fn.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-mono text-sm font-bold text-purple-300">{fn.name}()</span>
                  <div className="flex items-center gap-2"><span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">{fn.language} &bull; {fn.returnType}</span><button onClick={() => void handleDeleteFunction(fn)} className="p-1 text-slate-500 hover:text-rose-400" title="Excluir função"><Trash2 className="h-3.5 w-3.5"/></button></div>
                </div>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">{fn.definition}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 6: Triggers */}
      {activeTab === 'triggers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                Triggers Automatizados do Postgres ({triggers.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Gatilhos BEFORE/AFTER disparados em INSERT, UPDATE ou DELETE nas tabelas do projeto.</p>
            </div>
            <button
              onClick={() => {
                if (tables.length > 0) setNewTrigTable(tables[0].name);
                if (functions.length > 0) setNewTrigFn(functions[0].name);
                setIsNewTriggerModalOpen(true);
              }}
              disabled={!hasTriggerDependencies}
              title={!hasTriggerDependencies ? 'Crie uma tabela e uma função PostgreSQL antes de criar o trigger.' : 'Criar trigger'}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40 shadow-md shadow-purple-900/30"
            >
              <Plus className="w-4 h-4" />
              + Criar Trigger
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-slate-400">
                  <th className="px-4 py-3 font-semibold">Nome do Trigger</th>
                  <th className="px-4 py-3 font-semibold">Tabela Alvo</th>
                  <th className="px-4 py-3 font-semibold">Timing</th>
                  <th className="px-4 py-3 font-semibold">Evento</th>
                  <th className="px-4 py-3 font-semibold">Função Associada</th>
                  <th className="px-4 py-3 font-semibold text-right">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {triggers.map((trig) => (
                  <tr key={trig.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 font-bold text-slate-200">{trig.name}</td>
                    <td className="px-4 py-2.5 text-purple-300">{trig.tableName}</td>
                    <td className="px-4 py-2.5 text-slate-300">{trig.timing}</td>
                    <td className="px-4 py-2.5 text-amber-300">{trig.event}</td>
                    <td className="px-4 py-2.5 text-slate-300">{trig.functionName}()</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${trig.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>{trig.enabled ? 'ATIVO' : 'DESATIVADO'}</td>
                    <td className="px-4 py-2.5 text-right"><button onClick={() => void handleToggleTrigger(trig)} className="mr-2 rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-300">{trig.enabled ? 'Desativar' : 'Ativar'}</button><button onClick={() => void handleDeleteTrigger(trig)} className="p-1 text-slate-500 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5"/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 7: Migrations */}
      {activeTab === 'migrations' && <MigrationsView migrations={migrations} onApplied={refreshDatabaseView} />}

      {activeTab === 'policies' && <DatabasePoliciesView tables={tables} />}

      {activeTab === 'objects' && <DatabaseObjectsView />}

      {/* Modal 1: New Table Modal */}
      {isNewTableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-purple-400" />
                Criar Nova Tabela em `{selectedSchema}`
              </h3>
              <button onClick={() => setIsNewTableModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleCreateTableSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Nome da Tabela</label>
                <input
                  type="text"
                  placeholder="ex: profiles, invoices, tags"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Definição das Colunas</span>
                  <button
                    type="button"
                    onClick={() => setNewTableCols([...newTableCols, { name: `col_${newTableCols.length + 1}`, type: 'text', isNullable: true }])}
                    className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Coluna
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800">
                  {newTableCols.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-mono">
                      <input
                        type="text"
                        placeholder="Nome"
                        value={col.name}
                        onChange={(e) => {
                          const updated = [...newTableCols];
                          updated[idx].name = e.target.value;
                          setNewTableCols(updated);
                        }}
                        className="w-1/3 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-slate-200"
                      />
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const updated = [...newTableCols];
                          updated[idx].type = e.target.value as any;
                          setNewTableCols(updated);
                        }}
                        className="w-1/3 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-slate-200"
                      >
                        {['uuid', 'text', 'varchar', 'char', 'integer', 'bigint', 'numeric', 'decimal', 'real', 'double precision', 'boolean', 'date', 'timestamp', 'timestamptz', 'json', 'jsonb'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <label className="flex items-center gap-1 text-[10px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={col.isPrimaryKey || false}
                          onChange={(e) => {
                            const updated = [...newTableCols];
                            updated[idx].isPrimaryKey = e.target.checked;
                            setNewTableCols(updated);
                          }}
                        />
                        PK
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-slate-400">
                        <input
                          type="checkbox"
                          checked={col.isNullable ?? true}
                          onChange={(e) => {
                            const updated = [...newTableCols];
                            updated[idx].isNullable = e.target.checked;
                            setNewTableCols(updated);
                          }}
                        />
                        Null
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewTableCols(newTableCols.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-500 hover:text-rose-400 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsNewTableModalOpen(false)} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30">Criar Tabela no Postgres</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: New Index Modal */}
      {isNewIndexModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-100">Criar Novo Índice no Postgres</h3>
              <button onClick={() => setIsNewIndexModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateIndexSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Nome do Índice</label>
                <input type="text" placeholder="ex: idx_users_email" value={newIdxName} onChange={(e) => setNewIdxName(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Tabela Alvo</label>
                <select value={newIdxTable} onChange={(e) => setNewIdxTable(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                  {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Colunas (separadas por vírgula)</label>
                <input type="text" placeholder="ex: email ou user_id, status" value={newIdxCols} onChange={(e) => setNewIdxCols(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Tipo de Índice</label>
                  <select value={newIdxType} onChange={(e) => setNewIdxType(e.target.value as any)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="btree">B-tree</option>
                    <option value="hash">Hash</option>
                    <option value="gin">GIN</option>
                    <option value="gist">GiST</option>
                    <option value="brin">BRIN</option>
                  </select>
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300 pb-2">
                    <input type="checkbox" checked={newIdxUnique} onChange={(e) => setNewIdxUnique(e.target.checked)} />
                    Único (UNIQUE)
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsNewIndexModalOpen(false)} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30">Aplicar Índice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: New Function Modal */}
      {isNewFunctionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-100">Criar Função PostgreSQL</h3>
              <button onClick={() => setIsNewFunctionModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateFunctionSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Nome da Função</label>
                <input type="text" placeholder="ex: update_updated_at_column" value={newFnName} onChange={(e) => setNewFnName(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Argumentos (opcional)</label>
                <input type="text" placeholder="ex: value numeric" value={newFnArgs} onChange={(e) => setNewFnArgs(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Tipo de Retorno</label>
                  <input type="text" placeholder="trigger ou numeric" value={newFnReturn} onChange={(e) => setNewFnReturn(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Linguagem</label>
                  <select value={newFnLang} onChange={(e) => setNewFnLang(e.target.value as any)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="plpgsql">plpgsql</option>
                    <option value="sql">sql</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Corpo da Função</label>
                <textarea rows={6} value={newFnCode} onChange={(e) => setNewFnCode(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
              </div>
              <p className="text-[10px] text-slate-500">Use apenas o corpo da função. O BrisaBase define schema, LANGUAGE e search_path isolado automaticamente.</p>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsNewFunctionModalOpen(false)} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30">Salvar Função</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: New Trigger Modal */}
      {isNewTriggerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-100">Criar Trigger no Postgres</h3>
              <button onClick={() => setIsNewTriggerModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateTriggerSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Nome do Trigger</label>
                <input type="text" placeholder="ex: update_updated_at_trig" value={newTrigName} onChange={(e) => setNewTrigName(e.target.value)} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Tabela Alvo</label>
                <select value={newTrigTable} onChange={(e) => setNewTrigTable(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                  {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Timing</label>
                  <select value={newTrigTiming} onChange={(e) => setNewTrigTiming(e.target.value as 'BEFORE' | 'AFTER')} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="BEFORE">BEFORE</option>
                    <option value="AFTER">AFTER</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-300">Evento</label>
                  <select value={newTrigEvent} onChange={(e) => setNewTrigEvent(e.target.value as 'INSERT' | 'UPDATE' | 'DELETE')} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                    <option value="INSERT">INSERT</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Função Executada</label>
                <select value={newTrigFn} onChange={(e) => setNewTrigFn(e.target.value)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none">
                  {functions.map((f) => <option key={f.name} value={f.name}>{f.name}()</option>)}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsNewTriggerModalOpen(false)} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30">Ativar Trigger</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: New Relationship Modal */}
      {isNewRelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-slate-100">Criar Chave Estrangeira (FK)</h3>
              <button onClick={() => setIsNewRelModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateRelSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Tabela de Origem</label>
                <select
                  value={newRelFromTable}
                  onChange={(e) => {
                    const tableName = e.target.value;
                    setNewRelFromTable(tableName);
                    const selected = tables.find((item) => item.name === tableName);
                    setNewRelFromCol(selected?.columns[0]?.name || '');
                  }}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Coluna de Origem (FK)</label>
                <select value={newRelFromCol} onChange={(e) => setNewRelFromCol(e.target.value)} disabled={!newRelFromTable} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 disabled:opacity-50 focus:border-purple-500 focus:outline-none">
                  <option value="">Selecione...</option>
                  {tables.find((t) => t.name === newRelFromTable)?.columns.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Tabela de Destino (Referenciada)</label>
                <select
                  value={newRelToTable}
                  onChange={(e) => {
                    const tableName = e.target.value;
                    setNewRelToTable(tableName);
                    const selected = tables.find((item) => item.name === tableName);
                    setNewRelToCol(selected?.columns.find((column) => column.isPrimaryKey)?.name || selected?.columns[0]?.name || '');
                  }}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {tables.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Coluna de Destino (PK/UNIQUE)</label>
                <select value={newRelToCol} onChange={(e) => setNewRelToCol(e.target.value)} disabled={!newRelToTable} required className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 disabled:opacity-50 focus:border-purple-500 focus:outline-none">
                  <option value="">Selecione...</option>
                  {tables.find((t) => t.name === newRelToTable)?.columns.map((column) => <option key={column.name} value={column.name}>{column.name} ({column.type})</option>)}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsNewRelModalOpen(false)} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                <button type="submit" className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30">Criar Relacionamento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
