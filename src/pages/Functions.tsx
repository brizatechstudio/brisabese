import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { CodeEditorMock } from '../components/common/CodeEditorMock';
import {
  Code2,
  Plus,
  Play,
  Zap,
  Activity,
  CheckCircle2,
  Clock,
  Sliders,
  Terminal,
  Cpu,
  Layers,
  Sparkles
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { ServerlessFunction } from '../types';
import { isRealMode, realFunctionsService } from '../services/runtime';

export const Functions: React.FC = () => {
  const { showToast } = useApp();
  const [functions, setFunctions] = useState<ServerlessFunction[]>([]);
  const [activeFuncId, setActiveFuncId] = useState<string>('fn-1');
  const [loading, setLoading] = useState(true);

  // Execution Simulator State
  const [testPayload, setTestPayload] = useState('{\n  "orderId": "ord_994812",\n  "amount": 299.90,\n  "currency": "BRL"\n}');
  const [testResult, setTestResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // New Function Modal State
  const [isNewFuncModalOpen, setIsNewFuncModalOpen] = useState(false);
  const [newFuncName, setNewFuncName] = useState('');
  const [newFuncDesc, setNewFuncDesc] = useState('');
  const [newFuncRuntime, setNewFuncRuntime] = useState('Node.js 20 (TypeScript)');

  const loadFunctions = async () => {
    setLoading(true);
    const data = await mockApi.getFunctions();
    setFunctions(data);
    if (data.length > 0) setActiveFuncId(data[0].id);
    setLoading(false);
  };

  useEffect(() => {
    loadFunctions();
  }, []);

  const activeFunction = functions.find((f) => f.id === activeFuncId) || functions[0];

  const handleCreateFunction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFuncName.trim()) return;

    try {
      const created = await mockApi.createFunction({
        name: newFuncName,
        description: newFuncDesc,
        runtime: newFuncRuntime,
        code: `export default async function handler(req, res) {\n  const payload = req.body || {};\n  console.log('Recebido:', payload);\n  return res.status(200).json({\n    success: true,\n    message: "Executado com sucesso em BrisaBase Edge!",\n    timestamp: new Date().toISOString()\n  });\n}`
      });

      setFunctions((prev) => [created, ...prev]);
      setActiveFuncId(created.id);
      setIsNewFuncModalOpen(false);
      setNewFuncName('');
      setNewFuncDesc('');
      showToast('Função Criada!', `Função ${created.name} pronta para edição e deploy.`, 'success');
    } catch (err) {
      showToast('Erro ao criar', 'Tente novamente', 'error');
    }
  };

  const handleTestExecution = async () => {
    try {
      setIsExecuting(true);
      const payload = JSON.parse(testPayload);
      if (!activeFunction) throw new Error('Selecione uma função.');
      if (isRealMode) {
        const started = performance.now();
        const response = await realFunctionsService.invokeFunction(activeFunction.id, payload);
        const duration = Math.round(performance.now() - started);
        const metrics = await realFunctionsService.getMetrics(activeFunction.id).catch(() => null);
        setTestResult({
          status: 200,
          duration: `${duration}ms`,
          billedDuration: metrics ? `${Math.round(metrics.avgDurationMs)}ms avg` : 'runtime real',
          memoryUsed: activeFunction.memory,
          response
        });
        await loadFunctions();
        showToast('Função executada', 'Resposta recebida do executor isolado real.', 'success');
      } else {
        await new Promise((resolve) => setTimeout(resolve, 350));
        setTestResult({
          status: 200,
          duration: '38ms',
          billedDuration: '100ms',
          memoryUsed: '64 MB / 512 MB',
          response: { success: true, executionId: `exec_${Math.random().toString(36).substring(2, 9)}`, message: `Função '${activeFunction.name}' executada no mock.` }
        });
        showToast('Função Executada', 'Resposta simulada HTTP 200 recebida.', 'success');
      }
    } catch (err) {
      showToast('Falha na execução', err instanceof Error ? err.message : 'Payload inválido ou executor indisponível.', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const saveFunctionCode = async (newCode: string) => {
    if (!activeFunction) return;
    activeFunction.code = newCode;
    if (!isRealMode) {
      showToast('Código salvo', 'Alteração mantida apenas no mock.', 'success');
      return;
    }
    try {
      const response = await fetch(`/api/functions/${encodeURIComponent(activeFunction.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || `Falha ao versionar função (${response.status}).`);
      }
      await realFunctionsService.deployFunction(activeFunction.id);
      await loadFunctions();
      showToast('Código publicado', 'Nova versão persistida e implantada no executor real.', 'success');
    } catch (error) {
      showToast('Falha ao salvar função', error instanceof Error ? error.message : undefined, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="Funções Serverless (Edge)"
        subtitle={isRealMode ? 'Crie, versione, faça deploy e invoque Functions no executor isolado do runtime local.' : 'Escreva e execute lógica de backend em modo simulado.'}
        badge={
          <Badge variant={isRealMode ? 'success' : 'purple'} dot>
            {isRealMode ? 'Executor isolado • REAL' : 'V8 Isolate Engine • mock'}
          </Badge>
        }
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setIsNewFuncModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Nova Função
          </Button>
        }
      />

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Functions List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Funções ({functions.length})
                </h3>
              </div>
            </div>

            <div className="space-y-1.5">
              {functions.map((fn) => {
                const isActive = fn.id === activeFuncId;
                return (
                  <button
                    key={fn.id}
                    onClick={() => {
                      setActiveFuncId(fn.id);
                      setTestResult(null);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs transition-all ${
                      isActive
                        ? 'bg-[#1677FF] text-white shadow-lg shadow-[#1677FF]/25 font-bold'
                        : 'text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold truncate">{fn.name}()</div>
                      <div className={`text-[10px] mt-0.5 truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                        {fn.runtime} • {fn.avgDuration}
                      </div>
                    </div>
                    <Badge variant={isActive ? 'outline' : 'success'} size="sm" dot>
                      Ativa
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Function Metadata */}
          {activeFunction && (
            <div className="p-4 rounded-2xl bg-[#0B1628]/40 border border-white/[0.06] text-xs space-y-2.5">
              <div className="font-bold text-slate-300">Configuração de Execução</div>
              <div className="flex justify-between text-slate-400">
                <span>Memória Alocada:</span>
                <span className="font-mono text-cyan-300">{activeFunction.memory}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Timeout Máximo:</span>
                <span className="font-mono text-slate-200">{activeFunction.timeout}s</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total Execuções:</span>
                <span className="font-mono text-emerald-400">{activeFunction.executionsCount}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Taxa de Erro:</span>
                <span className="font-mono text-slate-200">{activeFunction.errorRate}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Code Editor & Test Console */}
        <div className="lg:col-span-3 space-y-6">
          {activeFunction && (
            <>
              {/* Function Code Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-100">
                      Código Fonte • <span className="font-mono text-cyan-400">{activeFunction.name}</span>
                    </h3>
                    <Badge variant="cyan" size="sm">
                      {activeFunction.runtime}
                    </Badge>
                  </div>
                </div>

                <CodeEditorMock
                  key={activeFunction.id}
                  initialCode={activeFunction.code}
                  language={activeFunction.runtime.includes('Python') ? 'python' : 'typescript'}
                  height="h-72"
                  onSave={(newCode) => { void saveFunctionCode(newCode); }}
                />
              </div>

              {/* Interactive Test & Output Console */}
              <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Console de Teste & Execução HTTP
                    </h4>
                  </div>

                  <Button
                    variant="gradient"
                    size="sm"
                    onClick={handleTestExecution}
                    isLoading={isExecuting}
                    leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                  >
                    Executar Teste
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Request Payload JSON */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-400">
                      Corpo da Requisição (req.body)
                    </label>
                    <textarea
                      value={testPayload}
                      onChange={(e) => setTestPayload(e.target.value)}
                      className="w-full h-44 p-3 rounded-xl bg-[#020617] border border-white/10 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-400 resize-none selection:bg-cyan-500/30 leading-relaxed"
                      spellCheck={false}
                    />
                  </div>

                  {/* Execution Response Inspector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-400">
                        Resposta da Execução (res.json)
                      </label>
                      {testResult && (
                        <div className="flex items-center gap-2 text-[11px]">
                          <Badge variant="success" size="sm">
                            {testResult.status} OK
                          </Badge>
                          <span className="text-cyan-400 font-mono">{testResult.duration}</span>
                        </div>
                      )}
                    </div>

                    <div className="w-full h-44 p-3 rounded-xl bg-[#020617] border border-white/10 text-emerald-300 font-mono text-xs overflow-auto leading-relaxed">
                      {testResult ? (
                        <pre>{JSON.stringify(testResult.response, null, 2)}</pre>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">
                          Clique em &quot;Executar Teste&quot; para disparar a função e ver a resposta.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: New Function */}
      <Modal
        isOpen={isNewFuncModalOpen}
        onClose={() => setIsNewFuncModalOpen(false)}
        title="Criar Função Serverless"
        subtitle={isRealMode ? "A função será persistida no PostgreSQL e implantada no executor isolado local." : "Criação simulada no navegador."}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsNewFuncModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleCreateFunction}
              disabled={!newFuncName.trim()}
            >
              Criar e Editar
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateFunction} className="space-y-4">
          <Input
            label="Nome da Função (Handler)"
            placeholder="ex: syncOrder, processStripeWebhook"
            value={newFuncName}
            onChange={(e) => setNewFuncName(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Descrição (Opcional)"
            placeholder="ex: Executa pós-venda e dispara e-mail transacional"
            value={newFuncDesc}
            onChange={(e) => setNewFuncDesc(e.target.value)}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Runtime de Execução</label>
            <select
              value={newFuncRuntime}
              onChange={(e) => setNewFuncRuntime(e.target.value)}
              className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
            >
              <option value="Node.js 20 (TypeScript)">Node.js 20 (TypeScript) - Recomendado</option>
              <option value="Node.js 20 (JavaScript)">Node.js 20 (JavaScript)</option>
              <option value="Python 3.11">Python 3.11</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  );
};
