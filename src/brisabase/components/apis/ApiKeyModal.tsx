import React, { useState } from 'react';
import { ApiKeyItem } from '../../types';
import { Key, X, Copy, Check, Eye } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, type: 'public' | 'secret' | 'service') => Promise<ApiKeyItem>;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'secret' | 'service'>('public');
  const [createdKey, setCreatedKey] = useState<ApiKeyItem | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    const keyItem = await onCreate(name, type);
    setCreatedKey(keyItem);
  };

  const handleCopy = () => {
    if (createdKey) {
      const keyToCopy = (createdKey as any).fullSecretKey || createdKey.fullKeyMock;
      navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              {createdKey ? 'Nova Chave Gerada' : 'Gerar Nova API Key'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!createdKey ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Nome da Chave</label>
              <input
                type="text"
                required
                placeholder="Ex: Mobile Production App"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Tipo de Permissāo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
              >
                <option value="public">Public (Anon Key - RLS Aplicado)</option>
                <option value="secret">Secret (Server Side Client Key)</option>
                <option value="service">Service Admin (Bypass RLS - Full Root)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"
              >
                Gerar Chave
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs text-amber-300 space-y-1">
              <p className="font-semibold">Copie sua API Key agora!</p>
              <p className="text-[11px] text-amber-400/80">Por razões de segurança, você não poderá visualizar esta chave inteira novamente.</p>
            </div>

            <div className="relative">
              <input
                type="text"
                readOnly
                value={(createdKey as any).fullSecretKey || createdKey.fullKeyMock}
                className="w-full rounded-xl border border-purple-500/50 bg-slate-950 px-3 py-2.5 pr-10 text-xs font-mono text-purple-300 select-all"
              />
              <button
                onClick={handleCopy}
                className="absolute right-2 top-2 p-1 text-slate-400 hover:text-white rounded bg-slate-800"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={onClose}
                className="rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-500"
              >
                Entendi, Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
