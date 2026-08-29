import React, { useState } from 'react';
import { CreateFunctionInput } from '../../services';
import { X, Code2, Plus } from 'lucide-react';

interface FunctionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateFunctionInput) => Promise<void>;
}

export const FunctionEditorModal: React.FC<FunctionEditorModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState<'nodejs20'>('nodejs20');
  const [codeSnippet, setCodeSnippet] = useState(
    `export default async (req, ctx) => {\n  const body = await req.json();\n  ctx.logger.info("Function invoked");\n  return { status: 200, body: { status: "ok", body } };\n};`
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    await onCreate({ name, runtime, codeSnippet });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-semibold text-slate-100">Criar Nova Serverless Function</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Nome da Function</label>
              <input
                type="text"
                required
                placeholder="Ex: process-order-webhook"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Runtime Ambiente</label>
              <select
                value={runtime}
                onChange={(e) => setRuntime(e.target.value as 'nodejs20')}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
              >
                <option value="nodejs20">Node.js 20 / TypeScript</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Código Inicial</label>
            <textarea
              rows={8}
              value={codeSnippet}
              onChange={(e) => setCodeSnippet(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono text-slate-200 focus:border-purple-500 focus:outline-none leading-relaxed resize-none"
            />
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
              <Plus className="w-4 h-4" />
              Criar Function
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
