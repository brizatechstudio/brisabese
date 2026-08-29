import React, { useState } from 'react';
import { AuthProviderConfig } from '../../types';
import { X, Key, ShieldCheck } from 'lucide-react';

interface ProviderConfigModalProps {
  provider: AuthProviderConfig | null;
  onClose: () => void;
  onSave: (providerId: string, clientId: string, clientSecret: string) => Promise<void>;
}

export const ProviderConfigModal: React.FC<ProviderConfigModalProps> = ({
  provider,
  onClose,
  onSave
}) => {
  const [clientId, setClientId] = useState(provider?.clientId || '');
  const [clientSecret, setClientSecret] = useState('');

  if (!provider) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(provider.id, clientId, clientSecret);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">Configurar {provider.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Client ID / App ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Ex: 839201923812-apps.googleusercontent.com"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Client Secret / Secret Key</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">URL de Redirecionamento (Redirect URI)</label>
            <input
              type="text"
              readOnly
              value={provider.redirectUrl}
              className="w-full rounded-lg border border-slate-800/80 bg-slate-950/60 px-3 py-2 text-xs font-mono text-slate-400 select-all"
            />
            <p className="text-[10px] text-slate-500">Cole esta URL no painel de desenvolvedor do provedor {provider.name}.</p>
            {provider.provider === 'apple' && <p className="text-[10px] text-amber-300/80">No Apple Sign-In, o Client Secret deve ser o JWT de client-secret gerado com a chave privada da Apple, não a chave privada em si.</p>}
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
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/30"
            >
              <ShieldCheck className="w-4 h-4" />
              Salvar Credenciais
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
