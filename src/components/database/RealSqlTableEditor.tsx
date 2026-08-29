import React, { useEffect, useMemo, useState } from 'react';
import { Braces, Columns3, Database, KeyRound, Plus, RefreshCw, Table2, Trash2 } from 'lucide-react';
import type { DbIndex, TableRow, TableSchema } from '../../brisabase/types';
import { realDatabaseService } from '../../services/runtime';
import { useApp } from '../../context/AppContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Tabs } from '../ui/Tabs';

interface Props {
  revision?: number;
  onOpenSql: () => void;
  onSchemaChange: () => void;
}

const SQL_TYPES = ['text', 'uuid', 'integer', 'bigint', 'numeric', 'boolean', 'date', 'timestamptz', 'jsonb'];
const safeIdentifier = (value: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);

export const RealSqlTableEditor: React.FC<Props> = ({ revision, onOpenSql, onSchemaChange }) => {
  const { activeProject, showToast } = useApp();
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [indexes, setIndexes] = useState<DbIndex[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [activeView, setActiveView] = useState('rows');
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);
  const [rowOpen, setRowOpen] = useState(false);
  const [tableName, setTableName] = useState('');
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState('text');
  const [columnNullable, setColumnNullable] = useState(true);
  const [rowJson, setRowJson] = useState('{}');

  const activeTable = useMemo(() => tables.find((table) => table.name === selectedName) || tables[0] || null, [tables, selectedName]);

  const loadSchema = async () => {
    setLoading(true);
    try {
      const [tableList, indexList] = await Promise.all([
        realDatabaseService.listTables(),
        realDatabaseService.getIndexes().catch(() => [])
      ]);
      setTables(tableList);
      setIndexes(indexList);
      setSelectedName((current) => tableList.some((table) => table.name === current) ? current : tableList[0]?.name || '');
    } catch (error) {
      showToast('Falha ao carregar PostgreSQL', error instanceof Error ? error.message : 'Runtime indisponível.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRows = async () => {
    if (!activeTable) return setRows([]);
    setRowsLoading(true);
    try {
      const result = await realDatabaseService.getTableRows(activeTable.name, { limit: 100, offset: 0 });
      setRows(result.rows);
    } catch (error) {
      setRows([]);
      showToast('Falha ao carregar registros', error instanceof Error ? error.message : undefined, 'error');
    } finally {
      setRowsLoading(false);
    }
  };

  useEffect(() => { if (activeProject?.id) void loadSchema(); }, [activeProject?.id, revision]);
  useEffect(() => { void loadRows(); }, [activeTable?.name]);

  const createTable = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const raw = tableName.trim();
    const name = raw.includes('.') ? raw.split('.').pop() || '' : raw;
    const schema = raw.includes('.') ? raw.split('.')[0] : 'public';
    if (!safeIdentifier(name) || !safeIdentifier(schema)) return showToast('Nome inválido', 'Use apenas letras, números e underscore.', 'error');
    try {
      await realDatabaseService.createTable({
        name,
        schema,
        columns: [
          { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false, defaultValue: 'gen_random_uuid()' },
          { name: 'created_at', type: 'timestamptz', isNullable: false, defaultValue: 'now()' }
        ]
      });
      setCreateOpen(false);
      setTableName('');
      await loadSchema();
      setSelectedName(name);
      onSchemaChange();
      showToast('Tabela criada', `${schema}.${name} foi criada no PostgreSQL real.`, 'success');
    } catch (error) {
      showToast('Erro ao criar tabela', error instanceof Error ? error.message : undefined, 'error');
    }
  };

  const addColumn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeTable || !safeIdentifier(columnName) || !SQL_TYPES.includes(columnType)) return showToast('Coluna inválida', 'Revise nome e tipo.', 'error');
    try {
      const schema = activeTable.schema || 'public';
      await realDatabaseService.executeQuery(`ALTER TABLE "${schema}"."${activeTable.name}" ADD COLUMN "${columnName}" ${columnType}${columnNullable ? '' : ' NOT NULL'};`);
      setColumnOpen(false);
      setColumnName('');
      await loadSchema();
      onSchemaChange();
      showToast('Coluna adicionada', `${columnName} agora existe na tabela real.`, 'success');
    } catch (error) {
      showToast('Erro ao adicionar coluna', error instanceof Error ? error.message : undefined, 'error');
    }
  };

  const openInsert = () => {
    if (!activeTable) return;
    const payload = Object.fromEntries(activeTable.columns
      .filter((column) => !column.isPrimaryKey && !column.defaultValue)
      .map((column) => [column.name, null]));
    setRowJson(JSON.stringify(payload, null, 2));
    setRowOpen(true);
  };

  const insertRow = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeTable) return;
    try {
      const parsed = JSON.parse(rowJson);
      await realDatabaseService.insertRow(activeTable.name, parsed);
      setRowOpen(false);
      await Promise.all([loadRows(), loadSchema()]);
      showToast('Registro inserido', `INSERT real em ${activeTable.name}.`, 'success');
    } catch (error) {
      showToast('Erro no INSERT', error instanceof Error ? error.message : 'JSON inválido.', 'error');
    }
  };

  const removeRow = async (row: TableRow) => {
    if (!activeTable || row.id === undefined || !window.confirm(`Excluir o registro ${String(row.id)} do PostgreSQL real?`)) return;
    try {
      await realDatabaseService.deleteRow(activeTable.name, String(row.id));
      await loadRows();
      showToast('Registro excluído', 'DELETE confirmado no PostgreSQL.', 'info');
    } catch (error) { showToast('Erro ao excluir', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const removeTable = async () => {
    if (!activeTable || !window.confirm(`DROP TABLE ${activeTable.schema || 'public'}.${activeTable.name}? Esta ação é REAL e destrutiva.`)) return;
    try {
      await realDatabaseService.deleteTable(activeTable.name);
      await loadSchema();
      onSchemaChange();
      showToast('Tabela removida', 'DROP TABLE concluído no PostgreSQL.', 'warning');
    } catch (error) { showToast('Erro ao remover tabela', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const tableIndexes = activeTable ? indexes.filter((index) => index.tableName === activeTable.name) : [];

  return <div className="space-y-4">
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div><div className="flex items-center gap-2"><Database className="w-4 h-4 text-emerald-400"/><h2 className="text-sm font-bold text-slate-100">Table Editor</h2><Badge variant="success" size="sm" dot>PostgreSQL REAL</Badge></div><p className="mt-1 text-xs text-slate-400">Schemas, tabelas e rows vêm do PostgreSQL isolado do projeto ativo.</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void loadSchema()} leftIcon={<RefreshCw className="w-3.5 h-3.5"/>}>Atualizar</Button><Button variant="outline" size="sm" onClick={onOpenSql} leftIcon={<Braces className="w-3.5 h-3.5"/>}>SQL</Button><Button variant="gradient" size="sm" onClick={() => setCreateOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5"/>}>Nova tabela</Button></div>
    </div>

    <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
      <aside className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-3 min-h-[520px]">
        <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Tabelas reais</div>
        {loading ? <div className="p-3 text-xs text-slate-500">Carregando schema…</div> : tables.length === 0 ? <div className="p-3 text-xs text-slate-500">Nenhuma tabela.</div> : <div className="space-y-1">{tables.map((table) => <button key={`${table.schema}.${table.name}`} onClick={() => setSelectedName(table.name)} className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left border ${activeTable?.name===table.name?'bg-blue-600/20 border-blue-500/30 text-white':'border-transparent hover:bg-white/[0.04] text-slate-300'}`}><Table2 className="w-3.5 h-3.5 text-cyan-400"/><div className="min-w-0"><div className="text-xs font-semibold truncate">{table.name}</div><div className="text-[10px] text-slate-500">{table.schema || 'public'} • {table.rowCount} rows</div></div></button>)}</div>}
      </aside>

      <section className="min-w-0 space-y-4">
        {!activeTable ? <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-400 text-sm">Crie sua primeira tabela no PostgreSQL.</div> : <>
          <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Database className="w-4 h-4 text-cyan-400"/><h3 className="font-bold text-slate-100">{activeTable.schema || 'public'}.{activeTable.name}</h3></div><div className="mt-2 text-[11px] text-slate-500">{activeTable.columns.length} colunas • {activeTable.rowCount} rows • {(activeTable.sizeBytes/1024).toFixed(1)} KB</div></div><Button variant="danger" size="sm" onClick={removeTable} leftIcon={<Trash2 className="w-3.5 h-3.5"/>}>Excluir tabela</Button></div>
          <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden"><div className="px-4 pt-3"><Tabs tabs={[{id:'rows',label:'Rows',count:rows.length},{id:'columns',label:'Columns',count:activeTable.columns.length},{id:'indexes',label:'Indexes',count:tableIndexes.length}]} activeTab={activeView} onChange={setActiveView}/></div><div className="p-4">
            {activeView==='rows' && <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Primeiros 100 registros do banco real.</span><Button variant="outline" size="sm" onClick={openInsert} leftIcon={<Plus className="w-3.5 h-3.5"/>}>Insert row</Button></div>{rowsLoading?<div className="p-8 text-center text-xs text-slate-500">Consultando PostgreSQL…</div>:rows.length===0?<div className="p-10 text-center rounded-xl border border-dashed border-white/10 text-xs text-slate-500">Nenhum registro.</div>:<div className="overflow-x-auto rounded-xl border border-white/[0.06]"><table className="w-full text-left text-xs"><thead className="bg-[#0B1628] text-[10px] uppercase text-slate-500"><tr>{activeTable.columns.map(c=><th key={c.name} className="px-3 py-2.5 whitespace-nowrap">{c.name}</th>)}<th className="px-3 py-2.5 text-right">Ações</th></tr></thead><tbody className="divide-y divide-white/[0.05] font-mono text-slate-300">{rows.map((row,index)=><tr key={String(row.id??index)} className="hover:bg-white/[0.03]">{activeTable.columns.map(c=><td key={c.name} className="px-3 py-2.5 max-w-[240px] truncate">{row[c.name]===null||row[c.name]===undefined?<span className="text-slate-600">NULL</span>:typeof row[c.name]==='object'?JSON.stringify(row[c.name]):String(row[c.name])}</td>)}<td className="px-3 py-2.5 text-right"><button onClick={()=>void removeRow(row)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5"/></button></td></tr>)}</tbody></table></div>}</div>}
            {activeView==='columns' && <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-xs text-slate-400">Schema introspectado do PostgreSQL.</span><Button variant="outline" size="sm" onClick={()=>setColumnOpen(true)} leftIcon={<Columns3 className="w-3.5 h-3.5"/>}>Add column</Button></div>{activeTable.columns.map(column=><div key={column.name} className="grid grid-cols-[minmax(140px,1fr)_minmax(110px,1fr)_auto] gap-3 items-center rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-200">{column.name}{column.isPrimaryKey&&<KeyRound className="w-3.5 h-3.5 text-amber-400"/>}</div><div className="font-mono text-xs text-cyan-300">{column.type}</div><div className="flex gap-1"><Badge variant={column.isNullable===false?'primary':'neutral'} size="sm">{column.isNullable===false?'not null':'nullable'}</Badge>{column.isUnique&&<Badge variant="cyan" size="sm">unique</Badge>}</div></div>)}</div>}
            {activeView==='indexes' && <div className="space-y-2">{tableIndexes.length===0?<div className="p-8 text-center text-xs text-slate-500">Nenhum índice adicional.</div>:tableIndexes.map(index=><div key={index.id} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between"><div><div className="text-xs font-semibold text-slate-200">{index.name}</div><div className="text-[10px] text-slate-500 font-mono">{index.type} ({index.columns.join(', ')})</div></div>{index.isUnique&&<Badge variant="cyan" size="sm">unique</Badge>}</div>)}</div>}
          </div></div>
        </>}
      </section>
    </div>

    <Modal isOpen={createOpen} onClose={()=>setCreateOpen(false)} title="Criar tabela PostgreSQL" subtitle="Esta ação cria uma tabela REAL no projeto ativo." footer={<><Button variant="outline" size="sm" onClick={()=>setCreateOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={createTable} disabled={!tableName.trim()}>Criar tabela</Button></>}><form onSubmit={createTable}><Input label="Tabela" placeholder="public.customers" value={tableName} onChange={e=>setTableName(e.target.value)} autoFocus/><p className="mt-3 text-xs text-slate-500">Inclui id UUID e created_at. Para schemas complexos use o SQL Editor.</p></form></Modal>
    <Modal isOpen={columnOpen} onClose={()=>setColumnOpen(false)} title={`Adicionar coluna • ${activeTable?.name||''}`} subtitle="ALTER TABLE será executado no PostgreSQL real." footer={<><Button variant="outline" size="sm" onClick={()=>setColumnOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={addColumn} disabled={!columnName.trim()}>Adicionar</Button></>}><form onSubmit={addColumn} className="space-y-4"><Input label="Nome" placeholder="status" value={columnName} onChange={e=>setColumnName(e.target.value)}/><div><label className="block text-xs font-semibold text-slate-300 mb-1.5">Tipo</label><select value={columnType} onChange={e=>setColumnType(e.target.value)} className="w-full rounded-xl bg-[#07111F] border border-white/10 text-sm p-2.5">{SQL_TYPES.map(type=><option key={type}>{type}</option>)}</select></div><label className="flex items-center justify-between text-xs text-slate-300"><span>Permitir NULL</span><input type="checkbox" checked={columnNullable} onChange={e=>setColumnNullable(e.target.checked)} className="accent-cyan-500"/></label></form></Modal>
    <Modal isOpen={rowOpen} onClose={()=>setRowOpen(false)} title={`Insert row • ${activeTable?.name||''}`} subtitle="O JSON será enviado ao endpoint real de rows." footer={<><Button variant="outline" size="sm" onClick={()=>setRowOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={insertRow}>Inserir</Button></>}><form onSubmit={insertRow}><textarea value={rowJson} onChange={e=>setRowJson(e.target.value)} className="w-full h-72 rounded-xl bg-[#020617] border border-white/10 p-4 font-mono text-xs text-cyan-300 outline-none focus:border-cyan-400" spellCheck={false}/></form></Modal>
  </div>;
};
