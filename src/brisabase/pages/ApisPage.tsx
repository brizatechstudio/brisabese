import React, { useEffect, useState } from 'react';
import { apisService } from '../services';
import { ApiEndpoint, ApiKeyItem, WebhookDeliveryItem, WebhookItem } from '../types';
import { ApiKeyModal } from '../components/apis/ApiKeyModal';
import { WebhookTesterModal } from '../components/apis/WebhookTesterModal';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  Webhook,
  Key,
  Globe,
  Code2,
  Plus,
  Send,
  Trash2,
  Copy,
  Check,
  Play,
  Terminal,
  Shield,
  Database,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';

export const ApisPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explorer' | 'settings' | 'keys' | 'webhooks'>('explorer');

  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryItem[]>([]);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState<WebhookItem | null>(null);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState('database.*,storage.*,realtime.broadcast');

  // Explorer state
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [method, setMethod] = useState<'GET' | 'POST' | 'PATCH' | 'DELETE'>('GET');
  const [selectParam, setSelectParam] = useState<string>('*');
  const [orderParam, setOrderParam] = useState<string>('id.asc');
  const [limitParam, setLimitParam] = useState<number>(10);
  const [filterKey, setFilterKey] = useState<string>('');
  const [filterOp, setFilterOp] = useState<string>('eq');
  const [filterVal, setFilterVal] = useState<string>('');
  const [requestBody, setRequestBody] = useState<string>('{}');
  const [selectedAuthType, setSelectedAuthType] = useState<'anon' | 'secret' | 'service'>('anon');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [explorerResponse, setExplorerResponse] = useState<any | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Table settings
  const [selectedSettingTable, setSelectedSettingTable] = useState<string>('');
  const [tableApiPerms, setTableApiPerms] = useState({
    apiEnabled: true,
    publicRead: true,
    publicInsert: false,
    authenticatedRead: true,
    authenticatedInsert: true,
    authenticatedUpdate: true,
    authenticatedDelete: true,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const epList = await apisService.listEndpoints();
      setEndpoints(epList || []);

      const tables = Array.from(new Set((epList || []).map((e) => e.path.replace('/rest/v1/', '').split('/')[0]).filter(Boolean).filter((t) => t !== ':table')));
      setAvailableTables(tables);
      if (tables.length > 0) {
        setSelectedTable((prev) => (prev && tables.includes(prev) ? prev : tables[0]));
        setSelectedSettingTable((prev) => (prev && tables.includes(prev) ? prev : tables[0]));
      } else {
        setSelectedTable('');
        setSelectedSettingTable('');
      }

      const keys = await apisService.listApiKeys();
      setApiKeys(keys || []);

      if (apisService.supportsWebhooks) {
        const [w, deliveries] = await Promise.all([apisService.listWebhooks(), apisService.listWebhookDeliveries()]);
        setWebhooks(w || []);
        setWebhookDeliveries(deliveries || []);
      } else {
        setWebhooks([]);
        setWebhookDeliveries([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateApiKey = async (name: string, type: 'public' | 'secret' | 'service') => {
    const k = await apisService.createApiKey(name, type);
    await loadData();
    return k;
  };

  const handleRevokeApiKey = async (id: string) => {
    await apisService.revokeApiKey(id);
    await loadData();
  };

  const handleTestWebhook = async (id: string) => {
    const r = await apisService.testWebhook(id);
    await loadData();
    return r;
  };

  const handleCreateWebhook = async () => {
    if (!webhookName.trim() || !webhookUrl.trim()) return;
    setLoading(true); setError(null);
    try {
      const created = await apisService.createWebhook(webhookName.trim(), webhookUrl.trim(), webhookEvents.split(',').map((value)=>value.trim()).filter(Boolean));
      setNewWebhookSecret(created.secret || null);
      setWebhookName(''); setWebhookUrl(''); setWebhookEvents('database.*,storage.*,realtime.broadcast'); setShowWebhookForm(false);
      await loadData();
    } catch (err:any) { setError(err?.message || 'Falha ao criar webhook.'); } finally { setLoading(false); }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!window.confirm('Excluir este webhook e seu histórico de entregas?')) return;
    await apisService.deleteWebhook(id);
    await loadData();
  };


  const handleReplayDelivery = async (id: string) => {
    setLoading(true); setError(null);
    try { await apisService.replayWebhookDelivery(id); await loadData(); }
    catch (err:any) { setError(err?.message || 'Falha ao repetir entrega.'); }
    finally { setLoading(false); }
  };

  const handleRotateWebhookSecret = async (id: string) => {
    if (!window.confirm('Rotacionar o segredo invalida imediatamente a assinatura anterior. Continuar?')) return;
    setLoading(true); setError(null);
    try { setNewWebhookSecret(await apisService.rotateWebhookSecret(id)); }
    catch (err:any) { setError(err?.message || 'Falha ao rotacionar segredo.'); }
    finally { setLoading(false); }
  };

  const buildQueryString = () => {
    const parts: string[] = [];
    if (selectParam && selectParam !== '*') parts.push(`select=${encodeURIComponent(selectParam)}`);
    if (orderParam) parts.push(`order=${orderParam}`);
    if (limitParam) parts.push(`limit=${limitParam}`);
    if (filterKey && filterVal) parts.push(`${filterKey}=${filterOp}.${filterVal}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  };

  const fullEndpointUrl = `/rest/v1/${selectedTable}${method === 'GET' || method === 'POST' ? '' : '/1'}${buildQueryString()}`;

  const handleExecuteRequest = async () => {
    setIsExecuting(true);
    setExplorerResponse(null);
    if (!selectedTable) {
      setExplorerResponse({ statusCode: 400, statusText: 'Bad Request', durationMs: 0, headers: {}, data: { error: 'Nenhuma tabela selecionada.' } });
      setIsExecuting(false);
      return;
    }

    const pub = apiKeys.find((k) => k.type === 'public')?.keyPrefix;
    const sec = apiKeys.find((k) => k.type === 'secret')?.keyPrefix;
    const srv = apiKeys.find((k) => k.type === 'service')?.keyPrefix;

    const key = selectedAuthType === 'anon' ? pub : selectedAuthType === 'secret' ? sec : srv;
    if (!key) {
      setExplorerResponse({ statusCode: 400, statusText: 'Bad Request', durationMs: 0, headers: {}, data: { error: 'Nenhuma API key disponível para o tipo selecionado.' } });
      setIsExecuting(false);
      return;
    }

    let body: any = undefined;
    if (['POST', 'PATCH', 'PUT'].includes(method)) {
      try {
        body = JSON.parse(requestBody || '{}');
      } catch (e) {
        setExplorerResponse({ statusCode: 400, statusText: 'Bad Request', durationMs: 0, headers: {}, data: { error: { code: 'INVALID_JSON', message: 'JSON inválido.' } } });
        setIsExecuting(false);
        return;
      }
    }

    const res = await apisService.executeApiExplorerRequest({ method, endpoint: fullEndpointUrl, headers: { apikey: key }, body });
    setExplorerResponse(res);
    setIsExecuting(false);
  };

  const getCurlSnippet = () => {
    const q = buildQueryString();
    const keyStub = selectedAuthType === 'anon' ? 'bb_pub_...' : selectedAuthType === 'secret' ? 'bb_sec_...' : 'bb_srv_...';
    let s = `curl -X ${method} "https://api.brisabase.dev/rest/v1/${selectedTable}${q}" \\
  -H "apikey: ${keyStub}" \\
  -H "Content-Type: application/json"`;
    if (['POST', 'PATCH'].includes(method)) s += ` \\
  -d '${(requestBody || '').replace(/\n/g, '')}'`;
    return s;
  };

  const getSdkSnippet = () => {
    const table = selectedTable || '<table>';
    if (method === 'GET') {
      return `import { BrisaBaseClient } from '@brisabase/js';\n\nconst client = new BrisaBaseClient({ url: 'https://api.brisabase.dev', apiKey: 'bb_pub_...' });\n\nconst { data, error } = await client.from('${table}').select('${selectParam}').order('${orderParam.split('.')[0]}', { ascending: ${orderParam.endsWith('.asc')} }).limit(${limitParam}).get();`;
    }
    if (method === 'POST') {
      return `import { BrisaBaseClient } from '@brisabase/js';\n\nconst client = new BrisaBaseClient({ url: 'https://api.brisabase.dev', apiKey: 'bb_pub_...' });\n\nconst { data, error } = await client.from('${table}').insert(${(requestBody || '{}').replace(/\n/g, ' ')});`;
    }
    return `import { BrisaBaseClient } from '@brisabase/js';\n\nconst client = new BrisaBaseClient({ url: 'https://api.brisabase.dev', apiKey: 'bb_pub_...' });\n\nconst { data, error } = await client.from('${table}').update(${(requestBody || '{}').replace(/\n/g, ' ')}, 'record_id');`;
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(type);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-400" />
            API Engine & API Explorer Engine Real
          </h1>
          <p className="text-xs text-slate-400 mt-1">API REST automática com filtro, ordenação, paginação, expansão de relacionamentos e API Keys isoladas.</p>
        </div>
        <button onClick={() => setIsKeyModalOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-lg shadow-purple-900/40 transition-all">
          <Plus className="w-4 h-4" />
          Nova API Key
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-800 text-xs font-medium overflow-x-auto">
        {[{ id: 'explorer', label: 'API Explorer Interactive Sandbox', icon: Terminal }, { id: 'settings', label: 'Configurações de Acesso da Tabela', icon: SlidersHorizontal }, { id: 'keys', label: 'Chaves de API (Keys)', icon: Key }, ...(apisService.supportsWebhooks ? [{ id: 'webhooks', label: 'Webhooks & Gateways', icon: Webhook }] : [])].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl border-t border-x transition-all shrink-0 ${isActive ? 'border-purple-500/50 bg-slate-900 text-white font-semibold shadow-lg' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'}`}>
              <Icon className="w-4 h-4 text-purple-400" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'explorer' && (
        <div className="space-y-6">
          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl animate-pulse">
              <div className="h-5 w-48 rounded-full bg-slate-800" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-20 rounded-2xl bg-slate-800" />
                <div className="h-20 rounded-2xl bg-slate-800" />
              </div>
              <div className="h-40 rounded-2xl bg-slate-800" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-600/30 bg-rose-500/5 p-5 text-sm text-rose-200 shadow-xl">
              <div className="font-semibold text-rose-100 mb-2">Erro ao carregar o API Explorer</div>
              <p>{error}</p>
              <button onClick={loadData} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors">Recarregar dados</button>
            </div>
          ) : availableTables.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300 shadow-xl">
              <div className="font-semibold text-slate-100 mb-2">Nenhum endpoint de API encontrado</div>
              <p>O modo API está ativo, mas a API não retornou tabelas para construir o explorer.</p>
            </div>
          ) : (
            <div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <Database className="w-4 h-4 text-purple-400" />
                    <span>Tabela Alvo:</span>
                    <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)} disabled={availableTables.length === 0} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-purple-300 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60">
                      {availableTables.length > 0 ? availableTables.map((t) => (<option key={t} value={t}>{t}</option>)) : (<option value="" disabled>Nenhuma tabela disponível</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-semibold">Credencial de Auth:</span>
                    <select value={selectedAuthType} onChange={(e) => setSelectedAuthType(e.target.value as any)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-purple-500 focus:outline-none">
                      <option value="anon">Anon Key (bb_pub_...)</option>
                      <option value="secret">Secret Key (bb_sec_...)</option>
                      <option value="service">Service Key (bb_srv_...)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-stretch gap-2">
                  <select value={method} onChange={(e) => setMethod(e.target.value as any)} className={`rounded-xl px-3 py-2 text-xs font-bold border focus:outline-none ${method === 'GET' ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50' : method === 'POST' ? 'bg-blue-950/80 text-blue-400 border-blue-800/50' : method === 'PATCH' ? 'bg-amber-950/80 text-amber-400 border-amber-800/50' : 'bg-rose-950/80 text-rose-400 border-rose-800/50'}`}>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>

                  <div className="flex-1 flex items-center px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-purple-300 overflow-x-auto">
                    <span className="text-slate-500 select-none mr-1">https://api.brisabase.dev</span>
                    <span>{fullEndpointUrl}</span>
                  </div>

                  <button onClick={handleExecuteRequest} disabled={isExecuting || !selectedTable} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow-lg shadow-purple-900/40 transition-all disabled:opacity-50 shrink-0">
                    {isExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    <span>Executar Request</span>
                  </button>
                </div>

                {method === 'GET' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs border-t border-slate-800/60">
                    <div className="space-y-1">
                      <label className="text-slate-400 font-semibold">Select Fields (?select=)</label>
                      <input type="text" value={selectParam} onChange={(e) => setSelectParam(e.target.value)} placeholder="id,name,price" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-200 focus:border-purple-500 focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 font-semibold">Order (?order=)</label>
                      <input type="text" value={orderParam} onChange={(e) => setOrderParam(e.target.value)} placeholder="price.desc" className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-200 focus:border-purple-500 focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 font-semibold">Limit (?limit=)</label>
                      <input type="number" value={limitParam} onChange={(e) => setLimitParam(parseInt(e.target.value) || 10)} className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-slate-200 focus:border-purple-500 focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 font-semibold">Filtro Rápido (?campo=op.val)</label>
                      <div className="flex gap-1">
                        <input type="text" value={filterKey} onChange={(e) => setFilterKey(e.target.value)} placeholder="price" className="w-1/3 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 font-mono text-slate-200 focus:border-purple-500 focus:outline-none" />
                        <select value={filterOp} onChange={(e) => setFilterOp(e.target.value)} className="w-1/3 rounded-lg border border-slate-800 bg-slate-950 px-1 py-1.5 font-mono text-slate-200 focus:border-purple-500 focus:outline-none"><option value="eq">eq</option><option value="gt">gt</option><option value="lt">lt</option><option value="ilike">ilike</option><option value="in">in</option></select>
                        <input type="text" value={filterVal} onChange={(e) => setFilterVal(e.target.value)} placeholder="100" className="w-1/3 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 font-mono text-slate-200 focus:border-purple-500 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                )}

                {['POST', 'PATCH'].includes(method) && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                    <label className="text-xs text-slate-400 font-semibold">Corpo da Requisiçāo (JSON Payload)</label>
                    <textarea rows={4} value={requestBody} onChange={(e) => setRequestBody(e.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-purple-500 focus:outline-none" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2"><Terminal className="w-4 h-4 text-purple-400" />Resposta do Servidor (HTTP Outcome)</h3>
                    {explorerResponse && (<div className="flex items-center gap-2 font-mono text-xs"><span className={`px-2 py-0.5 rounded font-bold ${explorerResponse.statusCode >= 200 && explorerResponse.statusCode < 300 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>{explorerResponse.statusCode} {explorerResponse.statusText}</span><span className="text-slate-400">{explorerResponse.durationMs}ms</span></div>)}
                  </div>
                  {!explorerResponse ? (<div className="p-8 text-center text-xs text-slate-500 font-mono space-y-2 border border-dashed border-slate-800 rounded-xl bg-slate-950/40"><Play className="w-6 h-6 mx-auto text-slate-600" /><p>Clique em "Executar Request" para disparar a chamada real contra a API.</p></div>) : (<div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs overflow-x-auto max-h-[350px]"><pre className="text-emerald-400 leading-relaxed">{JSON.stringify(explorerResponse.data, null, 2)}</pre></div>)}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3"><h3 className="text-xs font-bold text-slate-200 flex items-center gap-2"><Code2 className="w-4 h-4 text-purple-400" />Geradores de Código de Integração</h3></div>
                  <div className="space-y-4">
                    <div className="space-y-1"><div className="flex items-center justify-between text-[11px] font-semibold text-slate-400"><span>cURL Command</span><button onClick={() => copyToClipboard(getCurlSnippet(), 'curl')} className="flex items-center gap-1 text-purple-400 hover:text-purple-300">{copiedSnippet === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}<span>Copiar</span></button></div><pre className="p-2.5 rounded-xl border border-slate-800 bg-slate-950 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">{getCurlSnippet()}</pre></div>
                    <div className="space-y-1"><div className="flex items-center justify-between text-[11px] font-semibold text-slate-400"><span>TypeScript SDK (BrisaBaseClient)</span><button onClick={() => copyToClipboard(getSdkSnippet(), 'sdk')} className="flex items-center gap-1 text-purple-400 hover:text-purple-300">{copiedSnippet === 'sdk' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}<span>Copiar</span></button></div><pre className="p-2.5 rounded-xl border border-slate-800 bg-slate-950 text-[11px] font-mono text-purple-300 overflow-x-auto whitespace-pre-wrap">{getSdkSnippet()}</pre></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Shield className="w-4 h-4 text-purple-400" />Permissões & Acesso de Tabela via API REST</h3>
              <p className="text-xs text-slate-400 mt-0.5">Configure se a API REST está ativa para cada tabela e controle os acessos anônimos e autenticados.</p>
            </div>
            <div className="flex items-center gap-2 text-xs"><span className="text-slate-400 font-semibold">Tabela:</span><select value={selectedSettingTable} onChange={(e) => setSelectedSettingTable(e.target.value)} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-purple-300 focus:border-purple-500 focus:outline-none">{availableTables.map((t) => (<option key={t} value={t}>{t}</option>))}</select></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-between"><div><span className="text-xs font-bold text-slate-100">API REST Ativa para esta Tabela</span><p className="text-[11px] text-slate-400 mt-0.5">Quando desativado, requisições HTTP retornam 403 Forbidden.</p></div><input type="checkbox" checked={tableApiPerms.apiEnabled} onChange={(e) => setTableApiPerms({ ...tableApiPerms, apiEnabled: e.target.checked })} className="w-5 h-5 accent-purple-600 rounded cursor-pointer" /></div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 space-y-3"><span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Acesso Público / Anônimo (Anon Key)</span><div className="space-y-2 text-xs"><label className="flex items-center justify-between text-slate-300 cursor-pointer"><span>Permitir Leitura Pública (GET)</span><input type="checkbox" checked={tableApiPerms.publicRead} onChange={(e) => setTableApiPerms({ ...tableApiPerms, publicRead: e.target.checked })} className="w-4 h-4 accent-purple-600 rounded" /></label><label className="flex items-center justify-between text-slate-300 cursor-pointer"><span>Permitir Inserçāo Pública (POST)</span><input type="checkbox" checked={tableApiPerms.publicInsert} onChange={(e) => setTableApiPerms({ ...tableApiPerms, publicInsert: e.target.checked })} className="w-4 h-4 accent-purple-600 rounded" /></label></div></div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 space-y-3 md:col-span-2"><span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Acesso Autenticado (Secret Key & Bearer JWT)</span><div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs"><label className="flex items-center justify-between text-slate-300 cursor-pointer p-2 rounded bg-slate-900 border border-slate-800"><span>Leitura (GET)</span><input type="checkbox" checked={tableApiPerms.authenticatedRead} onChange={(e) => setTableApiPerms({ ...tableApiPerms, authenticatedRead: e.target.checked })} className="w-4 h-4 accent-purple-600 rounded" /></label><label className="flex items-center justify-between text-slate-300 cursor-pointer p-2 rounded bg-slate-900 border border-slate-800"><span>Inserçāo (POST)</span><input type="checkbox" checked={tableApiPerms.authenticatedInsert} onChange={(e) => setTableApiPerms({ ...tableApiPerms, authenticatedInsert: e.target.checked })} className="w-4 h-4 accent-purple-600 rounded" /></label><label className="flex items-center justify-between text-slate-300 cursor-pointer p-2 rounded bg-slate-900 border border-slate-800"><span>Ediçāo (PATCH)</span><input type="checkbox" checked={tableApiPerms.authenticatedUpdate} onChange={(e) => setTableApiPerms({ ...tableApiPerms, authenticatedUpdate: e.target.checked })} className="w-4 h-4 accent-purple-600 rounded" /></label><label className="flex items-center justify-between text-slate-300 cursor-pointer p-2 rounded bg-slate-900 border border-slate-800"><span>Exclusāo (DELETE)</span><input type="checkbox" checked={tableApiPerms.authenticatedDelete} onChange={(e) => setTableApiPerms({ ...tableApiPerms, authenticatedDelete: e.target.checked })} className="w-4 h-4 accent-purple-600 rounded" /></label></div></div>
          </div>
        </div>
      )}

      {activeTab === 'keys' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
                  <th className="px-4 py-3 font-semibold">Nome da Chave</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Prefix Key</th>
                  <th className="px-4 py-3 font-semibold">Criada em</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {apiKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-200 font-bold font-sans">{k.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className="text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/30 uppercase text-[10px]">{k.type}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400">{k.keyPrefix}...</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{k.createdAt}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={k.status || 'inactive'} /></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-sans">{k.status === 'active' && (<button onClick={() => handleRevokeApiKey(k.id)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors" title="Revogar Chave"><Trash2 className="w-4 h-4" /></button>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-sm font-bold text-slate-100">Webhooks persistentes</h3><p className="text-[11px] text-slate-500">HMAC, retry/backoff, dead-letter e replay no runtime real.</p></div>
            <button onClick={()=>setShowWebhookForm((v)=>!v)} className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500"><Plus className="w-3.5 h-3.5" />Novo webhook</button>
          </div>
          {showWebhookForm && <div className="grid md:grid-cols-3 gap-3 rounded-2xl border border-purple-500/20 bg-purple-950/20 p-4"><input value={webhookName} onChange={e=>setWebhookName(e.target.value)} placeholder="Nome" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"/><input value={webhookUrl} onChange={e=>setWebhookUrl(e.target.value)} placeholder="https://api.exemplo.com/webhook" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"/><input value={webhookEvents} onChange={e=>setWebhookEvents(e.target.value)} placeholder="database.*,storage.*" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 font-mono"/><div className="md:col-span-3 flex justify-end"><button disabled={loading||!webhookName.trim()||!webhookUrl.trim()} onClick={()=>void handleCreateWebhook()} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Criar webhook</button></div></div>}
          {newWebhookSecret && <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-amber-200">Segredo do webhook — copie agora</p><code className="text-[11px] text-amber-100 break-all">{newWebhookSecret}</code></div><button onClick={()=>{void navigator.clipboard.writeText(newWebhookSecret);setNewWebhookSecret(null);}} className="rounded-lg bg-amber-500/20 px-3 py-2 text-xs text-amber-100">Copiar e ocultar</button></div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {webhooks.map((w) => (
              <div key={w.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3 shadow-xl flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Webhook className="w-4 h-4 text-purple-400" />{w.name}</h3>
                    <StatusBadge status={w.status} />
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-purple-300 truncate">{w.targetUrl}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">{w.events.map((ev) => (<span key={ev} className="text-[10px] font-mono text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{ev}</span>))}</div>
                </div>
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between"><span className="text-[11px] text-slate-500 font-mono">Último disparo: {w.lastTriggeredAt || 'Nunca'}</span><div className="flex gap-1"><button onClick={() => setTestingWebhook(w)} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"><Send className="w-3.5 h-3.5 text-purple-400" />Testar</button><button onClick={()=>void handleRotateWebhookSecret(w.id)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700">Rotacionar segredo</button><button onClick={()=>void handleDeleteWebhook(w.id)} className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30" title="Excluir webhook"><Trash2 className="w-3.5 h-3.5"/></button></div></div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800"><h4 className="text-xs font-semibold text-slate-200">Histórico de entregas</h4><p className="text-[10px] text-slate-500">Últimas 100 entregas; falhas podem ser reenviadas manualmente.</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500 bg-slate-950/60"><tr><th className="px-4 py-2">Evento</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Tentativas</th><th className="px-4 py-2">HTTP</th><th className="px-4 py-2">Quando</th><th className="px-4 py-2"></th></tr></thead><tbody>{webhookDeliveries.map((d)=><tr key={d.id} className="border-t border-slate-800/70"><td className="px-4 py-2 font-mono text-slate-300">{d.eventType}</td><td className="px-4 py-2 text-slate-300">{d.status}</td><td className="px-4 py-2 text-slate-400">{d.attemptCount}</td><td className="px-4 py-2 text-slate-400">{d.responseStatus || '—'}</td><td className="px-4 py-2 text-slate-500">{new Date(d.createdAt).toLocaleString('pt-BR')}</td><td className="px-4 py-2 text-right">{['failed','dead_letter'].includes(d.status) && <button disabled={loading} onClick={()=>void handleReplayDelivery(d.id)} className="rounded bg-slate-800 px-2 py-1 text-[10px] text-cyan-300 hover:bg-slate-700">Replay</button>}</td></tr>)}</tbody></table></div>
          </div>
        </div>
      )}

      <ApiKeyModal isOpen={isKeyModalOpen} onClose={() => setIsKeyModalOpen(false)} onCreate={handleCreateApiKey} />
      <WebhookTesterModal webhook={testingWebhook} onClose={() => setTestingWebhook(null)} onTest={handleTestWebhook} />
    </div>
  );
};

export default ApisPage;
