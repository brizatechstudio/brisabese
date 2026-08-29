import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = 'typescript', title }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 font-mono shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700"></span>
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700"></span>
            <span className="h-2.5 w-2.5 rounded-full bg-slate-700"></span>
          </div>
          {title && <span className="ml-2 text-xs text-slate-400 font-sans">{title}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400/80 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
            {language}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800"
            title="Copiar Código"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[11px] font-sans">{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto text-xs leading-relaxed text-slate-300">
        <pre>{code}</pre>
      </div>
    </div>
  );
};
