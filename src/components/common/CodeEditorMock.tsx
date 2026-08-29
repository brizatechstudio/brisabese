import React, { useState } from 'react';
import { Copy, Check, Terminal, Play, Save } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CodeEditorMockProps {
  initialCode: string;
  language?: string;
  readOnly?: boolean;
  onSave?: (code: string) => void;
  height?: string;
}

export const CodeEditorMock: React.FC<CodeEditorMockProps> = ({
  initialCode,
  language = 'typescript',
  readOnly = false,
  onSave,
  height = 'h-80'
}) => {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const { showToast } = useApp();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    showToast('Código copiado!', 'Conteúdo copiado para a área de transferência', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(code);
      showToast('Função Salva', 'Alterações no código foram persistidas com sucesso', 'success');
    }
  };

  const lines = code.split('\n');

  return (
    <div className="rounded-2xl border border-white/10 bg-[#07111F] overflow-hidden shadow-2xl flex flex-col font-mono text-xs">
      {/* Editor Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0B1628] border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-300 font-medium">index.{language === 'python' ? 'py' : 'ts'}</span>
          <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[10px] text-cyan-300 font-sans">
            {language.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition-colors text-xs font-sans"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          {!readOnly && onSave && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1677FF] hover:bg-[#1677FF]/90 text-white font-sans font-semibold transition-colors text-xs shadow-md shadow-[#1677FF]/30"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar</span>
            </button>
          )}
        </div>
      </div>

      {/* Editor Body */}
      <div className={`relative flex ${height} overflow-auto bg-[#020617] text-slate-200`}>
        {/* Line Numbers */}
        <div className="py-3 px-3 select-none text-slate-600 bg-[#07111F]/50 border-r border-white/[0.06] text-right font-mono min-w-[40px]">
          {lines.map((_, idx) => (
            <div key={idx} className="leading-6">
              {idx + 1}
            </div>
          ))}
        </div>

        {/* Code Content */}
        <div className="flex-1 p-3 font-mono leading-6">
          {readOnly ? (
            <pre className="whitespace-pre overflow-x-auto text-slate-200 leading-6">
              {code}
            </pre>
          ) : (
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full h-full bg-transparent resize-none outline-none font-mono text-xs leading-6 text-slate-200 selection:bg-cyan-500/30"
              spellCheck={false}
            />
          )}
        </div>
      </div>
    </div>
  );
};
