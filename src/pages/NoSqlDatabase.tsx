import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/common/EmptyState';
import { TableSkeleton } from '../components/common/Skeleton';
import {
  Database as DbIcon,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit3,
  Copy,
  Check,
  FileJson,
  Table,
  Layers,
  ArrowUpDown,
  Download,
  Code
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { DatabaseCollection, DatabaseDocument } from '../types';

interface NoSqlDatabaseProps {
  embedded?: boolean;
}

export const NoSqlDatabase: React.FC<NoSqlDatabaseProps> = ({ embedded = false }) => {
  const { showToast } = useApp();
  const [collections, setCollections] = useState<DatabaseCollection[]>([]);
  const [activeColId, setActiveColId] = useState<string>('users');
  const [documents, setDocuments] = useState<DatabaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');

  // New Collection Modal State
  const [isNewColModalOpen, setIsNewColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDesc, setNewColDesc] = useState('');

  // Document Drawer State (Create / Edit / View)
  const [selectedDoc, setSelectedDoc] = useState<DatabaseDocument | null>(null);
  const [isDocDrawerOpen, setIsDocDrawerOpen] = useState(false);
  const [docJsonText, setDocJsonText] = useState('');
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [isNewDoc, setIsNewDoc] = useState(false);

  // Load collections
  const loadCollections = async () => {
    const cols = await mockApi.getCollections();
    setCollections(cols);
    if (cols.length > 0 && !activeColId) {
      setActiveColId(cols[0].id);
    }
  };

  // Load documents for active collection
  const loadDocuments = async (colId: string) => {
    setLoading(true);
    const docs = await mockApi.getDocuments(colId);
    setDocuments(docs);
    setLoading(false);
  };

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    if (activeColId) {
      loadDocuments(activeColId);
    }
  }, [activeColId]);

  const activeCollection = collections.find((c) => c.id === activeColId) || collections[0];

  // Handle New Collection
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    try {
      const newCol = await mockApi.createCollection(newColName, newColDesc);
      setCollections((prev) => [...prev, newCol]);
      setActiveColId(newCol.id);
      setIsNewColModalOpen(false);
      setNewColName('');
      setNewColDesc('');
      showToast('Coleção criada!', `Coleção '${newCol.name}' pronta para receber documentos`, 'success');
    } catch (err) {
      showToast('Erro ao criar coleção', 'Tente novamente', 'error');
    }
  };

  // Handle Open Create Document
  const handleOpenCreateDoc = () => {
    setIsNewDoc(true);
    setSelectedDoc(null);
    const template =
      activeColId === 'users'
        ? { name: 'Novo Usuário', email: 'novo@exemplo.com', role: 'Viewer', status: 'active' }
        : activeColId === 'products'
        ? { name: 'Novo Produto', price: 99.9, category: 'Hardware', stock: 50, inStock: true }
        : { title: 'Novo Registro', status: 'pending', createdAt: new Date().toISOString() };

    setDocJsonText(JSON.stringify(template, null, 2));
    setIsDocDrawerOpen(true);
  };

  // Handle Open Edit Document
  const handleOpenEditDoc = (doc: DatabaseDocument) => {
    setIsNewDoc(false);
    setSelectedDoc(doc);
    setDocJsonText(JSON.stringify(doc.data, null, 2));
    setIsDocDrawerOpen(true);
  };

  // Handle Save Document (Create or Update)
  const handleSaveDoc = async () => {
    try {
      setIsSavingDoc(true);
      const parsedData = JSON.parse(docJsonText);

      if (isNewDoc) {
        const created = await mockApi.createDocument(activeColId, parsedData);
        setDocuments((prev) => [created, ...prev]);
        showToast('Documento Inserido!', `ID: ${created.id}`, 'success');
      } else if (selectedDoc) {
        const updated = await mockApi.updateDocument(activeColId, selectedDoc.id, parsedData);
        setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        showToast('Documento Atualizado!', `ID: ${updated.id}`, 'success');
      }

      setIsDocDrawerOpen(false);
    } catch (err) {
      showToast('JSON Inválido', 'Verifique a sintaxe JSON antes de salvar.', 'error');
    } finally {
      setIsSavingDoc(false);
    }
  };

  // Handle Delete Document
  const handleDeleteDoc = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja remover este documento?')) return;

    await mockApi.deleteDocument(activeColId, docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    showToast('Documento Removido', `O documento ${docId} foi excluído`, 'info');
  };

  // Handle Export Collection JSON
  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(documents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeColId}_export.json`;
    a.click();
    showToast('Exportação concluída', `${documents.length} documentos exportados em JSON`, 'success');
  };

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    const q = searchQuery.toLowerCase();
    return (
      doc.id.toLowerCase().includes(q) ||
      JSON.stringify(doc.data).toLowerCase().includes(q)
    );
  });

  // Extract all unique table column keys from document data
  const dataKeys: string[] = Array.from(
    new Set<string>(filteredDocs.flatMap((d) => Object.keys(d.data || {})))
  ).slice(0, 5);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {!embedded && (
        <>
          {/* Header */}
          <PageHeader
            title="Banco de Dados NoSQL"
            subtitle="Gerencie coleções, esquemas dinâmicos e documentos com sincronização em tempo real."
            badge={
              <Badge variant="cyan" dot>
                BrisaDB Engine v2.4
              </Badge>
            }
            actions={
              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportJson}
                  leftIcon={<Download className="w-4 h-4" />}
                >
                  Exportar JSON
                </Button>
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={handleOpenCreateDoc}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Novo Documento
                </Button>
              </div>
            }
          />
        </>
      )}

      {embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-[#07111F] border border-white/[0.08] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <DbIcon className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-slate-100">Document Database</h2>
              <Badge variant="cyan" size="sm">NoSQL mock</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">Coleções e documentos sem schema rígido, preservados como alternativa ao PostgreSQL.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportJson} leftIcon={<Download className="w-4 h-4" />}>
              Exportar JSON
            </Button>
            <Button variant="gradient" size="sm" onClick={handleOpenCreateDoc} leftIcon={<Plus className="w-4 h-4" />}>
              Novo Documento
            </Button>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Collections Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DbIcon className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Coleções ({collections.length})
                </h3>
              </div>
              <button
                onClick={() => setIsNewColModalOpen(true)}
                title="Nova Coleção"
                className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs flex items-center gap-1 font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar</span>
              </button>
            </div>

            <div className="space-y-1">
              {collections.map((col) => {
                const isActive = col.id === activeColId;
                return (
                  <button
                    key={col.id}
                    onClick={() => setActiveColId(col.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs transition-all ${
                      isActive
                        ? 'bg-[#1677FF] text-white shadow-lg shadow-[#1677FF]/25 font-bold'
                        : 'text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Layers className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-cyan-400'}`} />
                      <div className="truncate">
                        <div className="truncate font-semibold">{col.name}</div>
                        <div className={`text-[10px] ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                          {col.id === activeColId ? `${documents.length} docs` : `${col.count} docs`}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Collection Info Card */}
          {activeCollection && (
            <div className="p-4 rounded-2xl bg-[#0B1628]/40 border border-white/[0.06] text-xs space-y-2.5">
              <div className="font-bold text-slate-300">Detalhes da Coleção</div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Identificador:</span>
                <span className="font-mono text-cyan-300 font-semibold">{activeCollection.id}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Criada em:</span>
                <span>{activeCollection.createdAt}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Índices:</span>
                <span className="text-emerald-400 font-semibold">Automáticos (B-Tree)</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Documents Data Table */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
            {/* Search & View Mode Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Pesquisar por ID, campo ou valor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0B1628] border border-white/10 text-slate-100 text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-[#0B1628] rounded-xl border border-white/[0.08]">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      viewMode === 'table' ? 'bg-[#1677FF] text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Table className="w-3.5 h-3.5" />
                    <span>Tabela</span>
                  </button>
                  <button
                    onClick={() => setViewMode('json')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      viewMode === 'json' ? 'bg-[#1677FF] text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Content Table / JSON */}
            {loading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : filteredDocs.length === 0 ? (
              <EmptyState
                variant="database"
                title="Nenhum documento encontrado"
                description={
                  searchQuery
                    ? 'Nenhum documento corresponde aos termos da busca.'
                    : 'Esta coleção ainda não possui documentos.'
                }
                actionText="Inserir Primeiro Documento"
                onAction={handleOpenCreateDoc}
              />
            ) : viewMode === 'table' ? (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#0B1628] text-slate-400 font-mono text-[11px] uppercase border-b border-white/[0.08]">
                    <tr>
                      <th className="py-3 px-4">Document ID</th>
                      {dataKeys.map((k) => (
                        <th key={k} className="py-3 px-4">
                          {k}
                        </th>
                      ))}
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] font-mono">
                    {filteredDocs.map((doc) => (
                      <tr
                        key={doc.id}
                        onClick={() => handleOpenEditDoc(doc)}
                        className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-semibold text-cyan-300 flex items-center gap-2">
                          <span className="truncate max-w-[140px]">{doc.id}</span>
                        </td>
                        {dataKeys.map((k) => {
                          const val = doc.data[k];
                          const displayVal =
                            typeof val === 'object'
                              ? JSON.stringify(val)
                              : typeof val === 'boolean'
                              ? val
                                ? 'true'
                                : 'false'
                              : String(val !== undefined ? val : '—');

                          return (
                            <td key={k} className="py-3 px-4 text-slate-300 truncate max-w-[160px]">
                              {typeof val === 'boolean' ? (
                                <Badge variant={val ? 'success' : 'neutral'} size="sm">
                                  {displayVal}
                                </Badge>
                              ) : (
                                displayVal
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditDoc(doc);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/[0.08]"
                              title="Editar Documento"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteDoc(doc.id, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                              title="Excluir Documento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* JSON View */
              <div className="p-4 rounded-xl bg-[#020617] border border-white/[0.06] font-mono text-xs overflow-auto max-h-[600px]">
                <pre className="text-cyan-300 leading-relaxed">
                  {JSON.stringify(filteredDocs, null, 2)}
                </pre>
              </div>
            )}

            {/* Table Footer Stats */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <span>
                Exibindo {filteredDocs.length} de {documents.length} documentos
              </span>
              <span>Cluster BrisaDB • sa-east-1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Drawer: Create / Edit Document */}
      <Drawer
        isOpen={isDocDrawerOpen}
        onClose={() => setIsDocDrawerOpen(false)}
        title={isNewDoc ? `Novo Documento em '${activeColId}'` : `Editar Documento: ${selectedDoc?.id}`}
        subtitle="Modifique os dados no formato JSON válido."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsDocDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleSaveDoc}
              isLoading={isSavingDoc}
            >
              {isNewDoc ? 'Inserir Documento' : 'Salvar Alterações'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Payload do Documento (JSON)</span>
            <span className="text-[11px] text-cyan-400 font-mono">validação em tempo real</span>
          </div>

          <textarea
            value={docJsonText}
            onChange={(e) => setDocJsonText(e.target.value)}
            className="w-full h-96 p-4 rounded-xl bg-[#020617] border border-white/10 text-cyan-300 font-mono text-xs leading-relaxed focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 resize-none selection:bg-cyan-500/30"
            spellCheck={false}
          />
        </div>
      </Drawer>

      {/* Modal: New Collection */}
      <Modal
        isOpen={isNewColModalOpen}
        onClose={() => setIsNewColModalOpen(false)}
        title="Criar Nova Coleção"
        subtitle="Uma coleção armazena documentos e gera endpoints de API automaticamente."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsNewColModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleCreateCollection}
              disabled={!newColName.trim()}
            >
              Criar Coleção
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateCollection} className="space-y-4">
          <Input
            label="Nome da Coleção"
            placeholder="ex: customers, payments, invoices"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            required
            autoFocus
          />
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Descrição (Opcional)
            </label>
            <textarea
              className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 placeholder:text-slate-500 text-sm p-3 focus:outline-none focus:border-cyan-400 resize-none h-20"
              placeholder="Descreva a finalidade desta coleção..."
              value={newColDesc}
              onChange={(e) => setNewColDesc(e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
