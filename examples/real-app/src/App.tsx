import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrisaBaseClient, BrisaBaseRealtimeChannel, RealtimePayload } from '@brisabase/sdk';

type Session = { accessToken: string; refreshToken: string; sessionId?: string; expiresIn?: number };
type Product = { id: string; owner_id: string; name: string; price: number; created_at?: string; updated_at?: string };
type FileItem = { path: string; name: string; size: number; mimeType: string; createdAt: string; metadata: Record<string, unknown> };
type RequestEntry = { id: string; endpoint: string; method: string; status: number; latencyMs: number; error?: string; at: string };
type Health = { name: string; status: string };

const config = {
  url: (import.meta.env.VITE_BRISABASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  projectId: import.meta.env.VITE_BRISABASE_PROJECT_ID || '',
  environmentId: import.meta.env.VITE_BRISABASE_ENVIRONMENT_ID || '',
  publicKey: import.meta.env.VITE_BRISABASE_PUBLIC_KEY || '',
  productsTable: import.meta.env.VITE_BRISABASE_PRODUCTS_TABLE || 'external_products',
  realtimeTable: import.meta.env.VITE_BRISABASE_REALTIME_TABLE || 'external_realtime_events',
  bucket: import.meta.env.VITE_BRISABASE_STORAGE_BUCKET || 'external-real-app',
  functionSlug: import.meta.env.VITE_BRISABASE_FUNCTION_SLUG || 'external-hello-world',
};

function message(error: unknown): string { return error instanceof Error ? error.message : 'A solicitação falhou.'; }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card"><h2>{title}</h2>{children}</section>;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; display_name?: string } | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'database' | 'storage' | 'realtime' | 'functions' | 'monitor'>('dashboard');
  const [notice, setNotice] = useState('Configure o escopo e entre para começar.');
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [health, setHealth] = useState<Health[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage] = useState(0);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [events, setEvents] = useState<Array<RealtimePayload & { receivedAt: string }>>([]);
  const [realtimeState, setRealtimeState] = useState('disconnected');
  const [realtimeEventId, setRealtimeEventId] = useState<string | null>(null);
  const [functionName, setFunctionName] = useState('BrisaBase');
  const [functionResult, setFunctionResult] = useState<unknown>(null);
  const channel = useRef<BrisaBaseRealtimeChannel | null>(null);

  // The platform currently resolves an API key before a JWT.  Avoid sending
  // both on authenticated calls; the optional public key remains browser-safe
  // and is used before a session exists.
  const client = useMemo(() => new BrisaBaseClient({
    url: config.url,
    projectId: config.projectId || undefined,
    environmentId: config.environmentId || undefined,
    ...(session?.accessToken ? { accessToken: session.accessToken } : { apiKey: config.publicKey || undefined }),
  }), [session?.accessToken]);

  const addRequest = useCallback((entry: Omit<RequestEntry, 'id' | 'at'>) => {
    setRequests((current) => [{ ...entry, id: crypto.randomUUID(), at: new Date().toISOString() }, ...current].slice(0, 80));
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const started = performance.now();
      const endpoint = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || (typeof input === 'string' || input instanceof URL ? 'GET' : input.method) || 'GET';
      try {
        const response = await originalFetch(input, init);
        addRequest({ endpoint, method, status: response.status, latencyMs: Math.round(performance.now() - started), error: response.ok ? undefined : `HTTP ${response.status}` });
        return response;
      } catch (error) {
        addRequest({ endpoint, method, status: 0, latencyMs: Math.round(performance.now() - started), error: 'Falha de rede' });
        throw error;
      }
    };
    return () => { window.fetch = originalFetch; };
  }, [addRequest]);

  const applySession = useCallback(async (result: any, label: string) => {
    const next = result?.session;
    if (!next?.access_token || !next?.refresh_token) {
      setNotice(`${label}: conta criada; confirme o e-mail no Mailpit antes de entrar, se a verificação estiver habilitada.`);
      return;
    }
    const nextSession = { accessToken: next.access_token, refreshToken: next.refresh_token, sessionId: next.session_id, expiresIn: next.expires_in };
    setSession(nextSession);
    const profile = await new BrisaBaseClient({ url: config.url, projectId: config.projectId, environmentId: config.environmentId, accessToken: next.access_token }).auth.getUser();
    setUser(profile);
    setNotice(`${label} concluído para ${profile.email}.`);
  }, []);

  const requireSession = (): boolean => {
    if (session && user) return true;
    setNotice('Entre antes de usar este recurso.');
    return false;
  };

  const refreshHealth = useCallback(async () => {
    const names = ['database', 'storage', 'realtime', 'functions', 'security', 'observability'];
    const values = await Promise.all(names.map(async (name) => {
      try {
        const response = await fetch(`${config.url}/health/${name}`);
        const body = await response.json();
        return { name, status: body.status || (response.ok ? 'healthy' : 'unavailable') };
      } catch { return { name, status: 'offline' }; }
    }));
    setHealth(values);
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);
  useEffect(() => () => { void channel.current?.unsubscribe(); }, []);

  async function signUp(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) return setNotice('A confirmação de senha não confere.');
    try { await applySession(await client.auth.signUp({ email, password, displayName }), 'Cadastro'); }
    catch (error) { setNotice(message(error)); }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    try { await applySession(await client.auth.signInWithPassword(email, password), 'Login'); }
    catch (error) { setNotice(message(error)); }
  }
  async function refreshSession() {
    if (!session) return;
    try {
      const next = await client.auth.refreshSession(session.refreshToken);
      await applySession({ session: next }, 'Sessão renovada');
    } catch (error) { setSession(null); setUser(null); setNotice(`Sessão expirada ou revogada: ${message(error)}`); }
  }
  async function signOut() {
    if (!session) return;
    try { await client.auth.signOut(); await channel.current?.unsubscribe(); channel.current = null; setSession(null); setUser(null); setFiles([]); setProducts([]); setNotice('Sessão encerrada.'); }
    catch (error) { setNotice(message(error)); }
  }
  async function passwordReset() {
    try { await client.auth.requestPasswordReset(email); setNotice('Se a conta existir, o e-mail foi enviado. Abra o Mailpit local para obter o token.'); }
    catch (error) { setNotice(message(error)); }
  }
  async function confirmReset() {
    try { await client.auth.confirmPasswordReset(resetToken, newPassword); setNotice('Senha redefinida. Entre novamente.'); }
    catch (error) { setNotice(message(error)); }
  }
  async function verification(action: 'resend' | 'verify') {
    try {
      const response = await fetch(`${config.url}/api/auth/${action === 'resend' ? 'resend-verification' : 'verify-email'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'resend' ? { email, project_id: config.projectId, environment_id: config.environmentId } : { token: resetToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || 'Não foi possível verificar o e-mail.');
      setNotice(body.message || 'Fluxo de verificação iniciado.');
    } catch (error) { setNotice(message(error)); }
  }

  async function loadProducts() {
    if (!requireSession()) return;
    let query = client.from<Product>(config.productsTable).select('*').order('price', { ascending: true }).limit(8).offset(page * 8);
    if (search) query = query.ilike('name', `%${search}%`);
    if (minPrice) query = query.gte('price', Number(minPrice));
    if (maxPrice) query = query.lte('price', Number(maxPrice));
    const result = await query.get();
    if (result.error) { setNotice(result.error.message || JSON.stringify(result.error)); return; }
    setProducts(result.data || []);
    setNotice(`${result.data?.length || 0} produto(s) recebidos da API.`);
  }
  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!requireSession() || !user) return;
    const price = Number(productPrice);
    if (!productName || !Number.isFinite(price)) return setNotice('Informe um nome e um preço válido.');
    const now = new Date().toISOString();
    const result = editingId
      ? await client.from<Product>(config.productsTable).update({ name: productName, price, updated_at: now }, editingId)
      : await client.from<Product>(config.productsTable).insert({ id: crypto.randomUUID(), owner_id: user.id, name: productName, price, created_at: now, updated_at: now });
    if (result.error) return setNotice(result.error.message || JSON.stringify(result.error));
    setProductName(''); setProductPrice(''); setEditingId(null); await loadProducts();
  }
  async function deleteProduct(id: string) {
    if (!requireSession()) return;
    const result = await client.from<Product>(config.productsTable).delete(id);
    if (result.error) return setNotice(result.error.message || JSON.stringify(result.error));
    await loadProducts();
  }

  async function loadFiles() {
    if (!requireSession() || !user) return;
    const result = await client.storage.from(config.bucket).list(`${user.id}/`);
    if (result.error) return setNotice(result.error.message);
    setFiles((result.data || []) as FileItem[]);
  }
  async function uploadFile(event: FormEvent) {
    event.preventDefault();
    if (!requireSession() || !user || !selectedFile) return setNotice('Escolha um arquivo antes de enviar.');
    const result = await client.storage.from(config.bucket).upload(`${user.id}/${selectedFile.name}`, selectedFile, { metadata: { source: 'real-app', uploadedAt: new Date().toISOString() } });
    if (result.error) return setNotice(result.error.message);
    if ((result.data as any)?.storageKey) return setNotice('Erro: a API expôs uma storageKey interna.');
    setSelectedFile(null); setNotice('Upload concluído por meio da API pública.'); await loadFiles();
  }
  async function downloadFile(path: string, preview = false) {
    const result = preview ? await client.storage.from(config.bucket).createSignedUrl(path, 60) : await client.storage.from(config.bucket).download(path);
    if (result.error) return setNotice(result.error.message);
    if (preview) { window.open((result.data as { signedUrl: string }).signedUrl, '_blank', 'noopener,noreferrer'); return; }
    const href = URL.createObjectURL(result.data as Blob); const link = document.createElement('a'); link.href = href; link.download = path.split('/').at(-1) || 'download'; link.click(); URL.revokeObjectURL(href);
  }
  async function deleteFile(path: string) {
    const result = await client.storage.from(config.bucket).remove([path]);
    if (result.error) return setNotice(result.error.message);
    await loadFiles();
  }

  async function connectRealtime() {
    if (!requireSession()) return;
    await channel.current?.unsubscribe();
    const next = client.channel('real-app-products').on('postgres_changes', { event: '*', schema: 'public', table: config.realtimeTable }, (payload) => {
      setEvents((current) => [{ ...payload, receivedAt: new Date().toISOString() }, ...current].slice(0, 30));
    });
    next.onStateChange((state) => setRealtimeState(state));
    try { await next.subscribe(); channel.current = next; setNotice('Canal WebSocket conectado. Faça um CRUD em outra sessão para ver os eventos.'); }
    catch (error) { setNotice(message(error)); }
  }
  async function emitRealtime() {
    if (!requireSession() || !user) return;
    const id = realtimeEventId || crypto.randomUUID();
    const result = realtimeEventId
      ? await client.from(config.realtimeTable).update({ message: `updated at ${new Date().toLocaleTimeString()}` }, id)
      : await client.from(config.realtimeTable).insert({ id, owner_id: user.id, message: `created at ${new Date().toLocaleTimeString()}`, created_at: new Date().toISOString() });
    if (result.error) return setNotice(result.error.message || JSON.stringify(result.error));
    setRealtimeEventId(id); setNotice(realtimeEventId ? 'UPDATE enviado ao canal compartilhado.' : 'INSERT enviado ao canal compartilhado.');
  }
  async function deleteRealtime() {
    if (!realtimeEventId) return;
    const result = await client.from(config.realtimeTable).delete(realtimeEventId);
    if (result.error) return setNotice(result.error.message || JSON.stringify(result.error));
    setRealtimeEventId(null); setNotice('DELETE enviado ao canal compartilhado.');
  }
  async function invokeFunction() {
    if (!requireSession()) return;
    try { const result = await client.functions.invoke(config.functionSlug, { name: functionName }); setFunctionResult(result); setNotice('Function executada pelo BrisaBase.'); }
    catch (error) { setNotice(message(error)); }
  }
  async function probe(kind: '401' | '404') {
    if (kind === '401') await fetch(`${config.url}/api/auth/user`);
    else await fetch(`${config.url}/rest/v1/this_table_does_not_exist`, { headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {} });
  }

  const configured = Boolean(config.projectId && config.environmentId);
  return <main>
    <header><div><p className="eyebrow">EXTERNAL CLIENT · REAL SERVICES</p><h1>BrisaBase Real App</h1><p>Cliente web independente que fala somente HTTPS/WebSocket com o BrisaBase.</p></div><button className="secondary" onClick={() => void refreshHealth()}>Atualizar status</button></header>
    {!configured && <p className="warning">Defina VITE_BRISABASE_PROJECT_ID e VITE_BRISABASE_ENVIRONMENT_ID em .env antes de usar o app.</p>}
    <p className="notice" role="status">{notice}</p>

    <section className="auth-grid">
      <Card title="Conta e sessão">
        <form onSubmit={signIn} className="form-grid"><label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label><label>Senha<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={12} /></label><div className="actions"><button>Entrar</button><button type="button" className="secondary" onClick={() => void passwordReset()}>Esqueci minha senha</button></div></form>
        <form onSubmit={signUp} className="form-grid compact"><label>Nome<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label><label>Confirmar senha<input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" required minLength={12} /></label><button>Criar conta</button></form>
        <div className="actions"><button className="secondary" onClick={() => void refreshSession()} disabled={!session}>Renovar sessão</button><button className="secondary" onClick={() => void signOut()} disabled={!session}>Sair</button><button className="secondary" onClick={() => void verification('resend')}>Reenviar verificação</button></div>
      </Card>
      <Card title="Identidade atual">
        {user ? <dl><dt>Usuário</dt><dd>{user.display_name || user.email}</dd><dt>ID</dt><dd className="mono">{user.id}</dd><dt>E-mail</dt><dd>{user.email}</dd><dt>Sessão</dt><dd className="mono">{session?.sessionId || 'ativa'}</dd></dl> : <p>Nenhum usuário autenticado.</p>}
        <details><summary>Confirmar reset ou e-mail</summary><div className="form-grid compact"><label>Token recebido no Mailpit<input value={resetToken} onChange={(e) => setResetToken(e.target.value)} /></label><label>Nova senha<input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" minLength={12} /></label><div className="actions"><button type="button" onClick={() => void confirmReset()}>Confirmar reset</button><button type="button" className="secondary" onClick={() => void verification('verify')}>Confirmar e-mail</button></div><a href="http://localhost:8025" target="_blank" rel="noreferrer">Abrir Mailpit</a></div></details>
      </Card>
    </section>

    <nav aria-label="Recursos do BrisaBase">{(['dashboard', 'database', 'storage', 'realtime', 'functions', 'monitor'] as const).map((name) => <button key={name} className={tab === name ? 'active' : 'secondary'} onClick={() => setTab(name)}>{name}</button>)}</nav>

    {tab === 'dashboard' && <Card title="Dashboard do aplicativo"><div className="status-grid"><div><strong>Projeto</strong><span className="mono">{config.projectId || 'não configurado'}</span></div><div><strong>Ambiente</strong><span className="mono">{config.environmentId || 'não configurado'}</span></div>{health.map((item) => <div key={item.name}><strong>{item.name}</strong><span className={item.status === 'healthy' ? 'healthy' : 'degraded'}>{item.status}</span></div>)}</div><p>URL pública: <code>{config.url}</code></p></Card>}

    {tab === 'database' && <section className="stack"><Card title="Produtos — CRUD e filtros"><form onSubmit={saveProduct} className="inline-form"><input placeholder="Nome do produto" value={productName} onChange={(e) => setProductName(e.target.value)} /><input placeholder="Preço" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} inputMode="decimal" /><button>{editingId ? 'Salvar edição' : 'Novo produto'}</button>{editingId && <button className="secondary" type="button" onClick={() => { setEditingId(null); setProductName(''); setProductPrice(''); }}>Cancelar</button>}</form><div className="inline-form"><input placeholder="Buscar (ilike)" value={search} onChange={(e) => setSearch(e.target.value)} /><input placeholder="Preço mínimo" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} /><input placeholder="Preço máximo" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} /><button onClick={() => void loadProducts()}>Atualizar</button></div><table><thead><tr><th>ID</th><th>Nome</th><th>Preço</th><th>Data</th><th>Ações</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td className="mono">{product.id.slice(0, 8)}</td><td>{product.name}</td><td>{Number(product.price).toFixed(2)}</td><td>{product.created_at ? new Date(product.created_at).toLocaleString() : '-'}</td><td><button className="link" onClick={() => { setEditingId(product.id); setProductName(product.name); setProductPrice(String(product.price)); }}>Editar</button><button className="link danger" onClick={() => void deleteProduct(product.id)}>Excluir</button></td></tr>)}</tbody></table><div className="actions"><button className="secondary" onClick={() => { setPage(Math.max(0, page - 1)); }}>Página anterior</button><span>Página {page + 1}</span><button className="secondary" onClick={() => { setPage(page + 1); }}>Próxima página</button></div><p className="muted">A API aplica RLS; o bootstrap cria policies onde <code>owner_id = auth.uid()</code>. O E2E valida eq, neq, gt, gte, lt, lte, like, ilike, in, is, order, limit e offset.</p></Card></section>}

    {tab === 'storage' && <section className="stack"><Card title="Storage Test"><form onSubmit={uploadFile} className="inline-form"><input type="file" accept="image/*,text/plain" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} /><button>Enviar</button><button type="button" className="secondary" onClick={() => void loadFiles()}>Listar arquivos</button></form><p className="muted">Os objetos são enviados em <code>{user ? `${user.id}/…` : 'user-id/…'}</code>; a policy persistida restringe cada usuário ao próprio prefixo.</p><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Tamanho</th><th>Metadata</th><th>Ações</th></tr></thead><tbody>{files.map((file) => <tr key={file.path}><td>{file.path}</td><td>{file.mimeType}</td><td>{file.size}</td><td className="mono">{JSON.stringify(file.metadata)}</td><td><button className="link" onClick={() => void downloadFile(file.path, true)}>Visualizar</button><button className="link" onClick={() => void downloadFile(file.path)}>Download</button><button className="link danger" onClick={() => void deleteFile(file.path)}>Excluir</button></td></tr>)}</tbody></table></Card></section>}

    {tab === 'realtime' && <Card title="Realtime Test"><div className="actions"><button onClick={() => void connectRealtime()}>Conectar no canal compartilhado</button><button className="secondary" onClick={() => void emitRealtime()}>Emitir {realtimeEventId ? 'UPDATE' : 'INSERT'}</button><button className="secondary" onClick={() => void deleteRealtime()} disabled={!realtimeEventId}>Emitir DELETE</button><span className={realtimeState === 'connected' ? 'healthy' : 'degraded'}>{realtimeState}</span></div><p>O canal <code>{config.realtimeTable}</code> tem policy compartilhada para demonstrar eventos entre dois clientes. Produtos privados continuam protegidos por RLS.</p><pre>{events.length ? JSON.stringify(events, null, 2) : 'Nenhum evento recebido ainda.'}</pre></Card>}

    {tab === 'functions' && <Card title="Function Test"><div className="inline-form"><input value={functionName} onChange={(e) => setFunctionName(e.target.value)} /><button onClick={() => void invokeFunction()}>POST {config.functionSlug}</button></div><pre>{functionResult ? JSON.stringify(functionResult, null, 2) : 'Aguardando execução.'}</pre><p className="muted">A Function é implantada pelo bootstrap externo e executa no BrisaBase; não há lógica duplicada no navegador.</p></Card>}

    {tab === 'monitor' && <Card title="Request Monitor"><div className="actions"><button className="secondary" onClick={() => void probe('401')}>Gerar 401 real</button><button className="secondary" onClick={() => void probe('404')}>Gerar 404 real</button></div><p className="muted">O monitor intercepta as chamadas reais do SDK/API sem ler bodies ou tokens. Os testes E2E também verificam 403, 409 e 429.</p><table><thead><tr><th>Quando</th><th>Método</th><th>Endpoint</th><th>Status</th><th>Latência</th><th>Erro</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{new Date(request.at).toLocaleTimeString()}</td><td>{request.method}</td><td className="endpoint">{request.endpoint.replace(config.url, '')}</td><td>{request.status}</td><td>{request.latencyMs} ms</td><td>{request.error || '-'}</td></tr>)}</tbody></table></Card>}
  </main>;
}
