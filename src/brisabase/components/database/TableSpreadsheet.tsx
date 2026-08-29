import React, { useEffect, useRef, useState } from 'react';
import { TableSchema, TableRow, ColumnDefinition, DatabaseRowFilter } from '../../types';
import { databaseService, realtimeService } from '../../services';
import { useApp } from '../../../context/AppContext';
import { Search, Plus, Trash2, Edit2, X, Check, Download, Upload, Settings2, ChevronLeft, ChevronRight, ArrowUpDown, Filter } from 'lucide-react';

interface TableSpreadsheetProps {
  tableSchema: TableSchema;
  rows: TableRow[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
  searchTerm?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: DatabaseRowFilter[];
  onPageChange?: (page: number) => void;
  onSearchChange?: (value: string) => void;
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
  onFiltersChange?: (filters: DatabaseRowFilter[]) => void;
  onInsertRow: (rowData: any) => Promise<void>;
  onUpdateRow: (rowId: string, rowData: any) => Promise<void>;
  onDeleteRow: (rowId: string) => Promise<void>;
  onDataChanged?: () => Promise<void> | void;
  onSchemaChanged?: (renamedTo?: string) => Promise<void> | void;
}

function display(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function coerceInput(value: string, column: ColumnDefinition): unknown {
  if (value === '' && column.isNullable) return null;
  if (column.type === 'boolean') return /^(true|1|sim|yes)$/i.test(value);
  if (['integer','bigint','numeric','decimal','real','double precision'].includes(column.type)) return value === '' ? null : Number(value);
  if (column.type === 'json' || column.type === 'jsonb') return value === '' ? null : JSON.parse(value);
  return value;
}

export const TableSpreadsheet: React.FC<TableSpreadsheetProps> = ({
  tableSchema, rows, totalCount = rows.length, page = 0, pageSize = 25, searchTerm = '', sortField = '', sortOrder = 'asc', filters = [],
  onPageChange, onSearchChange, onSortChange, onFiltersChange, onInsertRow, onUpdateRow, onDeleteRow, onDataChanged, onSchemaChanged,
}) => {
  const { activeOrganizationId, activeProjectId, activeEnvironmentId, addToast } = useApp();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSchemaOpen, setIsSchemaOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [liveRows, setLiveRows] = useState<TableRow[]>(rows);
  const [renameTo, setRenameTo] = useState(tableSchema.name);
  const [newColumn, setNewColumn] = useState<ColumnDefinition>({ name: '', type: 'text', isNullable: true });
  const [editColumnName, setEditColumnName] = useState('');
  const [editColumn, setEditColumn] = useState<Partial<ColumnDefinition> & { renameTo?: string }>({});
  const [importContent, setImportContent] = useState('');
  const [importFormat, setImportFormat] = useState<'csv'|'json'>('csv');
  const [importMode, setImportMode] = useState<'append'|'upsert'>('append');
  const [filterField, setFilterField] = useState('');
  const [filterOperator, setFilterOperator] = useState<DatabaseRowFilter['operator']>('eq');
  const [filterValue, setFilterValue] = useState('');
  const lastRealtimeEventRef = useRef('');

  const columns = tableSchema.columns;
  const primaryKeys = columns.filter((column) => column.isPrimaryKey);
  const primaryKey = primaryKeys.length === 1 ? primaryKeys[0].name : undefined;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => { setLiveRows(rows); }, [rows, tableSchema.name]);
  useEffect(() => { setRenameTo(tableSchema.name); setFilterField((current) => current && columns.some((column) => column.name === current) ? current : (columns[0]?.name || '')); }, [tableSchema.name]);

  useEffect(() => {
    const organizationId = activeOrganizationId || window.localStorage.getItem('brisabase.organizationId') || '';
    const projectId = activeProjectId || window.localStorage.getItem('brisabase.projectId') || '';
    const environmentId = activeEnvironmentId || window.localStorage.getItem('brisabase.environmentId') || '';
    if (!organizationId || !projectId || !environmentId || !tableSchema.name) return;
    let disposed = false; let primed = false; let inFlight = false;
    const expectedChannel = `public.${tableSchema.name.toLowerCase()}`;
    const poll = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return; inFlight = true;
      try {
        const events = await realtimeService.getRealtimeEvents(organizationId, projectId, environmentId);
        const latest = events.find((event) => { const channel=String(event.channel||'').toLowerCase(); return channel===expectedChannel||channel.endsWith(`.${tableSchema.name.toLowerCase()}`); });
        if (!latest) return;
        if (!primed) { primed=true; lastRealtimeEventRef.current=latest.id; return; }
        if (latest.id===lastRealtimeEventRef.current) return;
        lastRealtimeEventRef.current=latest.id;
        await onDataChanged?.();
      } catch (error) { console.debug('Realtime table synchronization unavailable:', error); } finally { inFlight=false; }
    };
    void poll(); const timer=window.setInterval(()=>void poll(),1500);
    return ()=>{disposed=true;window.clearInterval(timer);lastRealtimeEventRef.current='';};
  }, [tableSchema.name, activeOrganizationId, activeProjectId, activeEnvironmentId, page, searchTerm, sortField, sortOrder]);

  const rowKey = (row: TableRow): string => primaryKey ? String(row[primaryKey]) : String((row as any).id ?? JSON.stringify(row));
  const startEdit = (row: TableRow) => { if (!primaryKey) return; setEditingRowId(rowKey(row)); setEditFormData({ ...row }); };
  const saveEdit = async (rowId: string) => { await onUpdateRow(rowId, editFormData); setEditingRowId(null); };
  const addRow = async (event: React.FormEvent) => { event.preventDefault(); const payload:Record<string,unknown>={}; for(const col of columns.filter(c=>!c.isPrimaryKey)){const raw=newRowData[col.name]; if(raw!==undefined&&raw!=='') payload[col.name]=coerceInput(String(raw),col);} await onInsertRow(payload); setIsAddModalOpen(false); setNewRowData({}); };

  const exportData = async (format:'csv'|'json') => {
    try { const result=await databaseService.exportRows(tableSchema.name,format,activeOrganizationId,activeProjectId,activeEnvironmentId); const url=URL.createObjectURL(new Blob([result.content],{type:format==='json'?'application/json':'text/csv'})); const a=document.createElement('a');a.href=url;a.download=result.filename;a.click();URL.revokeObjectURL(url); addToast('Exportação concluída',`${result.rowCount} registro(s) exportados.`, 'success'); } catch(error:any){addToast('Falha ao exportar',error.message,'error');}
  };

  const importData = async () => {
    try { const result=await databaseService.importRows(tableSchema.name,importFormat,importContent,importMode,activeOrganizationId,activeProjectId,activeEnvironmentId); addToast('Importação concluída',`${result.inserted} inserido(s), ${result.updated} atualizado(s).`,'success'); setIsImportOpen(false);setImportContent('');await onDataChanged?.(); } catch(error:any){addToast('Falha ao importar',error.message,'error');}
  };

  const renameTable = async () => {
    if(renameTo.trim()===tableSchema.name)return;
    try{const renamed=await databaseService.renameTable(tableSchema.name,renameTo.trim(),activeOrganizationId,activeProjectId,activeEnvironmentId);addToast('Tabela renomeada',`${tableSchema.name} → ${renamed.name}`,'success');setIsSchemaOpen(false);await onSchemaChanged?.(renamed.name);}catch(error:any){addToast('Falha ao renomear',error.message,'error');}
  };
  const addColumn = async () => { try{await databaseService.addColumn(tableSchema.name,newColumn,activeOrganizationId,activeProjectId,activeEnvironmentId);setNewColumn({name:'',type:'text',isNullable:true});addToast('Coluna criada',newColumn.name,'success');await onSchemaChanged?.();}catch(error:any){addToast('Falha ao criar coluna',error.message,'error');} };
  const startColumnEdit=(column:ColumnDefinition)=>{setEditColumnName(column.name);setEditColumn({renameTo:column.name,type:column.type,isNullable:column.isNullable,isUnique:column.isUnique,defaultValue:column.defaultValue||''});};
  const saveColumn=async()=>{try{await databaseService.alterColumn(tableSchema.name,editColumnName,editColumn,activeOrganizationId,activeProjectId,activeEnvironmentId);setEditColumnName('');setEditColumn({});addToast('Coluna atualizada',editColumn.renameTo||editColumnName,'success');await onSchemaChanged?.();}catch(error:any){addToast('Falha ao alterar coluna',error.message,'error');}};
  const dropColumn=async(column:ColumnDefinition)=>{if(column.isPrimaryKey)return;if(!window.confirm(`Excluir a coluna '${column.name}' de '${tableSchema.name}'? Esta operação pode apagar dados e será bloqueada pelo PostgreSQL se houver dependências.`))return;try{await databaseService.deleteColumn(tableSchema.name,column.name,activeOrganizationId,activeProjectId,activeEnvironmentId);addToast('Coluna excluída',column.name,'warning');await onSchemaChanged?.();}catch(error:any){addToast('Falha ao excluir coluna',error.message,'error');}};
  const deleteRowConfirmed=async(rowId:string)=>{if(!window.confirm(`Excluir o registro ${rowId} de '${tableSchema.name}'?`))return;await onDeleteRow(rowId);};
  const addFilter=()=>{if(!filterField)return;const value:unknown=filterOperator==='isnull'?filterValue!=='not_null':filterValue;onFiltersChange?.([...filters,{field:filterField,operator:filterOperator,value}]);setFilterValue('');};

  return <div className="flex flex-col space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="relative w-full xl:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/><input value={searchTerm} onChange={(e)=>onSearchChange?.(e.target.value)} placeholder={`Buscar em ${tableSchema.name}...`} className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-9 pr-3 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"/></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded border border-slate-800 px-2 py-1 text-[10px] text-slate-500">{totalCount} registros</span><button onClick={()=>void exportData('csv')} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300"><Download className="h-3 w-3"/>CSV</button><button onClick={()=>void exportData('json')} className="rounded border border-slate-700 px-2 py-1.5 font-mono text-[10px] text-slate-300">JSON</button><button onClick={()=>setIsImportOpen(true)} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300"><Upload className="h-3 w-3"/>Importar</button><button onClick={()=>setIsSchemaOpen(true)} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1.5 text-[10px] text-slate-300"><Settings2 className="h-3 w-3"/>Schema</button><button onClick={()=>setIsAddModalOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white"><Plus className="h-4 w-4"/>Nova Linha</button></div>
    </div>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2"><Filter className="h-3.5 w-3.5 text-purple-400"/><select value={filterField} onChange={(e)=>setFilterField(e.target.value)} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]">{columns.map((column)=><option key={column.name} value={column.name}>{column.name}</option>)}</select><select value={filterOperator} onChange={(e)=>setFilterOperator(e.target.value as DatabaseRowFilter['operator'])} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]">{['eq','neq','gt','gte','lt','lte','contains','starts_with','ends_with','ilike','isnull'].map((operator)=><option key={operator} value={operator}>{operator}</option>)}</select>{filterOperator==='isnull'?<select value={filterValue||'null'} onChange={(e)=>setFilterValue(e.target.value)} className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]"><option value="null">IS NULL</option><option value="not_null">IS NOT NULL</option></select>:<input value={filterValue} onChange={(e)=>setFilterValue(e.target.value)} placeholder="valor" className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]"/>}<button onClick={addFilter} className="rounded border border-purple-700 px-2 py-1 text-[10px] text-purple-300">Adicionar filtro</button>{filters.map((filter,index)=><button key={`${filter.field}-${index}`} onClick={()=>onFiltersChange?.(filters.filter((_,itemIndex)=>itemIndex!==index))} title="Remover filtro" className="rounded bg-purple-950 px-2 py-1 font-mono text-[9px] text-purple-300">{filter.field} {filter.operator} {String(filter.value)} ×</button>)}{filters.length>0&&<button onClick={()=>onFiltersChange?.([])} className="text-[9px] text-slate-500 hover:text-slate-300">Limpar</button>}</div>
    {!primaryKey&&<div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-300">Esta tabela não possui chave primária. Leitura e exportação funcionam, mas edição/exclusão visual ficam bloqueadas para evitar operações ambíguas.</div>}
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40"><table className="w-full border-collapse text-left text-xs"><thead><tr className="border-b border-slate-800 bg-slate-950/80 font-mono text-slate-400">{columns.map((col)=><th key={col.name} className="whitespace-nowrap px-4 py-3 font-semibold"><button onClick={()=>onSortChange?.(col.name,sortField===col.name&&sortOrder==='asc'?'desc':'asc')} className="flex items-center gap-2"><span className="text-slate-200">{col.name}</span><span className="rounded border border-purple-800/30 bg-purple-950/60 px-1.5 py-0.5 text-[10px] text-purple-400">{col.type}</span>{col.isPrimaryKey&&<span className="text-[9px] font-bold text-amber-400">PK</span>}<ArrowUpDown className="h-3 w-3 text-slate-600"/></button></th>)}<th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-800/60 font-mono">{liveRows.length===0?<tr><td colSpan={columns.length+1} className="px-4 py-12 text-center font-sans text-slate-500">Nenhum registro encontrado.</td></tr>:liveRows.map((row)=>{const id=rowKey(row);const editing=editingRowId===id;return <tr key={id} className="hover:bg-slate-800/30">{columns.map((col)=><td key={col.name} className="whitespace-nowrap px-4 py-2.5 text-slate-300">{editing&&!col.isPrimaryKey?<input value={display(editFormData[col.name]??'')} onChange={(e)=>setEditFormData({...editFormData,[col.name]:coerceInput(e.target.value,col)})} className="w-full rounded border border-purple-500 bg-slate-950 px-2 py-1 text-xs"/>:<span className={col.isPrimaryKey?'font-semibold text-purple-400':''}>{display(row[col.name])}</span>}</td>)}<td className="whitespace-nowrap px-4 py-2.5 text-right font-sans">{editing?<><button onClick={()=>void saveEdit(id)} className="p-1 text-emerald-400"><Check className="h-4 w-4"/></button><button onClick={()=>setEditingRowId(null)} className="p-1 text-slate-400"><X className="h-4 w-4"/></button></>:<><button disabled={!primaryKey} onClick={()=>startEdit(row)} className="p-1 text-slate-400 disabled:opacity-20"><Edit2 className="h-3.5 w-3.5"/></button><button disabled={!primaryKey} onClick={()=>void deleteRowConfirmed(id)} className="p-1 text-slate-400 hover:text-rose-400 disabled:opacity-20"><Trash2 className="h-3.5 w-3.5"/></button></>}</td></tr>})}</tbody></table></div>
    {!primaryKey&&<div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-300">{primaryKeys.length>1?'Esta tabela usa chave primária composta. Edição/exclusão visual por linha fica bloqueada; use uma migration ou SQL revisado.':'Esta tabela não possui chave primária. Leitura/importação/exportação continuam disponíveis, mas edição/exclusão por linha ficam bloqueadas.'}</div>}
    <div className="flex items-center justify-between text-xs text-slate-500"><span>Página {page+1} de {pageCount}</span><div className="flex gap-1"><button disabled={page<=0} onClick={()=>onPageChange?.(Math.max(0,page-1))} className="rounded border border-slate-800 p-1.5 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5"/></button><button disabled={page+1>=pageCount} onClick={()=>onPageChange?.(page+1)} className="rounded border border-slate-800 p-1.5 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5"/></button></div></div>

    {isAddModalOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><div className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"><div className="flex justify-between"><h3 className="text-sm font-semibold text-slate-100">Adicionar Linha em {tableSchema.name}</h3><button onClick={()=>setIsAddModalOpen(false)}><X className="h-5 w-5"/></button></div><form onSubmit={addRow} className="space-y-3">{columns.filter(c=>!c.isPrimaryKey).map((col)=><label key={col.name} className="block text-xs text-slate-400">{col.name} <span className="text-purple-400">{col.type}</span><input value={newRowData[col.name]??''} onChange={(e)=>setNewRowData({...newRowData,[col.name]:e.target.value})} placeholder={col.defaultValue||''} className="mt-1 w-full rounded border border-slate-800 bg-slate-950 px-3 py-2 text-slate-100"/></label>)}<div className="flex justify-end gap-2"><button type="button" onClick={()=>setIsAddModalOpen(false)} className="rounded border border-slate-700 px-3 py-2 text-xs">Cancelar</button><button className="rounded bg-purple-600 px-3 py-2 text-xs font-semibold text-white">Inserir</button></div></form></div></div>}

    {isImportOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"><div className="flex justify-between"><h3 className="text-sm font-semibold">Importar dados</h3><button onClick={()=>setIsImportOpen(false)}><X className="h-5 w-5"/></button></div><div className="flex gap-2"><select value={importFormat} onChange={(e)=>setImportFormat(e.target.value as any)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"><option value="csv">CSV</option><option value="json">JSON</option></select><select value={importMode} onChange={(e)=>setImportMode(e.target.value as any)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"><option value="append">Append</option><option value="upsert" disabled={!primaryKey}>Upsert por PK</option></select><input type="file" accept=".csv,.json,text/csv,application/json" onChange={async(e)=>{const file=e.target.files?.[0];if(file){setImportFormat(file.name.toLowerCase().endsWith('.json')?'json':'csv');setImportContent(await file.text());}}} className="text-xs text-slate-400"/></div><textarea rows={12} value={importContent} onChange={(e)=>setImportContent(e.target.value)} placeholder="Cole CSV ou JSON aqui" className="w-full rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs"/><div className="text-[10px] text-slate-500">Limite por lote: 5.000 linhas. Upsert exige chave primária.</div><div className="flex justify-end"><button onClick={()=>void importData()} disabled={!importContent.trim()} className="rounded bg-purple-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Importar</button></div></div></div>}

    {isSchemaOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><div className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6"><div className="flex justify-between"><div><h3 className="text-sm font-semibold">Schema de {tableSchema.name}</h3><p className="text-[10px] text-slate-500">Alterações destrutivas exigem confirmação no servidor.</p></div><button onClick={()=>setIsSchemaOpen(false)}><X className="h-5 w-5"/></button></div><div className="flex gap-2"><input value={renameTo} onChange={(e)=>setRenameTo(e.target.value)} className="flex-1 rounded border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs"/><button onClick={()=>void renameTable()} className="rounded border border-purple-700 px-3 py-2 text-xs text-purple-300">Renomear tabela</button></div><div className="space-y-2">{columns.map((col)=><div key={col.name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">{editColumnName===col.name?<div className="grid gap-2 md:grid-cols-6"><input value={editColumn.renameTo||''} onChange={(e)=>setEditColumn({...editColumn,renameTo:e.target.value})} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"/><select value={editColumn.type||col.type} onChange={(e)=>setEditColumn({...editColumn,type:e.target.value as any})} disabled={col.isPrimaryKey} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs">{['uuid','text','varchar','char','integer','bigint','numeric','decimal','real','double precision','boolean','date','timestamp','timestamptz','json','jsonb'].map(t=><option key={t}>{t}</option>)}</select><input value={editColumn.defaultValue||''} onChange={(e)=>setEditColumn({...editColumn,defaultValue:e.target.value})} placeholder="default" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"/><label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={Boolean(editColumn.isNullable)} onChange={(e)=>setEditColumn({...editColumn,isNullable:e.target.checked})} disabled={col.isPrimaryKey}/>Nullable</label><label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={Boolean(editColumn.isUnique)} onChange={(e)=>setEditColumn({...editColumn,isUnique:e.target.checked})} disabled={col.isPrimaryKey}/>Unique</label><div><button onClick={()=>void saveColumn()} className="mr-2 text-emerald-400"><Check className="h-4 w-4"/></button><button onClick={()=>setEditColumnName('')}><X className="h-4 w-4"/></button></div></div>:<div className="flex items-center justify-between"><div className="font-mono text-xs"><span className="text-slate-200">{col.name}</span> <span className="text-purple-400">{col.type}</span>{col.isPrimaryKey&&<span className="ml-2 text-amber-400">PK</span>}{col.isUnique&&<span className="ml-2 text-cyan-400">UNIQUE</span>}{col.isNullable===false&&<span className="ml-2 text-slate-500">NOT NULL</span>}</div><div className="flex gap-1"><button onClick={()=>startColumnEdit(col)} className="p-1 text-slate-400"><Edit2 className="h-3.5 w-3.5"/></button><button disabled={col.isPrimaryKey} onClick={()=>void dropColumn(col)} className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-20"><Trash2 className="h-3.5 w-3.5"/></button></div></div>}</div>)}</div><div className="rounded-lg border border-slate-800 p-3"><h4 className="mb-2 text-xs font-semibold text-slate-300">Adicionar coluna</h4><div className="grid gap-2 md:grid-cols-6"><input value={newColumn.name} onChange={(e)=>setNewColumn({...newColumn,name:e.target.value})} placeholder="nome" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"/><select value={newColumn.type} onChange={(e)=>setNewColumn({...newColumn,type:e.target.value as any})} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs">{['uuid','text','varchar','char','integer','bigint','numeric','decimal','real','double precision','boolean','date','timestamp','timestamptz','json','jsonb'].map(t=><option key={t}>{t}</option>)}</select><input value={newColumn.defaultValue||''} onChange={(e)=>setNewColumn({...newColumn,defaultValue:e.target.value})} placeholder="default" className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"/><label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={Boolean(newColumn.isNullable)} onChange={(e)=>setNewColumn({...newColumn,isNullable:e.target.checked})}/>Nullable</label><label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={Boolean(newColumn.isUnique)} onChange={(e)=>setNewColumn({...newColumn,isUnique:e.target.checked})}/>Unique</label><button onClick={()=>void addColumn()} disabled={!newColumn.name.trim()} className="rounded bg-purple-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40">Adicionar</button></div></div></div></div>}
  </div>;
};
