import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { storageService } from '../services';
import { StorageBucket, StorageFile } from '../types';
import { FileUploadModal } from '../components/storage/FileUploadModal';
import { MetricCard } from '../components/common/MetricCard';
import {
  FolderOpen,
  HardDrive,
  File,
  UploadCloud,
  Trash2,
  Download,
  Lock,
  Globe,
  Plus,
  Search,
  Settings2
} from 'lucide-react';

export const StoragePage: React.FC = () => {
  const { language } = useApp();
  const isEnglish = language === 'en-US';
  const [buckets, setBuckets] = useState<StorageBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<StorageBucket | null>(null);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreateBucketOpen, setIsCreateBucketOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState('teste');
  const [newBucketPublic, setNewBucketPublic] = useState(false);
  const [isBucketSettingsOpen, setIsBucketSettingsOpen] = useState(false);
  const [settingsPublic, setSettingsPublic] = useState(false);
  const [settingsVersioning, setSettingsVersioning] = useState(false);
  const [settingsMaxMb, setSettingsMaxMb] = useState(100);
  const [settingsCorsOrigins, setSettingsCorsOrigins] = useState('');
  const [settingsExpireDays, setSettingsExpireDays] = useState('');
  const [isCreatingBucket, setIsCreatingBucket] = useState(false);
  const [usage, setUsage] = useState({ totalFiles: 0, totalBytes: 0, bucketCount: 0, uploadedBytes: 0, downloadedBytes: 0, uploadsCount: 0, downloadsCount: 0 });

  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setError(null);
    try {
      const [bList, currentUsage] = await Promise.all([storageService.listBuckets(), storageService.getUsage()]);
      setBuckets(bList);
      setUsage(currentUsage);
      if (bList.length > 0 && !selectedBucket) {
        setSelectedBucket(bList[0]);
      }
      if (bList.length === 0) {
        setSelectedBucket(null);
        setFiles([]);
      }
    } catch (err: any) {
      setError(err.message || (isEnglish ? 'Could not load storage data.' : 'Não foi possível carregar os dados.'));
    }
  };

  const loadFilesForBucket = async (bucketId: string) => {
    try {
      const fList = await storageService.listFiles(bucketId);
      setFiles(fList);
    } catch (err: any) {
      setError(err.message || (isEnglish ? 'Could not load files.' : 'Não foi possível carregar os arquivos.'));
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (selectedBucket) {
      void loadFilesForBucket(selectedBucket.id);
    }
  }, [selectedBucket]);

  const handleCreateBucket = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newBucketName.trim().toLowerCase();
    if (!name) {
      setError(isEnglish ? 'Enter a bucket name.' : 'Informe o nome do bucket.');
      return;
    }

    setError(null);
    setIsCreatingBucket(true);
    try {
      const created = await storageService.createBucket(name, newBucketPublic);
      const [bList, currentUsage] = await Promise.all([storageService.listBuckets(), storageService.getUsage()]);
      setBuckets(bList);
      setUsage(currentUsage);
      setSelectedBucket(bList.find((bucket) => bucket.id === created.id) || created);
      setFiles([]);
      setNewBucketName('teste');
      setNewBucketPublic(false);
      setIsCreateBucketOpen(false);
    } catch (err: any) {
      setError(err.message || (isEnglish ? 'Could not create the bucket.' : 'Não foi possível criar o bucket.'));
    } finally {
      setIsCreatingBucket(false);
    }
  };

  const handleUploadFile = async (bucketId: string, file: File, options: Parameters<typeof storageService.uploadFile>[2]) => {
    await storageService.uploadFile(bucketId, file, options);
    if (selectedBucket) {
      await loadFilesForBucket(selectedBucket.id);
    }
    await loadData();
  };

  const handleDeleteFile = async (fileId: string) => {
    if (selectedBucket) {
      await storageService.deleteFile(selectedBucket.id, fileId);
      await loadFilesForBucket(selectedBucket.id);
    }
    await loadData();
  };


  const openBucketSettings = () => {
    if (!selectedBucket) return;
    setSettingsPublic(Boolean(selectedBucket.isPublic));
    setSettingsVersioning(Boolean(selectedBucket.versioningEnabled));
    setSettingsMaxMb(Math.max(1,Math.round((selectedBucket.fileSizeLimitBytes || 100*1024*1024)/(1024*1024))));
    setSettingsCorsOrigins((selectedBucket.corsConfig?.[0]?.allowedOrigins || []).join(', '));
    const expiration=selectedBucket.lifecycleRules?.find((rule)=>rule.enabled&&rule.expireAfterDays)?.expireAfterDays;
    setSettingsExpireDays(expiration ? String(expiration) : '');
    setIsBucketSettingsOpen(true);
  };

  const saveBucketSettings = async (event: React.FormEvent) => {
    event.preventDefault(); if(!selectedBucket)return; setError(null);
    try {
      const origins=settingsCorsOrigins.split(',').map((value)=>value.trim()).filter(Boolean);
      const expireDays=settingsExpireDays ? Math.max(1,Math.floor(Number(settingsExpireDays))) : undefined;
      const updated=await storageService.updateBucket(selectedBucket.id,{isPublic:settingsPublic,versioningEnabled:settingsVersioning,fileSizeLimitBytes:Math.max(1,settingsMaxMb)*1024*1024,corsConfig:origins.length?[{allowedOrigins:origins,allowedMethods:['GET','HEAD','POST','PUT','DELETE'],allowedHeaders:['content-type','authorization'],exposedHeaders:['ETag','Content-Range'],maxAgeSeconds:3600}]:[],lifecycleRules:expireDays?[{id:'default-expiration',enabled:true,expireAfterDays:expireDays,abortIncompleteMultipartAfterDays:1}]:[]});
      setSelectedBucket(updated); setIsBucketSettingsOpen(false); await loadData();
    } catch(err:any){setError(err?.message || (isEnglish?'Could not update bucket settings.':'Não foi possível atualizar o bucket.'));}
  };

  const filteredFiles = files.filter((f) => f.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-purple-400" />
            Storage Engine
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isEnglish
              ? 'S3-compatible object storage with public/private buckets, signed URLs and access policies. Managed edge CDN is not enabled yet.'
              : 'Storage de objetos compatível com S3, buckets públicos/privados, URLs assinadas e políticas de acesso. CDN de edge gerenciada ainda não está habilitada.'}
          </p>
        </div>

        <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
          <button
            onClick={() => setIsCreateBucketOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-purple-500/60 hover:text-white transition-all"
          >
            <Plus className="w-4 h-4" />
            {isEnglish ? 'New Bucket' : 'Novo Bucket'}
          </button>
          <button onClick={openBucketSettings} disabled={!selectedBucket} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-cyan-500/60 disabled:opacity-40"><Settings2 className="w-4 h-4" />{isEnglish ? 'Bucket Settings' : 'Configurar Bucket'}</button>
          <button
            onClick={() => selectedBucket && setIsUploadModalOpen(true)}
            disabled={!selectedBucket}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-lg shadow-purple-900/40 transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UploadCloud className="w-4 h-4" />
            {isEnglish ? 'Upload File' : 'Fazer Upload'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard title={isEnglish ? 'Space Used' : 'Espaço Utilizado'} value={`${(usage.totalBytes / 1024 / 1024).toFixed(2)} MB`} badge={`${usage.uploadsCount} uploads`} badgeType="neutral" icon={HardDrive} />
        <MetricCard title={isEnglish ? 'Active Buckets' : 'Buckets Ativos'} value={`${usage.bucketCount} Buckets`} badge={isEnglish ? 'Public & Private' : 'Públicos & Privados'} badgeType="neutral" icon={FolderOpen} />
        <MetricCard title={isEnglish ? 'Total Files' : 'Total de Arquivos'} value={usage.totalFiles.toLocaleString('pt-BR')} badge={`${usage.downloadsCount} downloads`} badgeType="positive" icon={File} />
      </div>

      {/* Main Buckets & File Explorer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Buckets List Sidebar */}
        <div className="lg:col-span-1 space-y-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 h-fit">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 block">
            {isEnglish ? 'Storage Buckets' : 'Buckets de Armazenamento'} ({buckets.length})
          </span>
          <div className="space-y-1">
            {buckets.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-800 px-3 py-5 text-center">
                <p className="text-xs text-slate-500">{isEnglish ? 'No bucket created in this environment.' : 'Nenhum bucket criado neste ambiente.'}</p>
                <button
                  onClick={() => setIsCreateBucketOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-purple-600/20 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-600/30"
                >
                  <Plus className="h-3.5 w-3.5" /> {isEnglish ? 'Create first bucket' : 'Criar primeiro bucket'}
                </button>
              </div>
            )}
            {buckets.map((b) => {
              const isSelected = selectedBucket?.id === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedBucket(b)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all ${
                    isSelected
                      ? 'bg-purple-600/20 text-white border border-purple-500/30 font-bold'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {b.isPublic ? <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span className="truncate">{b.name}</span>
                  </div>
                  <span className="text-[10px] font-normal text-slate-500 font-mono bg-slate-950 px-1.5 py-0.5 rounded shrink-0">
                    {b.fileCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Files Table Explorer */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder={`${isEnglish ? 'Search files in' : 'Buscar arquivos em'} ${selectedBucket?.name || 'bucket'}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!selectedBucket}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <span className="text-xs font-mono text-slate-400">
              {isEnglish ? 'Bucket' : 'Bucket'}: <strong className="text-purple-300">{selectedBucket?.name || (isEnglish ? 'none' : 'nenhum')}</strong> {selectedBucket ? `(${selectedBucket.isPublic ? (isEnglish ? 'Public' : 'Público') : (isEnglish ? 'Private' : 'Privado')})` : ''}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-mono">
                  <th className="px-4 py-3 font-semibold">{isEnglish ? 'File Name' : 'Nome do Arquivo'}</th>
                  <th className="px-4 py-3 font-semibold">{isEnglish ? 'MIME Type' : 'Tipo MIME'}</th>
                  <th className="px-4 py-3 font-semibold">{isEnglish ? 'Size' : 'Tamanho'}</th>
                  <th className="px-4 py-3 font-semibold">{isEnglish ? 'Modified' : 'Modificado'}</th>
                  <th className="px-4 py-3 text-right font-semibold">{isEnglish ? 'Actions' : 'Ações'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500 font-sans">
                      {selectedBucket
                        ? (isEnglish ? `No files found in bucket ${selectedBucket.name}.` : `Nenhum arquivo encontrado no bucket ${selectedBucket.name}.`)
                        : (isEnglish ? 'Create or select a bucket to view files.' : 'Crie ou selecione um bucket para visualizar arquivos.')}
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-200 font-semibold flex items-center gap-2">
                        <File className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="truncate max-w-[200px]" title={f.path || f.name}>{f.path || f.name}</span>
                        {f.version ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">v{f.version}</span> : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400">{f.mimeType}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-purple-300">
                        {(f.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{f.updatedAt}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-sans">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={f.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded"
                            title={isEnglish ? 'Download / View' : 'Download / Visualizar'}
                          >
                            <Download className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => void handleDeleteFile(f.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded"
                            title={isEnglish ? 'Delete File' : 'Excluir Arquivo'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isBucketSettingsOpen && selectedBucket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form onSubmit={saveBucketSettings} className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div><h2 className="text-lg font-semibold text-white flex items-center gap-2"><Settings2 className="h-5 w-5 text-cyan-400" />{selectedBucket.name}</h2><p className="text-xs text-slate-500 mt-1">{isEnglish?'Versioning, size limits, CORS and lifecycle are enforced by the real Storage runtime.':'Versionamento, limites, CORS e lifecycle são aplicados pelo runtime real do Storage.'}</p></div>
            <div className="grid sm:grid-cols-2 gap-3"><label className="rounded-xl border border-slate-800 p-3 text-xs text-slate-300"><input type="checkbox" checked={settingsPublic} onChange={e=>setSettingsPublic(e.target.checked)} className="mr-2" />{isEnglish?'Public bucket':'Bucket público'}</label><label className="rounded-xl border border-slate-800 p-3 text-xs text-slate-300"><input type="checkbox" checked={settingsVersioning} onChange={e=>setSettingsVersioning(e.target.checked)} className="mr-2" />{isEnglish?'Object versioning':'Versionamento de objetos'}</label></div>
            <label className="block text-xs text-slate-300">{isEnglish?'Maximum file size (MB)':'Tamanho máximo por arquivo (MB)'}<input type="number" min={1} max={10240} value={settingsMaxMb} onChange={e=>setSettingsMaxMb(Number(e.target.value)||1)} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
            <label className="block text-xs text-slate-300">{isEnglish?'CORS origins (comma separated)':'Origens CORS (separadas por vírgula)'}<input value={settingsCorsOrigins} onChange={e=>setSettingsCorsOrigins(e.target.value)} placeholder="https://app.example.com" className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-white" /></label>
            <label className="block text-xs text-slate-300">{isEnglish?'Expire objects after days (blank = disabled)':'Expirar objetos após dias (vazio = desativado)'}<input value={settingsExpireDays} onChange={e=>setSettingsExpireDays(e.target.value)} type="number" min={1} max={36500} className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={()=>setIsBucketSettingsOpen(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs text-slate-300">{isEnglish?'Cancel':'Cancelar'}</button><button className="rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white">{isEnglish?'Save settings':'Salvar configurações'}</button></div>
          </form>
        </div>
      )}

      {/* Create Bucket Modal */}
      {isCreateBucketOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateBucket}
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
          >
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Plus className="h-5 w-5 text-purple-400" /> {isEnglish ? 'New bucket' : 'Novo bucket'}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {isEnglish ? 'The bucket belongs to the currently selected project and environment.' : 'O bucket pertence ao projeto e ambiente atualmente selecionados.'}
              </p>
            </div>

            <label className="block text-sm text-slate-300">
              {isEnglish ? 'Bucket name' : 'Nome do bucket'}
              <input
                autoFocus
                value={newBucketName}
                onChange={(event) => setNewBucketName(event.target.value)}
                placeholder="teste"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-purple-500"
              />
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <input
                type="checkbox"
                checked={newBucketPublic}
                onChange={(event) => setNewBucketPublic(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">{isEnglish ? 'Public bucket' : 'Bucket público'}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {isEnglish ? 'Leave unchecked to create a private bucket and validate access policies.' : 'Deixe desmarcado para criar um bucket privado e validar as políticas de acesso.'}
                </span>
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateBucketOpen(false)}
                disabled={isCreatingBucket}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                {isEnglish ? 'Cancel' : 'Cancelar'}
              </button>
              <button
                type="submit"
                disabled={isCreatingBucket || !newBucketName.trim()}
                className="rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreatingBucket ? (isEnglish ? 'Creating...' : 'Criando...') : (isEnglish ? 'Create bucket' : 'Criar bucket')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* File Upload Modal */}
      {selectedBucket && isUploadModalOpen && (
        <FileUploadModal
          bucket={selectedBucket}
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleUploadFile}
        />
      )}
    </div>
  );
};
