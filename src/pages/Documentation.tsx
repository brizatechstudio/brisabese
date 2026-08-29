import React, { useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { CodeEditorMock } from '../components/common/CodeEditorMock';
import { mockDocsSections, DocSection } from '../data/mockDocs';
import { BookOpen, Copy, Check, Terminal, ExternalLink, Code2, Sparkles, Layers, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Documentation: React.FC = () => {
  const { showToast } = useApp();
  const [activeSectionId, setActiveSectionId] = useState<string>(mockDocsSections[0].id);

  const activeDoc: DocSection = mockDocsSections.find((d) => d.id === activeSectionId) || mockDocsSections[0];

  const handleCopyInstall = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    showToast('Copiado!', `Comando copiado para o terminal`, 'info');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Documentação & SDKs Oficiais"
        subtitle="Guias rápidos, referências de API e exemplos de código para integrar o BrisaBase em qualquer linguagem."
        badge="v2.4.0 SDK"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ExternalLink className="w-4 h-4" />}
              onClick={() => showToast('GitHub', 'Redirecionando para os repositórios oficiais...', 'info')}
            >
              GitHub SDKs
            </Button>
          </div>
        }
      />

      {/* Quick Install Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#07111F] via-[#0B1628] to-[#1677FF]/20 border border-white/[0.08] shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-left">
          <div className="text-sm font-bold text-slate-100 flex items-center justify-center md:justify-start gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>Instale o BrisaBase Client no seu projeto</span>
          </div>
          <p className="text-xs text-slate-400">Compatível com React, Next.js, Node.js, Vue, Svelte, Flutter e Python.</p>
        </div>

        <div className="flex items-center gap-2 bg-[#020617] border border-white/10 px-4 py-2 rounded-xl font-mono text-xs text-cyan-300 shadow-inner">
          <span>npm install @brisabase/js</span>
          <button
            onClick={() => handleCopyInstall('npm install @brisabase/js')}
            className="p-1 hover:text-white transition-colors cursor-pointer"
            title="Copiar comando"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Layout: Sidebar & Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Nav */}
        <div className="lg:col-span-1 space-y-2">
          <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-2 flex items-center justify-between">
              <span>Tópicos do Guia</span>
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            </div>

            {mockDocsSections.map((doc) => {
              const isActive = doc.id === activeSectionId;
              return (
                <button
                  key={doc.id}
                  onClick={() => setActiveSectionId(doc.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#1677FF] text-white font-bold shadow-md shadow-[#1677FF]/25'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate pr-2">{doc.title}</span>
                  <Badge variant={isActive ? 'outline' : 'neutral'} size="sm">
                    {doc.category}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Content */}
        <div className="lg:col-span-3 space-y-6">
          <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="cyan" size="sm">{activeDoc.category}</Badge>
                </div>
                <h3 className="text-xl font-bold text-slate-100">{activeDoc.title}</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<Copy className="w-3.5 h-3.5" />}
                onClick={() => {
                  navigator.clipboard.writeText(activeDoc.content);
                  showToast('Copiado!', 'Documentação copiada para a área de transferência', 'success');
                }}
              >
                Copiar Texto
              </Button>
            </div>

            {/* Markdown Text Render */}
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-[#0B1628]/40 p-4 rounded-xl border border-white/[0.06] font-sans">
              {activeDoc.content}
            </div>

            {/* Code Snippets */}
            {activeDoc.codeSnippets && activeDoc.codeSnippets.length > 0 && (
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-[#12D9FF]" />
                  <span>Exemplos de Código Prático</span>
                </div>

                {activeDoc.codeSnippets.map((snippet, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                      <span className="font-mono text-cyan-300 uppercase font-semibold">{snippet.language}</span>
                    </div>
                    <CodeEditorMock
                      initialCode={snippet.code}
                      language={snippet.language}
                      height="h-64"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
