import React, { useEffect, useMemo, useState } from 'react';
import {
  Braces,
  Columns3,
  Database,
  Edit3,
  KeyRound,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Table2,
  Trash2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { createSqlTable, getSqlDatabaseState, updateSqlTable } from '../../services/sqlMock';
import { SqlColumn, SqlTable } from '../../types/sql';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';

interface SqlTableEditorProps {
  revision: number;
  onOpenSql: () => void;
  onSchemaChange: () => void;
}

const defaultColumns: SqlColumn[] = [
  { name: 'id', type: 'uuid', nullable: false, primaryKey: true, defaultValue: 'gen_random_uuid()' },
  { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' }
];

export const SqlTableEditor: React.FC<SqlTableEditorProps> = ({ revision, onOpenSql, onSchemaChange }) => {
  const { activeProject, showToast } = useApp();
  const projectId = activeProject?.id;
  const [tables, setTables] = useState<SqlTable[]>([]);
  const [activeTableId, setActiveTableId] = useState('');
  const [activeView, setActiveView] = useState('rows');
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [isColumnOpen, setIsColumnOpen] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState('text');
  const [columnNullable, setColumnNullable] = useState(true);
  const [isRowOpen, setIsRowOpen] = useState(false);
  const [rowJson, setRowJson] = useState('{}');

  const reload = () => {
    const state = getSqlDatabaseState(projectId);
    setTables(state.tables);
    if (!activeTableId || !state.tables.some((table) => table.id === activeTableId)) {
      setActiveTableId(state.tables[0]?.id || '');
    }
  };

  useEffect(() => {
    reload();
    // revision is intentionally a reload trigger after SQL DDL execution.
  }, [projectId, revision]);

  const activeTable = tables.find((table) => table.id === activeTableId) || tables[0];
  const visibleTables = useMemo(
    () => tables.filter((table) => `${table.schema}.${table.name}`.toLowerCase().includes(query.toLowerCase())),
    [tables, query]
  );

  const createTable = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newTableName.trim()) return;
    try {
      const table = createSqlTable(projectId, newTableName.trim(), defaultColumns);
      reload();
      setActiveTableId(table.id);
      setIsCreateOpen(false);
      setNewTableName('');
      onSchemaChange();
      showToast('Tabela criada', `${table.schema}.${table.name} foi criada no PostgreSQL simulado.`, 'success');
    } catch (error) {
      showToast('Não foi possível criar', error instanceof Error ? error.message : 'Verifique o nome da tabela.', 'error');
    }
  };

  const addColumn = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeTable || !columnName.trim()) return;
    try {
      updateSqlTable(projectId, activeTable.id, (table) => ({
        ...table,
        columns: [...table.columns, { name: columnName.trim(), type: columnType, nullable: columnNullable }],
        rows: table.rows.map((row) => ({ ...row, [columnName.trim()]: null }))
      }));
      setColumnName('');
      setColumnType('text');
      setColumnNullable(true);
      setIsColumnOpen(false);
      reload();
      onSchemaChange();
      showToast('Coluna adicionada', `${columnName} foi adicionada em modo simulado.`, 'success');
    } catch (error) {
      showToast('Erro ao adicionar coluna', error instanceof Error ? error.message : 'Tente novamente.', 'error');
    }
  };

  const toggleRls = () => {
    if (!activeTable) return;
    updateSqlTable(projectId, activeTable.id, (table) => ({ ...table, rlsEnabled: !table.rlsEnabled }));
    reload();
    showToast('RLS atualizado', `Row Level Security ${activeTable.rlsEnabled ? 'desativado' : 'ativado'} no mock.`, 'success');
  };

  const toggleRealtime = () => {
    if (!activeTable) return;
    updateSqlTable(projectId, activeTable.id, (table) => ({ ...table, realtimeEnabled: !table.realtimeEnabled }));
    reload();
    showToast('Realtime atualizado', `Publicação realtime ${activeTable.realtimeEnabled ? 'removida' : 'ativada'} no mock.`, 'success');
  };

  const addRow = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeTable) return;
    try {
      const parsed = JSON.parse(rowJson);
      updateSqlTable(projectId, activeTable.id, (table) => ({ ...table, rows: [parsed, ...table.rows] }));
      reload();
      setIsRowOpen(false);
      setRowJson('{}');
      showToast('Row inserida', `Registro adicionado em ${activeTable.name} no mock.`, 'success');
    } catch {
      showToast('JSON inválido', 'Corrija o payload antes de inserir.', 'error');
    }
  };

  const deleteRow = (index: number) => {
    if (!activeTable) return;
    updateSqlTable(projectId, activeTable.id, (table) => ({ ...table, rows: table.rows.filter((_, rowIndex) => rowIndex !== index) }));
    reload();
    showToast('Row removida', 'Registro removido apenas do armazenamento simulado.', 'info');
  };

  const openNewRow = () => {
    if (!activeTable) return;
    const template = Object.fromEntries(activeTable.columns.map((column) => [column.name, column.defaultValue || null]));
    setRowJson(JSON.stringify(template, null, 2));
    setIsRowOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-100">PostgreSQL Table Editor</h2>
            <Badge variant="success" size="sm">SQL mock</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">Crie tabelas visualmente ou use o SQL Editor; DDL executado no editor aparece aqui automaticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenSql} leftIcon={<Braces className="w-3.5 h-3.5" />}>SQL Editor</Button>
          <Button variant="gradient" size="sm" onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>Nova tabela</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] gap-4">
        <aside className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-3 h-fit">
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tabela..." className="w-full bg-[#020617] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400" />
          </div>
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">public</span>
            <Badge variant="neutral" size="sm">{visibleTables.length}</Badge>
          </div>
          <div className="space-y-1">
            {visibleTables.map((table) => (
              <button key={table.id} onClick={() => setActiveTableId(table.id)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${table.id === activeTable?.id ? 'bg-[#1677FF] text-white' : 'text-slate-300 hover:bg-white/[0.05]'}`}>
                <Table2 className={`w-3.5 h-3.5 ${table.id === activeTable?.id ? 'text-white' : 'text-cyan-400'}`} />
                <div className="min-w-0"><div className="text-xs font-semibold truncate">{table.name}</div><div className={`text-[10px] ${table.id === activeTable?.id ? 'text-blue-100' : 'text-slate-500'}`}>{table.rows.length} rows</div></div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          {!activeTable ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-400 text-sm">Crie sua primeira tabela para começar.</div>
          ) : (
            <>
              <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400" /><h3 className="text-base font-bold text-slate-100">{activeTable.schema}.{activeTable.name}</h3></div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500"><span>{activeTable.columns.length} colunas</span><span>•</span><span>{activeTable.rows.length} rows</span><span>•</span><span>{activeTable.size}</span></div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={toggleRls} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border ${activeTable.rlsEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-white/[0.03] border-white/10 text-slate-400'}`}><ShieldCheck className="w-3.5 h-3.5" /> RLS {activeTable.rlsEnabled ? 'ON' : 'OFF'}</button>
                    <button onClick={toggleRealtime} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border ${activeTable.realtimeEnabled ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300' : 'bg-white/[0.03] border-white/10 text-slate-400'}`}><Radio className="w-3.5 h-3.5" /> Realtime {activeTable.realtimeEnabled ? 'ON' : 'OFF'}</button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden">
                <div className="px-4 pt-3">
                  <Tabs tabs={[{ id: 'rows', label: 'Rows', count: activeTable.rows.length }, { id: 'columns', label: 'Columns', count: activeTable.columns.length }, { id: 'indexes', label: 'Indexes' }]} activeTab={activeView} onChange={setActiveView} />
                </div>

                <div className="p-4">
                  {activeView === 'rows' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><div className="text-xs text-slate-400">Visualização de registros em `public.{activeTable.name}`.</div><Button variant="outline" size="sm" onClick={openNewRow} leftIcon={<Plus className="w-3.5 h-3.5" />}>Insert row</Button></div>
                      {activeTable.rows.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-xs text-slate-500">Nenhuma row ainda. Insira via UI ou SQL.</div> : (
                        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                          <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-[#0B1628] text-[10px] uppercase tracking-wider text-slate-500"><tr>{activeTable.columns.map((column) => <th key={column.name} className="px-3 py-2.5 whitespace-nowrap">{column.name}</th>)}<th className="px-3 py-2.5 text-right">Ações</th></tr></thead>
                            <tbody className="divide-y divide-white/[0.05] font-mono">
                              {activeTable.rows.map((row, index) => <tr key={index} className="hover:bg-white/[0.03]">{activeTable.columns.map((column) => <td key={column.name} className="px-3 py-2.5 max-w-[220px] truncate">{row[column.name] === null || row[column.name] === undefined ? <span className="text-slate-600">NULL</span> : String(row[column.name])}</td>)}<td className="px-3 py-2.5 text-right"><button onClick={() => deleteRow(index)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /></button></td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {activeView === 'columns' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><div className="text-xs text-slate-400">Tipos, constraints, defaults e relações.</div><Button variant="outline" size="sm" onClick={() => setIsColumnOpen(true)} leftIcon={<Columns3 className="w-3.5 h-3.5" />}>Add column</Button></div>
                      <div className="space-y-2">
                        {activeTable.columns.map((column) => <div key={column.name} className="grid grid-cols-[minmax(140px,1fr)_minmax(120px,1fr)_auto] gap-3 items-center rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><div><div className="flex items-center gap-2 text-xs font-semibold text-slate-200">{column.name}{column.primaryKey && <KeyRound className="w-3.5 h-3.5 text-amber-400" />}</div><div className="text-[10px] text-slate-500 mt-0.5">{column.references ? `FK → ${column.references}` : column.unique ? 'UNIQUE' : 'column'}</div></div><div className="font-mono text-xs text-cyan-300">{column.type}</div><div className="flex gap-1.5"><Badge variant={column.nullable ? 'neutral' : 'primary'} size="sm">{column.nullable ? 'nullable' : 'not null'}</Badge>{column.defaultValue && <Badge variant="cyan" size="sm">default</Badge>}</div></div>)}
                      </div>
                    </div>
                  )}

                  {activeView === 'indexes' && (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-400">Índices relacionados aparecem no Data Platform; crie novos via SQL Editor para refletir aqui na fase real.</div>
                      <div className="rounded-xl bg-[#020617] border border-white/[0.06] p-4 font-mono text-xs text-slate-300">CREATE INDEX idx_{activeTable.name}_created_at ON public.{activeTable.name} (created_at DESC);</div>
                      <Button variant="outline" size="sm" onClick={onOpenSql} leftIcon={<Braces className="w-3.5 h-3.5" />}>Criar índice com SQL</Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Criar tabela PostgreSQL" subtitle="A tabela será persistida somente no localStorage do projeto." footer={<><Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={createTable} disabled={!newTableName.trim()}>Criar tabela</Button></>}>
        <form onSubmit={createTable} className="space-y-4"><Input label="Nome" placeholder="public.customers" value={newTableName} onChange={(event) => setNewTableName(event.target.value)} autoFocus /><div className="rounded-xl bg-cyan-500/[0.06] border border-cyan-500/15 p-3 text-xs text-slate-400">A criação visual inclui automaticamente <code className="text-cyan-300">id uuid primary key</code> e <code className="text-cyan-300">created_at timestamptz</code>. Use o SQL Editor para schemas avançados.</div></form>
      </Modal>

      <Modal isOpen={isColumnOpen} onClose={() => setIsColumnOpen(false)} title={`Adicionar coluna • ${activeTable?.name || ''}`} subtitle="Defina um campo SQL no schema simulado." footer={<><Button variant="outline" size="sm" onClick={() => setIsColumnOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={addColumn} disabled={!columnName.trim()}>Adicionar</Button></>}>
        <form onSubmit={addColumn} className="space-y-4"><Input label="Nome da coluna" placeholder="status" value={columnName} onChange={(event) => setColumnName(event.target.value)} /><div><label className="block text-xs font-semibold text-slate-300 mb-1.5">Tipo</label><select value={columnType} onChange={(event) => setColumnType(event.target.value)} className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm p-2.5 outline-none focus:border-cyan-400"><option>text</option><option>uuid</option><option>integer</option><option>bigint</option><option>numeric(12,2)</option><option>boolean</option><option>date</option><option>timestamptz</option><option>jsonb</option><option>text[]</option><option>vector(1536)</option></select></div><label className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><span className="text-xs text-slate-300">Permitir NULL</span><input type="checkbox" checked={columnNullable} onChange={(event) => setColumnNullable(event.target.checked)} className="accent-cyan-500" /></label></form>
      </Modal>

      <Modal isOpen={isRowOpen} onClose={() => setIsRowOpen(false)} title={`Insert row • ${activeTable?.name || ''}`} subtitle="Edite o payload JSON; a row será adicionada somente ao mock." footer={<><Button variant="outline" size="sm" onClick={() => setIsRowOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={addRow}>Inserir</Button></>}>
        <form onSubmit={addRow}><textarea value={rowJson} onChange={(event) => setRowJson(event.target.value)} className="w-full h-80 rounded-xl bg-[#020617] border border-white/10 p-4 font-mono text-xs text-cyan-300 outline-none focus:border-cyan-400 resize-none" spellCheck={false} /></form>
      </Modal>
    </div>
  );
};
