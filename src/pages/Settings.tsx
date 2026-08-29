import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PageHeader } from '../components/common/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import {
  Settings as SettingsIcon,
  Key,
  Webhook,
  Sliders,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  Save,
  Send,
  Languages,
  Globe2
} from 'lucide-react';
import { mockApi } from '../services/mockApi';
import { ApiKeyItem, WebhookItem } from '../types';
import { isRealMode } from '../services/runtime';

export const Settings: React.FC = () => {
  const { activeProject, refreshProjects, showToast, language, setLanguage } = useApp();
  const isEnglish = language === 'en-US';
  const [activeTab, setActiveTab] = useState('general');

  // General Settings Form
  const [name, setName] = useState(activeProject?.name || 'BrisaStore');
  const [desc, setDesc] = useState(activeProject?.description || '');
  const [region, setRegion] = useState(activeProject?.region || 'sa-east-1 (São Paulo)');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // API Keys Tab State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [isNewKeyModalOpen, setIsNewKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyRole, setNewKeyRole] = useState<'Read' | 'Write' | 'Admin'>('Read');
  const [visibleKeyId, setVisibleKeyId] = useState<string | null>(null);

  // Webhooks Tab State
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [isNewWebhookModalOpen, setIsNewWebhookModalOpen] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookEvent, setWebhookEvent] = useState('auth.user.created');
  const [webhookUrl, setWebhookUrl] = useState('');

  // Environment Variables State
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>(isRealMode ? [] : [
    { key: 'BRISA_ENV', value: 'production' },
    { key: 'STRIPE_SECRET_KEY', value: 'sk_live_demo' },
    { key: 'SENDGRID_API_KEY', value: 'SG.demo' }
  ]);

  useEffect(() => {
    if (activeProject) {
      setName(activeProject.name);
      setDesc(activeProject.description || '');
      setRegion(activeProject.region);
    }
    mockApi.getApiKeys().then(setApiKeys).catch((error) => showToast('Chaves de API', error instanceof Error ? error.message : 'Falha ao carregar chaves.', 'error'));
    if (isRealMode && activeProject) {
      const environmentId = activeProject.environmentId || localStorage.getItem('brisabase.environmentId') || '';
      const query = environmentId ? `?environment_id=${encodeURIComponent(environmentId)}` : '';
      fetch(`/api/projects/${activeProject.id}/settings${query}`)
        .then(async (response) => {
          const payload = await response.json().catch(() => []);
          if (!response.ok) throw new Error(payload?.error?.message || (isEnglish ? 'Failed to load project settings.' : 'Falha ao carregar configurações do projeto.'));
          return payload;
        })
        .then((settings) => setEnvVars((Array.isArray(settings) ? settings : []).map((item: any) => ({ key: item.key, value: item.value }))))
        .catch((error) => showToast(isEnglish ? 'Settings' : 'Configurações', error instanceof Error ? error.message : (isEnglish ? 'Failed to load settings.' : 'Falha ao carregar configurações.'), 'error'));
      setWebhooks([]);
    } else {
      mockApi.getWebhooks().then(setWebhooks);
    }
  }, [activeProject, showToast]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    try {
      setIsSavingGeneral(true);
      await mockApi.updateProject(activeProject.id, { name, description: desc, region });
      await refreshProjects();
      showToast(isEnglish ? 'Settings saved' : 'Configurações salvas', isEnglish ? 'Project preferences were updated.' : 'As preferências do projeto foram atualizadas', 'success');
    } catch (err) {
      showToast(isEnglish ? 'Save failed' : 'Erro ao salvar', isEnglish ? 'Please try again.' : 'Tente novamente', 'error');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    const created = await mockApi.createApiKey(newKeyName, newKeyRole);
    setApiKeys((prev) => [created, ...prev]);
    setIsNewKeyModalOpen(false);
    setNewKeyName('');
    showToast(isEnglish ? 'API key generated!' : 'Chave de API gerada!', isEnglish ? `Key '${created.name}' is active` : `Chave '${created.name}' está ativa`, 'success');
  };

  const handleRevokeKey = async (id: string, name: string) => {
    if (!window.confirm(isEnglish ? `Are you sure you want to revoke ${name}? Connected applications will lose access.` : `Tem certeza que deseja revogar a chave ${name}? Aplicações conectadas perderão acesso.`))
      return;
    await mockApi.revokeApiKey(id);
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
    showToast(isEnglish ? 'Key revoked' : 'Chave Revogada', isEnglish ? `Key ${name} was permanently removed` : `A chave ${name} foi excluída permanentemente`, 'info');
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRealMode) { showToast('Webhooks', isEnglish ? 'Persistent webhook management is not implemented in the real control plane yet.' : 'O gerenciamento persistente de webhooks ainda não está implementado no control plane real.', 'info'); return; }
    if (!webhookName.trim() || !webhookUrl.trim()) return;
    const created = await mockApi.createWebhook(webhookName, webhookEvent, webhookUrl);
    setWebhooks((prev) => [created, ...prev]);
    setIsNewWebhookModalOpen(false);
    setWebhookName('');
    setWebhookUrl('');
    showToast(isEnglish ? 'Webhook configured!' : 'Webhook configurado!', isEnglish ? `Events '${created.event}' will be sent to the URL` : `Eventos '${created.event}' serão enviados para a URL`, 'success');
  };

  const handleTestWebhook = (name: string) => {
    if (isRealMode) { showToast('Webhooks', isEnglish ? 'Synthetic webhook testing is disabled in real mode.' : 'Teste sintético desativado no modo real.', 'info'); return; }
    showToast(isEnglish ? 'Webhook tested' : 'Webhook Testado', isEnglish ? `Test ping sent to ${name} (200 OK)` : `Ping de teste enviado para ${name} (200 OK)`, 'success');
  };

  const handleSaveEnvironmentVariables = async () => {
    if (!isRealMode) {
      showToast(isEnglish ? 'Secrets saved' : 'Secrets Salvas', isEnglish ? 'Environment variables updated in mock mode.' : 'Variáveis de ambiente atualizadas no mock.', 'success');
      return;
    }
    if (!activeProject) return;
    const environmentId = activeProject.environmentId || localStorage.getItem('brisabase.environmentId') || undefined;
    try {
      for (const item of envVars) {
        if (!item.key.trim()) continue;
        const response = await fetch(`/api/projects/${activeProject.id}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: item.key.trim(), value: item.value, environment_id: environmentId })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.message || `Falha ao salvar ${item.key}.`);
      }
      showToast(isEnglish ? 'Settings saved' : 'Configurações salvas', isEnglish ? 'Variables persisted in the active environment control plane.' : 'Variáveis persistidas no control plane do ambiente ativo.', 'success');
    } catch (error) {
      showToast(isEnglish ? 'Save failed' : 'Falha ao salvar', error instanceof Error ? error.message : (isEnglish ? 'Could not persist the settings.' : 'Não foi possível persistir as configurações.'), 'error');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(isEnglish ? 'Copied!' : 'Copiado!', isEnglish ? 'Key copied to the clipboard' : 'Chave copiada para a área de transferência', 'info');
  };

  const tabs = [
    { id: 'general', label: isEnglish ? 'General & Identity' : 'Geral & Identidade', icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'keys', label: isEnglish ? 'API Keys' : 'Chaves de API', icon: <Key className="w-4 h-4" /> },
    { id: 'webhooks', label: isEnglish ? 'Webhooks & Events' : 'Webhooks & Eventos', icon: <Webhook className="w-4 h-4" /> },
    { id: 'env', label: isEnglish ? 'Environment Variables' : 'Variáveis de Ambiente', icon: <Sliders className="w-4 h-4" /> },
    { id: 'preferences', label: isEnglish ? 'Preferences' : 'Preferências', icon: <Languages className="w-4 h-4" /> }
  ].filter((tab) => !isRealMode || tab.id !== 'webhooks');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={isEnglish ? 'Project Settings' : 'Configurações do Projeto'}
        subtitle={isRealMode
          ? (isEnglish ? 'Manage access credentials, secret variables and project metadata.' : 'Gerencie credenciais de acesso, variáveis secretas e metadados do projeto.')
          : (isEnglish ? 'Manage access credentials, webhooks, secret variables and project metadata.' : 'Gerencie credenciais de acesso, webhooks, variáveis secretas e metadados do projeto.')}
        badge={
          <Badge variant="cyan" dot>
            {activeProject?.slug}
          </Badge>
        }
      />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab: General */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveGeneral}
            className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4 max-w-2xl"
          >
            <h3 className="text-sm font-bold text-slate-100 mb-2">{isEnglish ? 'Primary Information' : 'Informações Principais'}</h3>

            <Input
              label={isEnglish ? 'Project Name' : 'Nome do Projeto'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{isEnglish ? 'Description' : 'Descrição'}</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm p-3 focus:outline-none focus:border-cyan-400 resize-none h-20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {isRealMode
                  ? (isEnglish ? 'Project Region (metadata)' : 'Região do Projeto (metadado)')
                  : (isEnglish ? 'Primary Hosting Region' : 'Região Primária de Hospedagem')}
              </label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
              >
                <option value="sa-east-1 (São Paulo)">{isEnglish ? '🇧🇷 South America (São Paulo - sa-east-1)' : '🇧🇷 América do Sul (São Paulo - sa-east-1)'}</option>
                <option value="us-east-1 (N. Virginia)">🇺🇸 {isEnglish ? 'US East (N. Virginia - us-east-1)' : 'EUA Leste (N. Virginia - us-east-1)'}</option>
                <option value="eu-central-1 (Frankfurt)">🇩🇪 {isEnglish ? 'Europe (Frankfurt - eu-central-1)' : 'Europa (Frankfurt - eu-central-1)'}</option>
              </select>
            </div>

            <Button
              type="submit"
              variant="gradient"
              size="sm"
              isLoading={isSavingGeneral}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {isEnglish ? 'Save Changes' : 'Salvar Alterações'}
            </Button>
          </form>

          {/* Danger Zone */}
          <div className="p-6 rounded-2xl bg-rose-950/20 border border-rose-500/20 max-w-2xl space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{isEnglish ? 'Danger Zone' : 'Zona de Perigo'}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isEnglish ? 'Deleting this project will permanently remove its database data, storage files and credentials.' : 'Excluir este projeto removerá permanentemente os dados do banco, arquivos de Storage e credenciais.'}
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => showToast(isEnglish ? 'Action blocked' : 'Ação Bloqueada', isEnglish ? 'Protected projects cannot be deleted in production mode.' : 'Projetos protegidos não podem ser excluídos em modo produção.', 'warning')}
            >
              {isEnglish ? 'Delete this Project' : 'Excluir este Projeto'}
            </Button>
          </div>
        </div>
      )}

      {/* Tab: API Keys */}
      {activeTab === 'keys' && (
        <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-sm font-bold text-slate-100">{isEnglish ? 'Access Keys & API Tokens' : 'Chaves de Acesso e Tokens de API'}</h3>
              <p className="text-xs text-slate-400">
                {isEnglish ? 'Use public keys for Web/Mobile clients and secret keys only on servers.' : 'Utilize chaves públicas para clientes Web/Mobile e secretas apenas em servidores.'}
              </p>
            </div>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setIsNewKeyModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              {isEnglish ? 'Generate New Key' : 'Gerar Nova Chave'}
            </Button>
          </div>

          <div className="divide-y divide-white/[0.04] space-y-3">
            {apiKeys.map((key) => {
              const isVisible = visibleKeyId === key.id;
              return (
                <div key={key.id} className="pt-3 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-100">{key.name}</span>
                      <Badge variant={key.role === 'Admin' ? 'danger' : 'primary'} size="sm">
                        {key.role}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs text-cyan-300">
                      <span>{isVisible ? key.fullKey : `${key.keyPrefix}••••••••••••••••••••`}</span>
                      <button
                        onClick={() => setVisibleKeyId(isVisible ? null : key.id)}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isEnglish ? 'Created' : 'Criada em'} {key.createdAt} • {isEnglish ? 'Last used' : 'Último uso'}: {key.lastUsed}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(key.fullKey)}
                      leftIcon={<Copy className="w-3.5 h-3.5" />}
                    >
                      Copiar
                    </Button>
                    <button
                      onClick={() => handleRevokeKey(key.id, key.name)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                      title={isEnglish ? 'Revoke Key' : 'Revogar Chave'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Webhooks */}
      {activeTab === 'webhooks' && (
        <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-sm font-bold text-slate-100">{isEnglish ? 'Outbound Webhooks' : 'Webhooks de Saída (Outbound)'}</h3>
              <p className="text-xs text-slate-400">
                {isEnglish ? 'Send HTTP POST requests to your servers whenever events occur.' : 'Dispare requisições HTTP POST para seus servidores sempre que eventos ocorrerem.'}
              </p>
            </div>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setIsNewWebhookModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              {isEnglish ? 'Add Webhook' : 'Adicionar Webhook'}
            </Button>
          </div>

          <div className="divide-y divide-white/[0.04] space-y-3">
            {webhooks.map((wh) => (
              <div key={wh.id} className="pt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-100">{wh.name}</span>
                    <Badge variant="cyan" size="sm">
                      {wh.event}
                    </Badge>
                  </div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5 truncate max-w-md">
                    {wh.url}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {isEnglish ? 'Success Rate' : 'Taxa de Sucesso'}: <span className="text-emerald-400">{wh.successRate}</span> • {wh.lastDelivery}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestWebhook(wh.name)}
                    leftIcon={<Send className="w-3.5 h-3.5" />}
                  >
                    Testar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Environment Variables */}
      {activeTab === 'env' && (
        <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-5 max-w-3xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <div>
              <h3 className="text-sm font-bold text-slate-100">{isEnglish ? 'Environment Variables & Secrets' : 'Variáveis de Ambiente & Secrets'}</h3>
              <p className="text-xs text-slate-400">
                {isEnglish ? 'Injected automatically at runtime into serverless Functions.' : 'Injetadas automaticamente em tempo de execução nas Funções Serverless.'}
              </p>
            </div>
            <Button
              variant="gradient"
              size="sm"
              onClick={() => setEnvVars([...envVars, { key: 'NOVA_VAR', value: 'valor' }])}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              {isEnglish ? 'Add Variable' : 'Adicionar Variável'}
            </Button>
          </div>

          <div className="space-y-3">
            {envVars.map((v, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <input
                  type="text"
                  value={v.key}
                  onChange={(e) => {
                    const copy = [...envVars];
                    copy[idx].key = e.target.value;
                    setEnvVars(copy);
                  }}
                  placeholder="NOME_DA_CHAVE"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#020617] border border-white/10 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="password"
                  value={v.value}
                  onChange={(e) => {
                    const copy = [...envVars];
                    copy[idx].value = e.target.value;
                    setEnvVars(copy);
                  }}
                  placeholder="valor-secreto"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#020617] border border-white/10 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={() => setEnvVars(envVars.filter((_, i) => i !== idx))}
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSaveEnvironmentVariables()}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {isEnglish ? 'Save Variables' : 'Salvar Variáveis'}
          </Button>
        </div>
      )}

      {/* Modal: New API Key */}
      {/* Tab: Preferences */}
      {activeTab === 'preferences' && (
        <div className="space-y-6 max-w-2xl">
          <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 grid place-items-center text-cyan-400">
                <Languages className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">{isEnglish ? 'Interface language' : 'Idioma da interface'}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isEnglish
                    ? 'Choose the language used by the BrisaBase console. The interface preference is saved locally in the browser.'
                    : 'Escolha o idioma usado pelo console BrisaBase. A preferência de interface fica salva localmente no navegador.'}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLanguage('pt-BR')}
                className={`p-4 rounded-xl border text-left transition-all ${language === 'pt-BR' ? 'bg-[#1677FF]/10 border-[#1677FF]/60 ring-1 ring-[#1677FF]/30' : 'bg-[#0B1628] border-white/[0.08] hover:border-white/20'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-100">Português (Brasil)</div>
                    <div className="text-[11px] text-slate-400 mt-1">Português • pt-BR</div>
                  </div>
                  {language === 'pt-BR' && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLanguage('en-US')}
                className={`p-4 rounded-xl border text-left transition-all ${language === 'en-US' ? 'bg-[#1677FF]/10 border-[#1677FF]/60 ring-1 ring-[#1677FF]/30' : 'bg-[#0B1628] border-white/[0.08] hover:border-white/20'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-100">English (US)</div>
                    <div className="text-[11px] text-slate-400 mt-1">English • en-US</div>
                  </div>
                  {language === 'en-US' && <Check className="w-4 h-4 text-cyan-400" />}
                </div>
              </button>
            </div>

            <div className="rounded-xl bg-[#0B1628] border border-white/[0.08] p-4 flex items-start gap-3">
              <Globe2 className="w-4 h-4 text-cyan-400 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                {isEnglish
                  ? 'Core navigation and console preferences switch immediately. Product names such as Storage, Realtime, APIs, SDK and SQL remain consistent in both languages.'
                  : 'A navegação principal e as preferências do console mudam imediatamente. Nomes de produto como Storage, Realtime, APIs, SDK e SQL permanecem iguais nos dois idiomas.'}
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#07111F] border border-white/[0.08]">
            <div className="text-xs font-bold text-slate-100">{isEnglish ? 'Appearance' : 'Aparência'}</div>
            <div className="mt-3 flex items-center justify-between gap-4 p-3 rounded-xl bg-[#0B1628] border border-white/[0.08]">
              <div>
                <div className="text-xs font-semibold text-slate-200">{isEnglish ? 'Dark mode' : 'Modo escuro'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{isEnglish ? 'BrisaBase uses the dark interface by default.' : 'O BrisaBase utiliza a interface escura como padrão.'}</div>
              </div>
              <Badge variant="success" dot>{isEnglish ? 'Default' : 'Padrão'}</Badge>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={isNewKeyModalOpen}
        onClose={() => setIsNewKeyModalOpen(false)}
        title={isEnglish ? 'Generate New API Key' : 'Gerar Nova Chave de API'}
        subtitle={isEnglish ? 'Define the permission scope for this token.' : 'Defina o escopo de permissão para este token.'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsNewKeyModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="gradient" size="sm" onClick={handleCreateApiKey} disabled={!newKeyName.trim()}>
              Gerar Chave
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateApiKey} className="space-y-4">
          <Input
            label={isEnglish ? 'Key Identifier' : 'Identificador da Chave'}
            placeholder="ex: Backend Node.js, Frontend Next.js"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">{isEnglish ? 'Access Level (Scope)' : 'Nível de Acesso (Escopo)'}</label>
            <select
              value={newKeyRole}
              onChange={(e) => setNewKeyRole(e.target.value as any)}
              className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
            >
              <option value="Read">{isEnglish ? 'Read-Only' : 'Read-Only (Apenas Leitura)'}</option>
              <option value="Write">{isEnglish ? 'Write (Read & Write)' : 'Write (Leitura & Gravação)'}</option>
              <option value="Admin">{isEnglish ? 'Admin (Full Cluster Access)' : 'Admin (Acesso Total ao Cluster)'}</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Modal: New Webhook */}
      <Modal
        isOpen={isNewWebhookModalOpen}
        onClose={() => setIsNewWebhookModalOpen(false)}
        title={isEnglish ? 'Add New Webhook' : 'Cadastrar Novo Webhook'}
        subtitle={isEnglish ? 'Receive signed payloads in real time on your server.' : 'Receba payloads assinados em tempo real no seu servidor.'}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsNewWebhookModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="gradient"
              size="sm"
              onClick={handleCreateWebhook}
              disabled={!webhookName.trim() || !webhookUrl.trim()}
            >
              Salvar Webhook
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateWebhook} className="space-y-4">
          <Input
            label={isEnglish ? 'Webhook Name' : 'Nome do Webhook'}
            placeholder="ex: Sync com ERP, Alerta de Pagamento"
            value={webhookName}
            onChange={(e) => setWebhookName(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Gatilho de Evento</label>
            <select
              value={webhookEvent}
              onChange={(e) => setWebhookEvent(e.target.value)}
              className="w-full rounded-xl bg-[#07111F] border border-white/10 text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:border-cyan-400"
            >
              <option value="auth.user.created">{isEnglish ? 'auth.user.created (New user registered)' : 'auth.user.created (Novo usuário registrado)'}</option>
              <option value="database.orders.insert">database.orders.insert (Novo pedido inserido)</option>
              <option value="storage.file.uploaded">storage.file.uploaded (Arquivo enviado)</option>
              <option value="payments.charge.success">payments.charge.success (Pagamento aprovado)</option>
            </select>
          </div>

          <Input
            label="URL de Destino (Endpoint HTTPS)"
            type="url"
            placeholder="https://api.seusite.com/webhooks/brisabase"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            required
          />
        </form>
      </Modal>
    </div>
  );
};
