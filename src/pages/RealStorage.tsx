import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, File, Folder, HardDrive, Link2, Plus, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import type { StorageBucket, StorageFile } from '../brisabase/types';
import type { StorageUsage } from '../brisabase/services/storageService';
import { realStorageService } from '../services/runtime';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export const RealStorage: React.FC = () => {
  const { activeProject, showToast } = useApp();
  const [buckets, setBuckets] = useState<StorageBucket[]>([]);
  const [activeBucketId, setActiveBucketId] = useState('');
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bucketOpen, setBucketOpen] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [bucketPublic, setBucketPublic] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeBucket = useMemo(() => buckets.find((bucket) => bucket.id === activeBucketId) || buckets[0] || null, [buckets, activeBucketId]);

  const loadBuckets = async () => {
    setLoading(true);
    try {
      const [items, currentUsage] = await Promise.all([realStorageService.listBuckets(), realStorageService.getUsage()]);
      setBuckets(items);
      setUsage(currentUsage);
      setActiveBucketId((current) => items.some((bucket) => bucket.id === current) ? current : items[0]?.id || '');
    } catch (error) {
      showToast('Storage indisponível', error instanceof Error ? error.message : 'Não foi possível acessar o MinIO.', 'error');
    } finally { setLoading(false); }
  };

  const loadFiles = async () => {
    if (!activeBucket) return setFiles([]);
    try { setFiles(await realStorageService.listFiles(activeBucket.id)); }
    catch (error) { showToast('Falha ao listar objetos', error instanceof Error ? error.message : undefined, 'error'); }
  };

  useEffect(() => { if (activeProject?.id) void loadBuckets(); }, [activeProject?.id]);
  useEffect(() => { void loadFiles(); }, [activeBucket?.id]);

  const createBucket = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!bucketName.trim()) return;
    try {
      const created = await realStorageService.createBucket(bucketName.trim(), bucketPublic);
      setBucketOpen(false); setBucketName(''); setBucketPublic(false);
      await loadBuckets(); setActiveBucketId(created.id);
      showToast('Bucket criado', `${created.name} foi criado no Storage real.`, 'success');
    } catch (error) { showToast('Erro ao criar bucket', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const upload = async (selected: FileList | null) => {
    const file = selected?.[0];
    if (!file || !activeBucket) return;
    setUploading(true); setProgress(0);
    try {
      const uploaded = await realStorageService.uploadFile(activeBucket.id, file, { onProgress: setProgress });
      await Promise.all([loadFiles(), loadBuckets()]);
      showToast('Upload real concluído', `${uploaded.name} foi enviado ao MinIO/S3 local.`, 'success');
    } catch (error) { showToast('Falha no upload', error instanceof Error ? error.message : undefined, 'error'); }
    finally { setUploading(false); setProgress(0); if (fileInput.current) fileInput.current.value = ''; }
  };

  const removeFile = async (file: StorageFile) => {
    if (!activeBucket || !window.confirm(`Excluir ${file.name} do Storage real?`)) return;
    try { await realStorageService.deleteFile(activeBucket.id, file.id); await Promise.all([loadFiles(), loadBuckets()]); showToast('Arquivo removido', 'Objeto excluído do MinIO.', 'info'); }
    catch (error) { showToast('Falha ao excluir', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const removeBucket = async () => {
    if (!activeBucket || !window.confirm(`Excluir o bucket ${activeBucket.name}? O bucket deve estar vazio.`)) return;
    try { await realStorageService.deleteBucket(activeBucket.id); await loadBuckets(); showToast('Bucket removido', 'Bucket excluído do Storage real.', 'warning'); }
    catch (error) { showToast('Falha ao excluir bucket', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const download = async (file: StorageFile) => {
    if (!activeBucket) return;
    try {
      const blob = await realStorageService.downloadFile(activeBucket.id, file.id);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url);
    } catch (error) { showToast('Falha no download', error instanceof Error ? error.message : undefined, 'error'); }
  };

  const signedUrl = async (file: StorageFile) => {
    if (!activeBucket) return;
    try {
      const signed = await realStorageService.createSignedUrl(activeBucket.id, file.path || file.name, 3600);
      await navigator.clipboard.writeText(signed.signedUrl);
      showToast('Signed URL copiada', `Válida até ${new Date(signed.expiresAt).toLocaleString('pt-BR')}.`, 'success');
    } catch (error) { showToast('Falha na Signed URL', error instanceof Error ? error.message : undefined, 'error'); }
  };

  return <div className="space-y-6 animate-in fade-in duration-300">
    <PageHeader title="Storage" subtitle="Buckets e objetos reais no MinIO com API compatível com S3, upload, download e links assinados." badge={<Badge variant="success" dot>MinIO / S3 • REAL</Badge>} actions={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>void loadBuckets()} leftIcon={<RefreshCw className="w-4 h-4"/>}>Atualizar</Button><Button variant="outline" size="sm" onClick={()=>setBucketOpen(true)} leftIcon={<Plus className="w-4 h-4"/>}>Novo bucket</Button><input ref={fileInput} type="file" className="hidden" onChange={e=>void upload(e.target.files)}/><Button variant="gradient" size="sm" disabled={!activeBucket||uploading} onClick={()=>fileInput.current?.click()} leftIcon={<UploadCloud className="w-4 h-4"/>}>{uploading?`Enviando ${progress}%`:'Upload'}</Button></div>}/>

    <div className="grid sm:grid-cols-3 gap-4">
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08]"><div className="text-xs text-slate-400">Buckets reais</div><div className="mt-1 text-xl font-bold text-slate-100">{usage?.bucketCount ?? buckets.length}</div></div>
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08]"><div className="text-xs text-slate-400">Objetos</div><div className="mt-1 text-xl font-bold text-slate-100">{usage?.totalFiles ?? files.length}</div></div>
      <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] flex items-center justify-between"><div><div className="text-xs text-slate-400">Armazenado</div><div className="mt-1 text-xl font-bold text-cyan-300">{size(usage?.totalBytes || 0)}</div></div><HardDrive className="w-5 h-5 text-cyan-400"/></div>
    </div>

    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <aside className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-3 min-h-[520px]"><div className="flex items-center justify-between px-2 pb-2"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Buckets</span>{activeBucket&&<button onClick={()=>void removeBucket()} className="p-1.5 text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5"/></button>}</div>{loading?<div className="p-3 text-xs text-slate-500">Consultando MinIO…</div>:buckets.length===0?<button onClick={()=>setBucketOpen(true)} className="w-full p-5 rounded-xl border border-dashed border-white/10 text-xs text-cyan-400">Criar primeiro bucket</button>:<div className="space-y-1">{buckets.map(bucket=><button key={bucket.id} onClick={()=>setActiveBucketId(bucket.id)} className={`w-full rounded-xl px-3 py-2.5 text-left flex items-center gap-2 border ${activeBucket?.id===bucket.id?'bg-blue-600/20 border-blue-500/30':'border-transparent hover:bg-white/[0.04]'}`}><Folder className="w-4 h-4 text-cyan-400"/><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-200 truncate">{bucket.name}</div><div className="text-[10px] text-slate-500">{bucket.fileCount} objetos • {bucket.isPublic?'público':'privado'}</div></div></button>)}</div>}</aside>

      <section className="rounded-2xl bg-[#07111F] border border-white/[0.08] overflow-hidden"><div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between"><div><div className="font-bold text-sm text-slate-100">{activeBucket?.name || 'Nenhum bucket'}</div><div className="text-[11px] text-slate-500">{activeBucket?.isPublic?'Leitura pública habilitada':'Bucket privado'}</div></div>{activeBucket&&<Badge variant={activeBucket.isPublic?'success':'neutral'} size="sm">{activeBucket.isPublic?'public':'private'}</Badge>}</div>{!activeBucket?<div className="p-16 text-center text-xs text-slate-500">Crie ou selecione um bucket.</div>:files.length===0?<div className="p-16 text-center"><UploadCloud className="w-8 h-8 text-slate-600 mx-auto"/><div className="mt-3 text-xs text-slate-500">Nenhum objeto neste bucket.</div><Button className="mt-4" variant="outline" size="sm" onClick={()=>fileInput.current?.click()}>Enviar arquivo</Button></div>:<div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-[#0B1628] text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Objeto</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Tamanho</th><th className="px-4 py-3">Atualizado</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-white/[0.05]">{files.map(file=><tr key={file.id} className="hover:bg-white/[0.03]"><td className="px-4 py-3"><div className="flex items-center gap-2"><File className="w-4 h-4 text-cyan-400"/><div><div className="font-semibold text-slate-200">{file.name}</div><div className="text-[10px] text-slate-500 font-mono">{file.path}</div></div></div></td><td className="px-4 py-3 text-slate-400 font-mono">{file.mimeType}</td><td className="px-4 py-3 text-slate-400">{size(file.sizeBytes)}</td><td className="px-4 py-3 text-slate-500">{file.updatedAt}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={()=>void signedUrl(file)} title="Signed URL" className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300"><Link2 className="w-3.5 h-3.5"/></button><button onClick={()=>void download(file)} title="Download" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300"><Download className="w-3.5 h-3.5"/></button>{file.visibility==='public'&&<button onClick={()=>navigator.clipboard.writeText(new URL(file.publicUrl, window.location.origin).toString())} title="Copiar URL pública" className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300"><Copy className="w-3.5 h-3.5"/></button>}<button onClick={()=>void removeFile(file)} title="Excluir" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5"/></button></div></td></tr>)}</tbody></table></div>}</section>
    </div>

    <Modal isOpen={bucketOpen} onClose={()=>setBucketOpen(false)} title="Criar bucket real" subtitle="O bucket será criado no MinIO do runtime local." footer={<><Button variant="outline" size="sm" onClick={()=>setBucketOpen(false)}>Cancelar</Button><Button variant="gradient" size="sm" onClick={createBucket} disabled={!bucketName.trim()}>Criar</Button></>}><form onSubmit={createBucket} className="space-y-4"><Input label="Nome do bucket" placeholder="uploads" value={bucketName} onChange={e=>setBucketName(e.target.value)} autoFocus/><label className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] p-3"><div><div className="text-xs font-semibold text-slate-200">Bucket público</div><div className="text-[10px] text-slate-500">Objetos podem usar URL pública quando permitido.</div></div><input type="checkbox" checked={bucketPublic} onChange={e=>setBucketPublic(e.target.checked)} className="accent-cyan-500"/></label></form></Modal>
  </div>;
};
