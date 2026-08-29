import React, { useRef, useState } from 'react';
import { StorageBucket } from '../../types';
import { UploadOptions } from '../../services/storageService';
import { AlertCircle, CheckCircle2, File, UploadCloud, X } from 'lucide-react';

interface FileUploadModalProps {
  bucket: StorageBucket | null;
  onClose: () => void;
  onUpload: (bucketId: string, file: File, options: UploadOptions) => Promise<void>;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({ bucket, onClose, onUpload }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bucket) return null;

  const selectFile = (next: File | undefined) => {
    if (!next) return;
    setFile(next);
    setProgress(0);
    setError(null);
  };

  const upload = async () => {
    if (!file) { setError('Selecione um arquivo para enviar.'); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsUploading(true);
    setError(null);
    try {
      await onUpload(bucket.id, file, { signal: controller.signal, onProgress: setProgress });
      setProgress(100);
      onClose();
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Não foi possível concluir o upload.');
    } finally {
      setIsUploading(false);
      controllerRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">Upload para <span className="font-mono text-purple-300">{bucket.name}</span></h3>
          </div>
          <button onClick={onClose} disabled={isUploading} className="text-slate-400 hover:text-slate-200 disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>

        <input ref={inputRef} type="file" className="hidden" onChange={(event) => selectFile(event.target.files?.[0])} />
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}
          className="border-2 border-dashed border-slate-800 hover:border-purple-500/50 rounded-xl p-7 text-center space-y-2 bg-slate-950/60 transition-colors cursor-pointer"
        >
          {file ? <File className="w-8 h-8 text-cyan-400 mx-auto" /> : <UploadCloud className="w-8 h-8 text-purple-400 mx-auto" />}
          <p className="text-xs font-semibold text-slate-200">{file ? file.name : 'Arraste e solte o arquivo aqui'}</p>
          <p className="text-[10px] text-slate-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type || 'application/octet-stream'}` : 'ou clique para abrir o seletor de arquivos'}</p>
        </div>

        {(isUploading || progress > 0) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-slate-400"><span>Progresso do upload</span><span>{progress}%</span></div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        {error && <div className="flex gap-2 rounded-lg bg-rose-950/40 border border-rose-900/50 p-2.5 text-xs text-rose-300"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          {isUploading && <button type="button" onClick={() => controllerRef.current?.abort()} className="rounded-lg border border-rose-900/60 px-4 py-2 text-xs font-medium text-rose-300 hover:bg-rose-950/40">Cancelar</button>}
          <button type="button" onClick={onClose} disabled={isUploading} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50">Fechar</button>
          <button type="button" onClick={upload} disabled={!file || isUploading} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-50 shadow-md shadow-purple-900/30">
            {isUploading ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</> : progress === 100 ? <><CheckCircle2 className="w-4 h-4" /> Concluído</> : <><UploadCloud className="w-4 h-4" /> {error ? 'Tentar novamente' : 'Realizar Upload'}</>}
          </button>
        </div>
      </div>
    </div>
  );
};
