import React, { useEffect, useState } from 'react';
import { databaseService } from '../../services';
import {
  DbEnum,
  DbExtension,
  DbMaterializedView,
  DbSequence,
  DbView,
  DatabaseSchemaDiff,
  DatabaseSchemaSnapshot,
} from '../../types';
import { useApp } from '../../../context/AppContext';
import { Boxes, Eye, ListTree, Hash, Puzzle, Plus, Trash2, Download, GitCompare, X, RefreshCw, Layers } from 'lucide-react';

type ObjectTab = 'views' | 'materialized' | 'enums' | 'sequences' | 'extensions' | 'schema';
type ModalKind = 'view' | 'materialized' | 'enum' | 'sequence' | null;

function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function confirmDelete(kind: string, name: string): boolean {
  return window.confirm(`Excluir ${kind} '${name}'? A operação usa RESTRICT e será recusada pelo PostgreSQL se houver dependências.`);
}

export const DatabaseObjectsView: React.FC = () => {
  const { activeOrganizationId: orgId, activeProjectId: projId, activeEnvironmentId: envId, addToast } = useApp();
  const [tab, setTab] = useState<ObjectTab>('views');
  const [views, setViews] = useState<DbView[]>([]);
  const [materializedViews, setMaterializedViews] = useState<DbMaterializedView[]>([]);
  const [enums, setEnums] = useState<DbEnum[]>([]);
  const [sequences, setSequences] = useState<DbSequence[]>([]);
  const [extensions, setExtensions] = useState<DbExtension[]>([]);
  const [modal, setModal] = useState<ModalKind>(null);
  const [name, setName] = useState('');
  const [definition, setDefinition] = useState('SELECT * FROM users;');
  const [withData, setWithData] = useState(true);
  const [enumValues, setEnumValues] = useState('draft,published,archived');
  const [sequenceStart, setSequenceStart] = useState(1);
  const [sequenceIncrement, setSequenceIncrement] = useState(1);
  const [baseline, setBaseline] = useState<DatabaseSchemaSnapshot | null>(null);
  const [diff, setDiff] = useState<DatabaseSchemaDiff | null>(null);

  const load = async () => {
    if (!orgId || !projId || !envId) return;
    try {
      const [viewList, matList, enumList, sequenceList, extensionList] = await Promise.all([
        databaseService.getViews(orgId, projId, envId),
        databaseService.getMaterializedViews(orgId, projId, envId),
        databaseService.getEnums(orgId, projId, envId),
        databaseService.getSequences(orgId, projId, envId),
        databaseService.getExtensions(orgId, projId, envId),
      ]);
      setViews(viewList);
      setMaterializedViews(matList);
      setEnums(enumList);
      setSequences(sequenceList);
      setExtensions(extensionList);
    } catch (error: any) {
      addToast('Database Objects', error.message, 'error');
    }
  };

  useEffect(() => { void load(); }, [orgId, projId, envId]);

  const resetModal = () => {
    setModal(null);
    setName('');
    setDefinition('SELECT * FROM users;');
    setWithData(true);
  };

  const create = async () => {
    if (!projId) return;
    try {
      if (modal === 'view') await databaseService.createView(name, definition, false, orgId, projId, envId);
      if (modal === 'materialized') await databaseService.createMaterializedView(name, definition, withData, orgId, projId, envId);
      if (modal === 'enum') await databaseService.createEnum(name, enumValues.split(',').map((value) => value.trim()).filter(Boolean), orgId, projId, envId);
      if (modal === 'sequence') await databaseService.createSequence({ name, startValue: sequenceStart, increment: sequenceIncrement }, orgId, projId, envId);
      resetModal();
      await load();
      addToast('Objeto criado', 'O schema PostgreSQL foi atualizado.', 'success');
    } catch (error: any) {
      addToast('Falha ao criar objeto', error.message, 'error');
    }
  };

  const remove = async (kind: 'view' | 'materialized view' | 'enum' | 'sequence', objectName: string) => {
    if (!projId || !confirmDelete(kind, objectName)) return;
    try {
      if (kind === 'view') await databaseService.deleteView(objectName, orgId, projId, envId);
      if (kind === 'materialized view') await databaseService.deleteMaterializedView(objectName, orgId, projId, envId);
      if (kind === 'enum') await databaseService.deleteEnum(objectName, orgId, projId, envId);
      if (kind === 'sequence') await databaseService.deleteSequence(objectName, orgId, projId, envId);
      await load();
      addToast('Objeto removido', objectName, 'warning');
    } catch (error: any) {
      addToast('Remoção bloqueada', error.message, 'error');
    }
  };

  const refreshMaterialized = async (objectName: string) => {
    if (!projId) return;
    try {
      await databaseService.refreshMaterializedView(objectName, orgId, projId, envId);
      await load();
      addToast('Materialized view atualizada', objectName, 'success');
    } catch (error: any) {
      addToast('Refresh falhou', error.message, 'error');
    }
  };

  const capture = async () => {
    if (!projId) return;
    try {
      const snapshot = await databaseService.getSchemaSnapshot(orgId, projId, envId);
      setBaseline(snapshot);
      setDiff(null);
      downloadJson('brisabase-schema-snapshot.json', snapshot);
    } catch (error: any) {
      addToast('Snapshot', error.message, 'error');
    }
  };

  const compare = async () => {
    if (!projId) return;
    if (!baseline) {
      addToast('Schema diff', 'Capture ou carregue um snapshot primeiro.', 'warning');
      return;
    }
    try {
      setDiff(await databaseService.diffSchema(baseline, orgId, projId, envId));
    } catch (error: any) {
      addToast('Schema diff', error.message, 'error');
    }
  };

  const tabs = [
    ['views', 'Views', Eye],
    ['materialized', 'Materialized', Layers],
    ['enums', 'Enums', ListTree],
    ['sequences', 'Sequences', Hash],
    ['extensions', 'Extensions', Puzzle],
    ['schema', 'Schema diff', GitCompare],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${tab === id ? 'bg-purple-600 text-white' : 'bg-slate-950 text-slate-400'}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'views' && (
        <ObjectSection title="Views" onAdd={() => setModal('view')}>
          {views.length === 0 ? <Empty /> : views.map((view) => <ObjectCard key={view.name} title={view.name} body={view.definition} onDelete={() => void remove('view', view.name)} />)}
        </ObjectSection>
      )}

      {tab === 'materialized' && (
        <ObjectSection title="Materialized Views" onAdd={() => setModal('materialized')}>
          {materializedViews.length === 0 ? <Empty /> : materializedViews.map((view) => (
            <ObjectCard
              key={view.name}
              title={`${view.name}${view.populated ? '' : ' · sem dados'}`}
              body={view.definition}
              onDelete={() => void remove('materialized view', view.name)}
              action={<button onClick={() => void refreshMaterialized(view.name)} className="rounded border border-slate-700 p-1 text-slate-400 hover:text-purple-300" title="REFRESH MATERIALIZED VIEW"><RefreshCw className="h-3.5 w-3.5" /></button>}
            />
          ))}
        </ObjectSection>
      )}

      {tab === 'enums' && (
        <ObjectSection title="Enums PostgreSQL" onAdd={() => setModal('enum')}>
          {enums.length === 0 ? <Empty /> : <div className="grid gap-3 md:grid-cols-2">{enums.map((item) => <ObjectCard key={item.name} title={item.name} body={item.values.join(' · ')} onDelete={() => void remove('enum', item.name)} />)}</div>}
        </ObjectSection>
      )}

      {tab === 'sequences' && (
        <ObjectSection title="Sequences" onAdd={() => setModal('sequence')}>
          {sequences.length === 0 ? <Empty /> : <div className="grid gap-3 md:grid-cols-2">{sequences.map((item) => <ObjectCard key={item.name} title={item.name} body={`start ${item.startValue} · increment ${item.increment} · ${item.cycle ? 'cycle' : 'no cycle'}`} onDelete={() => void remove('sequence', item.name)} />)}</div>}
        </ObjectSection>
      )}

      {tab === 'extensions' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-100">Extensões PostgreSQL</h3>
            <p className="text-xs text-slate-500">Somente leitura por segurança: extensões são instaladas no banco físico e não pertencem a um único schema de projeto.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {extensions.map((item) => (
              <div key={item.name} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="flex justify-between gap-2"><span className="font-mono text-xs text-slate-200">{item.name}</span><span className={`text-[10px] ${item.installed ? 'text-emerald-400' : 'text-slate-500'}`}>{item.installed ? `instalada ${item.installedVersion}` : `disponível ${item.defaultVersion || ''}`}</span></div>
                <p className="mt-1 text-[10px] text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'schema' && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold text-slate-100">Snapshot & Schema Diff</h3><p className="text-xs text-slate-500">Compara estrutura atual com um snapshot. SQL destrutivo nunca é gerado automaticamente.</p></div>
            <div className="flex gap-2">
              <label className="cursor-pointer rounded border border-slate-700 px-3 py-2 text-xs text-slate-300">Carregar snapshot<input type="file" accept="application/json,.json" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setBaseline(JSON.parse(await file.text())); setDiff(null); } catch { addToast('Snapshot inválido', 'JSON inválido.', 'error'); } }} /></label>
              <button onClick={() => void capture()} className="flex items-center gap-1 rounded border border-slate-700 px-3 py-2 text-xs"><Download className="h-3.5 w-3.5" />Capturar</button>
              <button onClick={() => void compare()} className="rounded bg-purple-600 px-3 py-2 text-xs font-semibold text-white">Comparar</button>
            </div>
          </div>
          {baseline && <p className="font-mono text-[10px] text-slate-500">Baseline: {baseline.generatedAt}</p>}
          {diff && <div className="space-y-3"><div className={`rounded-lg border p-3 text-xs ${diff.hasChanges ? 'border-amber-800 bg-amber-950/20 text-amber-300' : 'border-emerald-800 bg-emerald-950/20 text-emerald-300'}`}>{diff.hasChanges ? `${diff.changes.length} mudança(s) detectada(s).` : 'Schemas equivalentes.'}</div>{diff.changes.map((change, index) => <div key={`${change.kind}-${index}`} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs"><span className="font-mono text-purple-300">{change.kind}</span> <strong className="text-slate-200">{change.object}</strong><p className="text-slate-500">{change.detail}</p></div>)}{diff.migrationSql.length > 0 && <pre className="overflow-auto rounded bg-slate-950 p-3 text-[10px] text-slate-300">{diff.migrationSql.join('\n')}</pre>}</div>}
        </section>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex justify-between"><h3 className="text-sm font-semibold">Criar {modal}</h3><button onClick={resetModal}><X className="h-5 w-5" /></button></div>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="nome_do_objeto" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
            {(modal === 'view' || modal === 'materialized') && <textarea rows={8} value={definition} onChange={(event) => setDefinition(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs" />}
            {modal === 'materialized' && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={withData} onChange={(event) => setWithData(event.target.checked)} />Criar WITH DATA</label>}
            {modal === 'enum' && <input value={enumValues} onChange={(event) => setEnumValues(event.target.value)} placeholder="draft,published,archived" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs" />}
            {modal === 'sequence' && <div className="grid grid-cols-2 gap-2"><input type="number" value={sequenceStart} onChange={(event) => setSequenceStart(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs" /><input type="number" value={sequenceIncrement} onChange={(event) => setSequenceIncrement(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs" /></div>}
            <button onClick={() => void create()} disabled={!name.trim()} className="w-full rounded bg-purple-600 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="mr-1 inline h-3.5 w-3.5" />Criar</button>
          </div>
        </div>
      )}
    </div>
  );
};

const ObjectSection: React.FC<{ title: string; onAdd: () => void; children: React.ReactNode }> = ({ title, onAdd, children }) => <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-purple-400" /><h3 className="text-sm font-semibold text-slate-100">{title}</h3></div><button onClick={onAdd} className="flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" />Criar</button></div><div className="space-y-2">{children}</div></section>;
const Empty = () => <p className="text-xs text-slate-500">Nenhum objeto deste tipo no schema.</p>;
const ObjectCard: React.FC<{ title: string; body: string; onDelete: () => void; action?: React.ReactNode }> = ({ title, body, onDelete, action }) => <div className="flex items-start justify-between rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="min-w-0"><p className="font-mono text-xs font-semibold text-slate-200">{title}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap font-mono text-[10px] text-slate-500">{body}</p></div><div className="ml-2 flex gap-1">{action}<button onClick={onDelete} className="p-1 text-slate-600 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button></div></div>;
