import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  Database,
  FolderOpen,
  LockKeyhole,
  Radio,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { CodeBlock } from '../components/common/CodeBlock';

type SectionId = 'start' | 'isolation' | 'auth' | 'database' | 'storage' | 'realtime' | 'errors' | 'checklist';

const examples = {
  client: `import { BrisaBaseClient } from '@brisabase/js';

export const brisabase = new BrisaBaseClient({
  url: import.meta.env.VITE_BRISABASE_URL,
  projectId: import.meta.env.VITE_BRISABASE_PROJECT_ID,
  environmentId: import.meta.env.VITE_BRISABASE_ENVIRONMENT_ID,
  // A chave public é opcional. Nunca coloque uma service key no browser.
  apiKey: import.meta.env.VITE_BRISABASE_PUBLIC_KEY || undefined,
});`,
  auth: `const registered = await brisabase.auth.signUp({
  email: 'ana@example.com',
  password: 'uma-senha-com-pelo-menos-12-caracteres',
  displayName: 'Ana',
});

const loggedIn = await brisabase.auth.signInWithPassword(
  'ana@example.com',
  'uma-senha-com-pelo-menos-12-caracteres',
);

brisabase.setAccessToken(loggedIn.session.access_token);
const me = await brisabase.auth.getUser();`,
  database: `type Task = {
  id: string;
  owner_id: string;
  title: string;
  completed: boolean;
};

const me = await brisabase.auth.getUser();

await brisabase.from<Task>('tasks').insert({
  id: crypto.randomUUID(),
  owner_id: me.id,
  title: 'Revisar policies RLS',
  completed: false,
});

// Não confie em filtro do navegador para isolamento.
// O RLS no BrisaBase decide quais linhas podem ser retornadas.
const mine = await brisabase
  .from<Task>('tasks')
  .select('*')
  .order('title', { ascending: true })
  .limit(50)
  .get();`,
  storage: `const me = await brisabase.auth.getUser();
const file = document.querySelector<HTMLInputElement>('#avatar')!.files![0];
const path = \`usuarios/\${me.id}/\${file.name}\`;

await brisabase.storage.from('avatars').upload(path, file, {
  metadata: { uploadedBy: me.id },
});

// A URL só é criada depois de a policy autorizar a leitura.
const signed = await brisabase.storage.from('avatars').createSignedUrl(path, 60);`,
  realtime: `const channel = brisabase
  .channel('minhas-tarefas')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tasks',
  }, (event) => console.log(event))
  .subscribe();

// Ao sair da tela ou encerrar a sessão:
await channel.unsubscribe();`,
  http: `const response = await fetch(
  \`\${baseUrl}/rest/v1/tasks?order=title.asc&limit=50\`,
  { headers: { Authorization: \`Bearer \${accessToken}\` } },
);

if (!response.ok) {
  throw new Error(\`BrisaBase respondeu HTTP \${response.status}\`);
}

const tasks = await response.json();`,
};

const navigation: Array<{ id: SectionId; label: string; icon: React.ElementType }> = [
  { id: 'start', label: 'Comece aqui', icon: BookOpen },
  { id: 'isolation', label: 'Segurança e isolamento', icon: ShieldCheck },
  { id: 'auth', label: 'Autenticação', icon: Users },
  { id: 'database', label: 'Banco de dados e RLS', icon: Database },
  { id: 'storage', label: 'Storage privado', icon: FolderOpen },
  { id: 'realtime', label: 'Realtime e Functions', icon: Radio },
  { id: 'errors', label: 'HTTP e erros comuns', icon: Server },
  { id: 'checklist', label: 'Checklist antes do deploy', icon: CheckCircle2 },
];

function SectionTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.08] pb-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-300">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{title}</h2>
      <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-purple-400/25 bg-purple-500/10 p-4 text-sm leading-6 text-purple-100">
      <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-purple-300" />
      <div>{children}</div>
    </div>
  );
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm text-slate-300">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      <span>{children}</span>
    </li>
  );
}

export const DocumentationPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SectionId>('start');
  const activeLabel = useMemo(() => navigation.find((entry) => entry.id === activeSection)?.label ?? 'Documentação', [activeSection]);

  const content: Record<SectionId, React.ReactNode> = {
    start: (
      <>
        <SectionTitle eyebrow="Visão geral" title="Use o BrisaBase na sua aplicação">
          Este guia fica no painel para que a sua equipe configure uma aplicação sem depender do README. O cliente conversa apenas por HTTPS e WebSocket com a API pública; ele nunca acessa PostgreSQL, Redis, MinIO ou segredos de infraestrutura.
        </SectionTitle>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['1', 'Crie o escopo', 'Escolha uma organização, crie o projeto e selecione o ambiente correto.'],
            ['2', 'Proteja os recursos', 'Crie tabelas, buckets e policies RLS antes de expor o app.'],
            ['3', 'Conecte o cliente', 'Informe apenas URL, projectId, environmentId e, se necessário, uma chave public.'],
          ].map(([number, title, description]) => (
            <div key={number} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/15 text-xs font-bold text-purple-200">{number}</span>
              <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
            </div>
          ))}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">Configuração do cliente</h3>
          <p className="mt-1 text-sm text-slate-400">No frontend, exponha somente variáveis públicas. Em produção, use HTTPS e cadastre a origem do seu app em <code>CORS_ALLOWED_ORIGINS</code>.</p>
          <CodeBlock code={examples.client} title="brisabase.ts" />
        </div>

        <Callout>
          Nunca use <code>service</code>, <code>secret</code>, senha de banco, Redis, MinIO ou S3 no navegador. Variáveis com prefixo <code>VITE_</code> podem entrar no bundle público.
        </Callout>
      </>
    ),
    isolation: (
      <>
        <SectionTitle eyebrow="Regra principal" title="Cada pessoa vê somente os próprios dados">
          O isolamento não depende de esconder botões na interface. Ele é aplicado pelo BrisaBase em três camadas e deve ser testado para cada tabela, bucket e canal privado.
        </SectionTitle>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Organização', 'Separa empresas e equipes. Somente membros autorizados administram o escopo.'],
            ['Projeto e ambiente', 'Separa aplicações e ambientes. Uma credencial não pode trocar de escopo por cabeçalho.'],
            ['RLS', 'Separa as linhas, arquivos e eventos de cada usuário final autenticado.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-white/[0.08] bg-slate-900/50 p-5">
              <ShieldCheck className="h-5 w-5 text-purple-300" />
              <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
            </div>
          ))}
        </div>

        <Callout>
          Ser administrador da organização permite configurar o projeto, mas <strong>não substitui RLS</strong>. Para dados privados, crie policies explícitas para leitura, criação, alteração e exclusão.
        </Callout>

        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Operação</th><th className="px-4 py-3">Policy para a tabela <code>tasks</code></th></tr></thead>
            <tbody className="divide-y divide-white/[0.07] text-slate-300">
              <tr><td className="px-4 py-3 font-mono text-purple-200">SELECT</td><td className="px-4 py-3 font-mono text-xs">row.owner_id = auth.uid()</td></tr>
              <tr><td className="px-4 py-3 font-mono text-purple-200">INSERT</td><td className="px-4 py-3 font-mono text-xs">new.owner_id = auth.uid()</td></tr>
              <tr><td className="px-4 py-3 font-mono text-purple-200">UPDATE</td><td className="px-4 py-3 font-mono text-xs">row.owner_id = auth.uid() and new.owner_id = auth.uid()</td></tr>
              <tr><td className="px-4 py-3 font-mono text-purple-200">DELETE</td><td className="px-4 py-3 font-mono text-xs">row.owner_id = auth.uid()</td></tr>
            </tbody>
          </table>
        </div>
      </>
    ),
    auth: (
      <>
        <SectionTitle eyebrow="Usuários finais" title="Cadastro, sessão e logout">
          Use os endpoints públicos de Auth para as pessoas que usam a sua aplicação. O login administrativo do painel não deve ser usado como login de usuário final.
        </SectionTitle>
        <CodeBlock code={examples.auth} title="auth.ts" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] p-4"><h3 className="text-sm font-semibold text-white">Token</h3><p className="mt-1 text-xs leading-5 text-slate-400">Guarde o token de acesso somente durante a sessão, usando armazenamento seguro na plataforma.</p></div>
          <div className="rounded-xl border border-white/[0.08] p-4"><h3 className="text-sm font-semibold text-white">Renovação</h3><p className="mt-1 text-xs leading-5 text-slate-400">Depois de um único 401 recuperável, renove a sessão. Se falhar, encerre o login.</p></div>
          <div className="rounded-xl border border-white/[0.08] p-4"><h3 className="text-sm font-semibold text-white">OAuth</h3><p className="mt-1 text-xs leading-5 text-slate-400">Configure cada provider no projeto e ambiente corretos; não reutilize segredos entre tenants.</p></div>
        </div>
      </>
    ),
    database: (
      <>
        <SectionTitle eyebrow="Dados privados" title="Banco de dados protegido por RLS">
          Toda tabela privada deve conter um identificador de proprietário, como <code>owner_id</code>, e policies que comparem esse valor ao usuário autenticado. O browser pode enviar um valor, mas o servidor decide se ele é aceito.
        </SectionTitle>
        <CodeBlock code={examples.database} title="tasks.ts" />
        <Callout>
          Não crie policy <code>true</code> em tabelas privadas e não use uma service key no navegador para contornar uma negação. Sem uma policy correspondente, o runtime real nega o acesso por padrão.
        </Callout>
      </>
    ),
    storage: (
      <>
        <SectionTitle eyebrow="Arquivos" title="Storage privado por usuário">
          Use um prefixo que inclua o ID do usuário, por exemplo <code>usuarios/&lt;auth.uid()&gt;/foto.png</code>. Configure policies de leitura, criação, alteração e exclusão para validar a propriedade do objeto.
        </SectionTitle>
        <CodeBlock code={examples.storage} title="storage.ts" />
        <Callout>
          Nunca exponha <code>storageKey</code>, credenciais S3 ou URL direta do MinIO. Gere uma URL assinada somente depois da autorização da policy.
        </Callout>
      </>
    ),
    realtime: (
      <>
        <SectionTitle eyebrow="Eventos" title="Realtime e Functions">
          Realtime mantém o contexto autenticado e reaplica as policies de leitura. Só assine tabelas cuja política foi revisada. Functions em modo service pertencem a backend confiável e auditado.
        </SectionTitle>
        <CodeBlock code={examples.realtime} title="realtime.ts" />
        <p className="text-sm leading-6 text-slate-400">A entrega de CDC é ao menos uma vez. Use <code>eventId</code> para eliminar duplicados e cancele o canal ao desmontar a tela ou encerrar a sessão.</p>
      </>
    ),
    errors: (
      <>
        <SectionTitle eyebrow="Contrato público" title="Respostas HTTP que seu app deve tratar">
          Não transforme falhas de autorização ou rate limit em sucesso. Mostre uma mensagem útil ao usuário, preserve o isolamento e faça poucas tentativas apenas quando apropriado.
        </SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="min-w-full text-left text-sm"><thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Significado</th><th className="px-4 py-3">Ação</th></tr></thead><tbody className="divide-y divide-white/[0.07] text-slate-300">
            <tr><td className="px-4 py-3 font-mono text-amber-300">401</td><td className="px-4 py-3">Sessão ausente, expirada ou inválida.</td><td className="px-4 py-3">Renove uma vez; depois solicite novo login.</td></tr>
            <tr><td className="px-4 py-3 font-mono text-amber-300">403</td><td className="px-4 py-3">RLS, papel ou escopo negado.</td><td className="px-4 py-3">Corrija a policy ou o escopo; não contorne com service key.</td></tr>
            <tr><td className="px-4 py-3 font-mono text-amber-300">404</td><td className="px-4 py-3">Recurso ausente ou ocultado por policy.</td><td className="px-4 py-3">Não revele a existência de dados privados.</td></tr>
            <tr><td className="px-4 py-3 font-mono text-amber-300">429</td><td className="px-4 py-3">Rate limit.</td><td className="px-4 py-3">Respeite <code>Retry-After</code> ou faça backoff limitado.</td></tr>
            <tr><td className="px-4 py-3 font-mono text-amber-300">5xx</td><td className="px-4 py-3">Falha inesperada do serviço.</td><td className="px-4 py-3">Registre o request ID e tente novamente apenas se a operação for segura.</td></tr>
          </tbody></table>
        </div>
        <CodeBlock code={examples.http} title="Leitura REST sem SDK" />
      </>
    ),
    checklist: (
      <>
        <SectionTitle eyebrow="Antes de publicar" title="Teste o isolamento da sua aplicação">
          Execute esta verificação para cada tabela, bucket, Function e canal Realtime privado. O BrisaBase protege o runtime, mas a sua aplicação precisa criar as policies específicas dos próprios recursos.
        </SectionTitle>
        <ol className="space-y-3">
          <ChecklistItem>Crie dois usuários finais de teste: A e B.</ChecklistItem>
          <ChecklistItem>Com A, crie uma linha e um arquivo vinculados ao ID de A.</ChecklistItem>
          <ChecklistItem>Com B, tente listar, ler, alterar, excluir e criar dados em nome de A.</ChecklistItem>
          <ChecklistItem>Confirme que B nunca recebe dados de A e que escritas indevidas são negadas.</ChecklistItem>
          <ChecklistItem>Repita o cenário por SDK, REST, Storage e Realtime quando esses recursos forem usados.</ChecklistItem>
          <ChecklistItem>Use HTTPS/WSS, configure CORS e mantenha chaves secret/service somente no backend confiável.</ChecklistItem>
        </ol>
      </>
    ),
  };

  return (
    <div className="min-w-0 max-w-full space-y-6 pb-12">
      <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-br from-purple-500/15 via-slate-900/70 to-orange-500/10 p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-200"><BookOpen className="h-5 w-5" /> Central de documentação</div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Construa aplicações seguras com o BrisaBase.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Guias práticos para conectar sua aplicação, autenticar usuários e garantir que cada pessoa acesse somente os próprios dados.</p>
          </div>
          <div className="rounded-xl border border-white/[0.12] bg-black/15 px-4 py-3 text-sm text-slate-300"><span className="text-slate-400">Você está lendo: </span><strong className="text-white">{activeLabel}</strong></div>
        </div>
      </section>

      <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="min-w-0 max-w-full h-fit rounded-2xl border border-white/[0.08] bg-slate-900/50 p-3 lg:sticky lg:top-6">
          <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Neste guia</p>
          <nav className="space-y-1" aria-label="Seções da documentação">
            {navigation.map(({ id, label, icon: Icon }) => {
              const active = activeSection === id;
              return <button key={id} onClick={() => setActiveSection(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${active ? 'bg-purple-500/15 font-semibold text-white' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}>
                <Icon className="h-4 w-4 shrink-0 text-purple-300" />
                <span className="min-w-0 flex-1 break-words">{label}</span>
                {active && <ChevronRight className="h-4 w-4 shrink-0" />}
              </button>;
            })}
          </nav>
        </aside>

        <article className="min-w-0 max-w-full space-y-6 rounded-2xl border border-white/[0.08] bg-slate-900/40 p-5 md:p-7">
          {content[activeSection]}
          <div className="flex items-center gap-2 border-t border-white/[0.08] pt-5 text-xs text-slate-500"><Code2 className="h-4 w-4" /> Exemplos usam apenas o cliente público e o contrato HTTPS/WebSocket.</div>
        </article>
      </div>
    </div>
  );
};
