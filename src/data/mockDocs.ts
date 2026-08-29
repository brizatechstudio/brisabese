export interface DocSection {
  id: string;
  title: string;
  category: string;
  content: string;
  codeSnippets?: { language: string; code: string }[];
}

export const mockDocsSections: DocSection[] = [
  {
    id: 'intro',
    title: 'Introdução ao BrisaBase',
    category: 'Começando',
    content: `O **BrisaBase** é uma plataforma moderna de **Backend como Serviço (BaaS)** desenvolvida para acelerar a criação, hospedagem e escalabilidade de produtos digitais de alta performance.

Com o BrisaBase, você tem acesso imediato a:
- **Banco de Dados em Tempo Real** com suporte a documentos e esquemas flexíveis.
- **Autenticação Segura** (OAuth, e-mail/senha, biometria e sessões resilientes).
- **Armazenamento de Arquivos em Nuvem** com CDN global integrada e compressão automática.
- **Funções Serverless** executadas no edge mais próximo do seu usuário.
- **WebSockets e Canais Realtime** para sincronização instantânea de estado.
- **APIs REST e GraphQL** geradas automaticamente para qualquer coleção.`,
    codeSnippets: [
      {
        language: 'bash',
        code: `# Instale o SDK oficial do BrisaBase
npm install @brisabase/js`
      }
    ]
  },
  {
    id: 'quickstart',
    title: 'Guia Rápido de Instalação',
    category: 'Começando',
    content: `Para inicializar o BrisaBase em seu projeto, obtenha sua chave pública de API no painel de configurações e inicialize o cliente.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `import { createBrisaClient } from '@brisabase/js';

export const brisa = createBrisaClient({
  projectId: 'brisastore-sa-east',
  apiKey: 'brisa_pk_live_44b1092847192837461928475c'
});`
      }
    ]
  },
  {
    id: 'database',
    title: 'Banco de Dados (Collections & Docs)',
    category: 'Serviços',
    content: `O banco de dados do BrisaBase é estruturado em **Collections** e **Documentos**. As consultas são otimizadas com índices automáticos e escuta em tempo real.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `// Consultar documentos com filtros
const { data, error } = await brisa
  .collection('products')
  .where('status', '==', 'in_stock')
  .orderBy('price', 'desc')
  .limit(20)
  .get();

// Inserir um novo documento
const newOrder = await brisa.collection('orders').insert({
  customerEmail: 'cliente@exemplo.com',
  totalAmount: 450.00,
  status: 'pending'
});`
      }
    ]
  },
  {
    id: 'auth',
    title: 'Autenticação de Usuários',
    category: 'Serviços',
    content: `Gerencie autenticação de ponta a ponta com provedores como Google, GitHub, Apple e e-mail tradicional com suporte a magic links.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `// Login com e-mail e senha
const { user, session, error } = await brisa.auth.signInWithPassword({
  email: 'usuario@dominio.com',
  password: 'MinhaSenhaSegura123!'
});

// Login com Google OAuth
await brisa.auth.signInWithOAuth({
  provider: 'google',
  redirectTo: 'https://seusite.com/dashboard'
});`
      }
    ]
  },
  {
    id: 'storage',
    title: 'Armazenamento de Arquivos',
    category: 'Serviços',
    content: `Faça upload e gerencie arquivos como imagens, PDFs e backups com links públicos seguros e transformações de imagem on-the-fly.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `// Upload de arquivo
const file = event.target.files[0];
const { url, path } = await brisa.storage
  .bucket('images')
  .upload('avatars/' + file.name, file);

console.log('Arquivo disponível em:', url);`
      }
    ]
  },
  {
    id: 'functions',
    title: 'Funções Serverless',
    category: 'Serviços',
    content: `Escreva lógica de backend isolada em TypeScript, Node.js ou Python que responde a chamadas HTTP ou gatilhos de banco de dados.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `// Invocar função no cliente
const response = await brisa.functions.invoke('processPayment', {
  body: {
    amount: 199.90,
    customerId: 'usr_84920'
  }
});`
      }
    ]
  },
  {
    id: 'realtime',
    title: 'Realtime & WebSockets',
    category: 'Serviços',
    content: `Conecte múltiplos clientes a canais de broadcast para sincronização instantânea de estado ou mensagens em chat.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `const channel = brisa.realtime.channel('orders:live');

channel.on('order_created', (payload) => {
  console.log('Novo pedido recebido!', payload);
});

channel.subscribe();`
      }
    ]
  },
  {
    id: 'sdk-cli',
    title: 'SDK & CLI Multiplataforma',
    category: 'SDK & CLI',
    content: `O BrisaBase possui bibliotecas oficiais e suporte a TypeScript, React, Python e Flutter.`,
    codeSnippets: [
      {
        language: 'JavaScript',
        code: `import { BrisaBase } from "@brisabase/js";

const brisa = new BrisaBase({
  apiKey: "brisa_pk_demo",
  project: "brisastore"
});`
      },
      {
        language: 'TypeScript',
        code: `import { BrisaBase, type BrisaOptions } from "@brisabase/js";

const config: BrisaOptions = {
  apiKey: "brisa_pk_demo",
  region: "sa-east-1"
};
const brisa = new BrisaBase(config);`
      },
      {
        language: 'React',
        code: `import { BrisaProvider, useBrisaAuth, useBrisaCollection } from "@brisabase/react";

function App() {
  const { user } = useBrisaAuth();
  const { data: products } = useBrisaCollection('products');
  return <div>Olá, {user?.name}</div>;
}`
      },
      {
        language: 'Flutter',
        code: `import 'package:brisabase_flutter/brisabase.dart';

void main() async {
  await BrisaBase.initialize(
    apiKey: 'brisa_pk_demo',
    projectId: 'brisastore'
  );
  runApp(const MyApp());
}`
      },
      {
        language: 'Python',
        code: `from brisabase import BrisaClient

brisa = BrisaClient(api_key="brisa_sec_demo")
docs = brisa.collection("users").get()`
      }
    ]
  },
  {
    id: 'sql-database-editor',
    title: 'PostgreSQL, Table Editor & SQL Editor',
    category: 'Database',
    content: `O Database agora representa duas experiências complementares: PostgreSQL relacional e Document Database NoSQL.

No PostgreSQL mock, o Table Editor permite criar tabelas, colunas, rows, ativar RLS e Realtime. O SQL Editor aceita comandos DDL/DML simulados como CREATE TABLE, ALTER TABLE, CREATE INDEX, CREATE VIEW, INSERT, SELECT, UPDATE, DELETE, EXPLAIN e transações.

Quando um CREATE TABLE ou ALTER TABLE é executado, o schema local é atualizado e aparece no Table Editor. Tudo continua persistido somente no localStorage; nenhuma conexão PostgreSQL é aberta.`,
    codeSnippets: [
      {
        language: 'sql',
        code: `create table public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create index idx_customers_plan on public.customers (plan);`
      },
      {
        language: 'sql',
        code: `select id, email, plan, created_at
from public.customers
where plan = 'pro'
order by created_at desc
limit 100;`
      }
    ]
  },
  {
    id: 'data-platform-advanced',
    title: 'Data Platform Avançada',
    category: 'Plataforma',
    content: `Nesta fase do projeto, Schema, índices, Query Studio, functions/triggers, views, extensions, cron/queues, replication/CDC, performance, migrations, backups, import/export e Vector Search são experiências simuladas no console.

O objetivo é validar a arquitetura do produto antes de conectar um banco real. Todos os recursos criados nessas telas permanecem apenas no navegador.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `// API-alvo planejada para a fase real\nconst orders = await brisa.db\n  .from('orders')\n  .select('*')\n  .where('status', 'paid');`
      }
    ]
  },
  {
    id: 'security-platform',
    title: 'Identity, Policies & Security',
    category: 'Segurança',
    content: `O mock de segurança cobre Identity Providers, senha, Magic Link/OTP, SMS, guest sessions, OAuth/OIDC/SAML, JWT externo, MFA, sessões, Auth Hooks, RBAC, Policies/RLS, App Protection, rate limits, CORS, Secrets Vault e Audit Log.

Nenhuma policy é aplicada de verdade nesta fase; o console serve para definir como o modelo de segurança deverá funcionar quando o backend real for iniciado.`,
    codeSnippets: [
      {
        language: 'typescript',
        code: `// Modelo de policy planejado\nallow select on orders\nwhen auth.uid == row.user_id;`
      }
    ]
  },
  {
    id: 'environments-branches',
    title: 'Ambientes, Branches & Preview',
    category: 'DevOps',
    content: `Development, Staging e Production são representados como ambientes isolados. Branches simulam cópias temporárias de schema e configuração para previews de pull requests.

A futura implementação real deverá garantir isolamento físico/lógico, promotion pipeline, rollback e expiração automática de ambientes temporários.`
  },
  {
    id: 'hosting-messaging',
    title: 'Hosting, Messaging & Feature Flags',
    category: 'Plataforma',
    content: `O console agora também representa Hosting, domínios, SSL, deployments, CDN, Push, E-mail, SMS, templates, campanhas, Remote Config e Feature Flags.

Esses módulos continuam totalmente simulados e existem para fechar o desenho do produto antes de qualquer integração com provedores externos.`
  },
  {
    id: 'usage-quotas',
    title: 'Usage, Quotas & Cost Control',
    category: 'Operação',
    content: `Metering, quotas, budgets, alertas e limites preventivos estão disponíveis em modo mock. Eles definem quais unidades serão medidas futuramente: requests, compute, storage, egress, conexões realtime, execuções de functions e mensagens.`
  },
  {
    id: 'mock-phase',
    title: 'Fase Atual: Mock Completo',
    category: 'Roadmap',
    content: `O BrisaBase está deliberadamente na fase de definição e validação do produto.

Regras desta fase:
- Nenhuma infraestrutura real é provisionada.
- Nenhuma credencial real é necessária.
- Recursos avançados ficam persistidos apenas em localStorage.
- Fluxos devem parecer completos e navegáveis.
- A migração para serviços reais só começa após o escopo do produto ser congelado.

A ordem prevista para a fase real é: Projects/Tenancy → Auth/Security → Database → Storage → Realtime → Functions → SDK/API → Observability/Billing.`
  }

];
