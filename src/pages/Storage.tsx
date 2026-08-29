import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Drawer } from '../components/ui/Drawer';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/common/EmptyState';
import {
  HardDrive,
  UploadCloud,
  Search,
  Folder,
  File,
  Image,
  FileText,
  Video,
  Music,
  Trash2,
  Copy,
  ExternalLink,
  Download,
  LayoutGrid,
  List,
  Check
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { StorageFile } from '../types';
import { isRealMode } from '../services/runtime';
import { RealStorage } from './RealStorage';

const MockStorage: React.FC = () => {
  const { showToast } = useApp();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFolder, setUploadFolder] = useState('uploads');
  const [uploadType, setUploadType] = useState<'image' | 'document' | 'video' | 'archive'>('image');
  const [isUploading, setIsUploading] = useState(false);

  // File Preview Drawer
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [isFileDrawerOpen, setIsFileDrawerOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const loadFiles = async () => {
    setLoading(true);
    const data = await mockApi.getStorageFiles();
    setFiles(data);
    setLoading(false);
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFileName.trim()) return;

    try {
      setIsUploading(true);
      const mimeMap: Record<string, string> = {
        image: 'image/png',
        document: 'application/pdf',
        video: 'video/mp4',
        archive: 'application/zip'
      };

      const uploaded = await mockApi.uploadFile({
        name: uploadFileName,
        folder: uploadFolder,
        type: uploadType,
        mimeType: mimeMap[uploadType] || 'application/octet-stream',
        size: '2.4 MB',
        bytes: 2516582
      });

      setFiles((prev) => [uploaded, ...prev]);
      setIsUploadModalOpen(false);
      setUploadFileName('');
      showToast('Upload concluído!', `Arquivo ${uploaded.name} salvo no bucket com CDN`, 'success');
    } catch (err) {
      showToast('Erro no upload', 'Tente novamente', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFile = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir ${name} permanentemente?`)) return;
    await mockApi.deleteFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (selectedFile?.id === id) setIsFileDrawerOpen(false);
    showToast('Arquivo excluído', `${name} foi removido do storage.`, 'info');
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    showToast('Link copiado!', 'URL pública da CDN copiada', 'info');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const folders = ['all', 'avatars', 'products', 'documents', 'uploads'];

  const filteredFiles = files.filter((file) => {
    const matchesFolder = activeFolder === 'all' || file.folder === activeFolder;
    const matchesSearch =
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.folder.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="w-5 h-5 text-cyan-400" />;
      case 'document':
        return <FileText className="w-5 h-5 text-amber-400" />;
      case 'video':
        return <Video className="w-5 h-5 text-rose-400" />;
      default:
        return <File className="w-5 h-5 text-indigo-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Armazenamento em Nuvem (Storage)"
        subtitle="Hospedagem de arquivos, mídia e assets com CDN global e links assinados de segurança."
        badge={
          <Badge variant="cyan" dot>
            Global CDN • Edge sa-east-1
          </Badge>
        }
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setIsUploadModalOpen(true)}
            leftIcon={<UploadCloud className="w-4 h-4" />}
          >
            Upload de Arquivo
          </Button>
        }
      />

      {/* Storage Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Espaço Utilizado</div>
            <div className="text-xl font-bold text-slate-100 mt-1">14.2 GB / 50 GB</div>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Total de Arquivos</div>
            <div className="text-xl font-bold text-slate-100 mt-1">{files.length} objetos</div>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <File className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Tráfego de CDN (Mês)</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">142.8 GB</div>
          </div>
          <Badge variant="success" size="sm">
            99.99% Cache Hit
          </Badge>
        </div>
      </div>

      {/* Folders & Explorer */}
      <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-5">
        {/* Top Controls: Folder Pills, Search & View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          {/* Folders */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {folders.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFolder(f)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeFolder === f
                    ? 'bg-[#1677FF] text-white shadow-md shadow-[#1677FF]/30'
                    : 'bg-[#0B1628] text-slate-400 hover:text-slate-200 border border-white/[0.06]'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="capitalize">{f === 'all' ? 'Todos os Arquivos' : f}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar arquivo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-xl bg-[#0B1628] border border-white/10 text-slate-100 text-xs focus:outline-none focus:border-cyan-400 w-48 sm:w-60"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0B1628] rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg ${
                  viewMode === 'grid' ? 'bg-[#1677FF] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg ${
                  viewMode === 'list' ? 'bg-[#1677FF] text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Files Grid or List */}
        {filteredFiles.length === 0 ? (
          <EmptyState
            variant="storage"
            title="Nenhum arquivo encontrado"
            description="Envie imagens, vídeos ou documentos para começar a usar o Storage."
            actionText="Enviar Primeiro Arquivo"
            onAction={() => setIsUploadModalOpen(true)}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                onClick={() => {
                  setSelectedFile(file);
                  setIsFileDrawerOpen(true);
                }}
                className="p-3 rounded-2xl bg-[#0B1628]/80 hover:bg-[#112240] border border-white/[0.06] hover:border-cyan-400/40 transition-all cursor-pointer group flex flex-col justify-between shadow-lg"
              >
                <div className="relative aspect-video rounded-xl bg-[#020617] border border-white/[0.04] overflow-hidden flex items-center justify-center mb-2.5">
                  {file.type === 'image' && file.url ? (
                    <img
                      src={file.url}
                      alt={file.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="p-4 rounded-xl bg-white/[0.03]">
                      {getFileIcon(file.type)}
                    </div>
                  )}
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#07111F]/90 text-[10px] uppercase font-mono font-bold text-cyan-300">
                    {file.extension}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate transition-colors">
                    {file.name}
                  </h4>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                    <span>{file.size}</span>
                    <span className="capitalize">{file.folder}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0B1628] text-slate-400 font-mono text-[11px] uppercase border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4">Nome do Arquivo</th>
                  <th className="py-3 px-4">Pasta</th>
                  <th className="py-3 px-4">Tamanho</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Atualizado</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredFiles.map((file) => (
                  <tr
                    key={file.id}
                    onClick={() => {
                      setSelectedFile(file);
                      setIsFileDrawerOpen(true);
                    }}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 flex items-center gap-3">
                      {getFileIcon(file.type)}
                      <span className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
                        {file.name}
                      </span>
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-400">{file.folder}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{file.size}</td>
                    <td className="py-3 px-4 uppercase font-mono text-[11px] text-cyan-400">
                      {file.extension}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{file.updatedAt}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyUrl(file.url);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/[0.06]"
                          title="Copiar URL CDN"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteFile(file.id, file.name, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                          title="Excluir Arquivo"
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
        )}
      </div>

      {/* Drawer: File Details & Preview */}
      <Drawer
        isOpen={isFileDrawerOpen}
        onClose={() => setIsFileDrawerOpen(false)}
        title={selectedFile?.name || 'Detalhes do Arquivo'}
        subtitle={`Armazenado em: /${selectedFile?.folder}`}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => selectedFile && handleDeleteFile(selectedFile.id, selectedFile.name, e)}
            >
              Excluir
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => selectedFile && handleCopyUrl(selectedFile.url)}
              leftIcon={copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            >
              {copiedUrl ? 'Copiado!' : 'Copiar URL CDN'}
            </Button>
          </div>
        }
      >
        {selectedFile && (
          <div className="space-y-5">
            {/* Visual Preview */}
            <div className="w-full aspect-video rounded-2xl bg-[#020617] border border-white/10 overflow-hidden flex items-center justify-center p-2">
              {selectedFile.type === 'image' && selectedFile.url ? (
                <img
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="p-8 rounded-2xl bg-white/[0.03] text-center">
                  {getFileIcon(selectedFile.type)}
                  <p className="text-xs text-slate-400 mt-2 font-mono">{selectedFile.mimeType}</p>
                </div>
              )}
            </div>

            {/* File Info */}
            <div className="p-4 rounded-xl bg-[#0B1628]/60 border border-white/[0.06] space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Nome do Arquivo:</span>
                <span className="font-mono text-slate-200 font-semibold">{selectedFile.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tamanho:</span>
                <span className="font-mono text-cyan-300">{selectedFile.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">MIME Type:</span>
                <span className="font-mono text-slate-200">{selectedFile.mimeType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bucket:</span>
                <span className="capitalize text-slate-200">{selectedFile.folder}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Acesso Público:</span>
                <span className="text-emerald-400 font-semibold">Leitura CDN Habilitada</span>
              </div>
            </div>

            {/* CDN URL Input Box */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">URL Pública de CDN</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={selectedFile.url}
                  className="flex-1 bg-[#020617] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-cyan-400 selection:bg-cyan-500/30 outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal: Upload File */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload de Arquivo para o Storage"
        subtitle="O arquivo será processado, indexado e propagado na CDN global."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleUpload}
              isLoading={isUploading}
              disabled={!uploadFileName.trim()}
            >
              Iniciar Upload
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Drag and Drop Zone Simulator */}
          <div className="border-2 border-dashed border-cyan-400/30 rounded-2xl p-6 text-center bg-[#020617]/50 hover:bg-cyan-500/[0.04] transition-colors cursor-pointer">
            <UploadCloud className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
            <div className="text-xs font-bold text-slate-200">
              Arraste e solte o arquivo aqui ou clique para selecionar
            </div>
            <p className="text-[11px] text-slate-500 mt-1">PNG, JPG, PDF, MP4 ou ZIP até 100MB</p>
          </div>

          <Input
            label="Nome do Arquivo"
            placeholder="ex: banner_promocao_2026.png, relatorio.pdf"
            value={uploadFileName}
            onChange={(e) => setUploadFileName(e.target.value)}
            required
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Destino (Bucket)</label>
              <select
                value={uploadFolder}
                onChange={(e) => setUploadFolder(e.target.value)}
                className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
              >
                <option value="avatars">avatars</option>
                <option value="products">products</option>
                <option value="documents">documents</option>
                <option value="uploads">uploads</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tipo de Mídia</label>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as any)}
                className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
              >
                <option value="image">Imagem</option>
                <option value="document">Documento PDF</option>
                <option value="video">Vídeo</option>
                <option value="archive">Arquivo Compactado</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};


export const Storage: React.FC = () => isRealMode ? <RealStorage /> : <MockStorage />;
