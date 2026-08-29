import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Globe,
  Play,
  Copy,
  Check,
  Code,
  Lock,
  Layers,
  ArrowRight,
  Sparkles,
  Server
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { ApiService, ApiEndpoint } from '../types';
import { isRealMode, realApiService } from '../services/runtime';

export const Apis: React.FC = () => {
  const { showToast } = useApp();
  const [apis, setApis] = useState<ApiService[]>([]);
  const [activeApiId, setActiveApiId] = useState<string>('api-1');
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [loading, setLoading] = useState(true);

  // Tester State
  const [isSending, setIsSending] = useState(false);
  const [responseResult, setResponseResult] = useState<any>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

  const loadApis = async () => {
    setLoading(true);
    const data = await mockApi.getApis();
    setApis(data);
    if (data.length > 0) {
      setActiveApiId(data[0].id);
      if (data[0].endpoints.length > 0) {
        setSelectedEndpoint(data[0].endpoints[0]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadApis();
  }, []);

  const activeApi = apis.find((a) => a.id === activeApiId) || apis[0];

  const handleSelectEndpoint = (ep: ApiEndpoint) => {
    setSelectedEndpoint(ep);
    setResponseResult(null);
  };

  const handleSendRequest = async () => {
    if (!selectedEndpoint || !activeApi) return;
    setIsSending(true);
    try {
      if (isRealMode) {
        const result = await realApiService.executeApiExplorerRequest({
          method: selectedEndpoint.method,
          endpoint: selectedEndpoint.path,
          headers: apiKeyInput.trim() ? { apikey: apiKeyInput.trim() } : {},
          body: ['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) ? selectedEndpoint.mockResponse : undefined
        });
        setResponseResult({
          status: result.statusCode,
          statusText: result.statusText,
          time: `${result.durationMs}ms`,
          size: '—',
          headers: result.headers,
          body: result.data
        });
        showToast(`Requisição ${result.statusCode} ${result.statusText}`, result.statusCode < 400 ? 'Resposta recebida da API real.' : 'A API real retornou um erro.', result.statusCode < 400 ? 'success' : 'error');
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        setResponseResult({
          status: 200,
          statusText: 'OK',
          time: '32ms',
          size: '1.4 KB',
          headers: { 'content-type': 'application/json; charset=utf-8', 'x-brisabase-cache': 'HIT-MOCK' },
          body: selectedEndpoint.mockResponse
        });
        showToast('Requisição 200 OK', 'Resposta simulada retornada pelo mock.', 'success');
      }
    } catch (error) {
      showToast('Falha na requisição', error instanceof Error ? error.message : 'Erro ao executar a requisição.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyCurl = () => {
    if (!selectedEndpoint || !activeApi) return;
    const curl = `curl -X ${selectedEndpoint.method} "${activeApi.baseUrl}${selectedEndpoint.path}" \\
  -H "apikey: ${apiKeyInput.trim() || '<project-api-key>'}" \\
  -H "Content-Type: application/json"`;
    navigator.clipboard.writeText(curl);
    setCopiedCurl(true);
    showToast('cURL copiado!', 'Comando pronto para o terminal', 'info');
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const getMethodBadgeVariant = (m: string) => {
    switch (m) {
      case 'GET':
        return 'success';
      case 'POST':
        return 'primary';
      case 'PUT':
      case 'PATCH':
        return 'warning';
      case 'DELETE':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PageHeader
        title="APIs & Endpoints Gerenciados"
        subtitle="Gateway de APIs REST e GraphQL geradas automaticamente a partir das coleções com controle de taxa e cache."
        badge={
          <Badge variant="cyan" dot>
            API Gateway v2.1
          </Badge>
        }
      />

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: APIs & Endpoints List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-4 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Serviços de API ({apis.length})
              </h3>
            </div>

            <div className="space-y-3">
              {apis.map((api) => {
                const isActiveApi = api.id === activeApiId;
                return (
                  <div key={api.id} className="space-y-1.5">
                    <button
                      onClick={() => {
                        setActiveApiId(api.id);
                        if (api.endpoints.length > 0) setSelectedEndpoint(api.endpoints[0]);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all ${
                        isActiveApi
                          ? 'bg-[#1677FF]/20 text-cyan-300 font-bold border border-[#1677FF]/40'
                          : 'text-slate-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="truncate">{api.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{api.latency}</span>
                    </button>

                    {/* Endpoints sub-list */}
                    {isActiveApi && (
                      <div className="pl-2 space-y-1">
                        {api.endpoints.map((ep) => {
                          const isEpSelected = selectedEndpoint?.id === ep.id;
                          return (
                            <button
                              key={ep.id}
                              onClick={() => handleSelectEndpoint(ep)}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                                isEpSelected
                                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                              }`}
                            >
                              <Badge variant={getMethodBadgeVariant(ep.method) as any} size="sm">
                                {ep.method}
                              </Badge>
                              <span className="font-mono text-[11px] truncate">{ep.path}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Endpoint Inspector & Live Tester */}
        <div className="lg:col-span-3 space-y-6">
          {selectedEndpoint && activeApi && (
            <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-5">
              {/* Endpoint Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <Badge variant={getMethodBadgeVariant(selectedEndpoint.method) as any}>
                    {selectedEndpoint.method}
                  </Badge>
                  <div className="font-mono text-sm font-bold text-slate-100 truncate">
                    {activeApi.baseUrl}
                    <span className="text-cyan-400">{selectedEndpoint.path}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCurl}
                    leftIcon={copiedCurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  >
                    {copiedCurl ? 'Copiado!' : 'Copiar cURL'}
                  </Button>
                  <Button
                    variant="gradient"
                    size="sm"
                    onClick={handleSendRequest}
                    isLoading={isSending}
                    leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
                  >
                    Enviar Requisição
                  </Button>
                </div>
              </div>

              {isRealMode && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-2">API key do projeto para testar o Data API</label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(event) => setApiKeyInput(event.target.value)}
                    placeholder="bb_pub_..., bb_sec_... ou bb_srv_..."
                    autoComplete="off"
                    className="w-full rounded-xl border border-white/10 bg-[#020617] px-3 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-cyan-400"
                  />
                  <p className="mt-2 text-[11px] text-slate-500">A chave fica apenas no estado desta tela e não é persistida pelo BrisaBase.</p>
                </div>
              )}

              {/* Endpoint Description */}
              <p className="text-xs text-slate-400 leading-relaxed">{selectedEndpoint.description}</p>

              {/* Headers Simulator */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Headers de Autenticação
                </div>
                <div className="p-3 rounded-xl bg-[#0B1628] border border-white/[0.06] font-mono text-xs text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">apikey:</span>
                    <span className="text-cyan-300">{isRealMode ? (apiKeyInput ? "••••••••••••" : "&lt;project-api-key&gt;") : "brisa_pk_mock_••••"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Content-Type:</span>
                    <span className="text-slate-300">application/json</span>
                  </div>
                </div>
              </div>

              {/* Response Inspector */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Resposta do Gateway
                  </div>
                  {responseResult && (
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <Badge variant="success" size="sm">
                        {responseResult.status} {responseResult.statusText}
                      </Badge>
                      <span className="text-cyan-400">{responseResult.time}</span>
                      <span className="text-slate-500">• {responseResult.size}</span>
                    </div>
                  )}
                </div>

                <div className="h-64 p-4 rounded-xl bg-[#020617] border border-white/10 font-mono text-xs overflow-auto">
                  {responseResult ? (
                    <pre className="text-emerald-300 leading-relaxed">
                      {JSON.stringify(responseResult.body, null, 2)}
                    </pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-600 italic">
                      Clique em &quot;Enviar Requisição&quot; para testar a resposta do endpoint ao vivo.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
