import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  BellRing,
  Boxes,
  Braces,
  CheckCircle2,
  Cloud,
  CloudCog,
  Code2,
  Command,
  Database,
  FileCode2,
  Flag,
  Gauge,
  GitBranch,
  Globe2,
  HardDrive,
  KeyRound,
  Laptop,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Network,
  PackageCheck,
  Play,
  Plus,
  RadioTower,
  RefreshCw,
  Rocket,
  SearchCode,
  ServerCog,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareTerminal,
  TimerReset,
  UploadCloud,
  UsersRound,
  WandSparkles,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Tabs } from '../components/ui/Tabs';
import { useApp } from '../context/AppContext';

type ModuleId =
  | 'data-platform'
  | 'security'
  | 'environments'
  | 'developer-tools'
  | 'hosting'
  | 'messaging'
  | 'usage'
  | 'experiments'
  | 'app-quality'
  | 'search-ai'
  | 'enterprise';

type StatusTone = 'success' | 'warning' | 'danger' | 'primary' | 'cyan' | 'purple' | 'neutral';

interface ResourceItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  tone?: StatusTone;
  meta?: string[];
  icon?: LucideIcon;
}

interface ModuleTab {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  actionLabel: string;
  actionPlaceholder: string;
  items: ResourceItem[];
  code?: string;
}

interface ModuleConfig {
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: BadgeVariant;
  icon: LucideIcon;
  primaryAction: string;
  stats: { label: string; value: string; helper: string; icon: LucideIcon }[];
  tabs: ModuleTab[];
}

const dataPlatformTabs: ModuleTab[] = [
  {
    id: 'schema',
    label: 'Schema & Relações',
    icon: Database,
    description: 'Modele tabelas/coleções, campos, constraints e relacionamentos antes da implementação real.',
    actionLabel: 'Novo schema',
    actionPlaceholder: 'ex: orders',
    items: [
      { id: 'schema-users', title: 'users', subtitle: '8 campos • 2 relacionamentos', status: 'Ativo', tone: 'success', meta: ['email unique', 'created_at indexed'], icon: UsersRound },
      { id: 'schema-orders', title: 'orders', subtitle: '12 campos • 4 relacionamentos', status: 'Ativo', tone: 'success', meta: ['user_id → users', 'status enum'], icon: Boxes },
      { id: 'schema-products', title: 'products', subtitle: '14 campos • 3 constraints', status: 'Ativo', tone: 'success', meta: ['sku unique', 'price >= 0'], icon: PackageCheck }
    ],
    code: `table orders {\n  id uuid primary key\n  user_id uuid references users.id\n  total decimal(12,2)\n  status enum('pending','paid','cancelled')\n  created_at timestamp\n}`
  },
  {
    id: 'erd',
    label: 'ER Diagram',
    icon: Network,
    description: 'Diagrama visual simulado do schema relacional com foreign keys, dependências, schema diff e navegação entre tabelas.',
    actionLabel: 'Nova visão ERD',
    actionPlaceholder: 'ex: commerce-core',
    items: [
      { id: 'erd-1', title: 'Commerce Core', subtitle: 'users → orders → order_items → products', status: 'Synced', tone: 'success', meta: ['8 tables', '12 relationships'], icon: Network },
      { id: 'erd-2', title: 'Schema Diff', subtitle: 'staging → production', status: '2 changes', tone: 'warning', meta: ['1 column', '1 index'], icon: GitBranch },
      { id: 'erd-3', title: 'Dependency Graph', subtitle: 'views • triggers • functions', status: 'Ready', tone: 'cyan', meta: ['18 dependencies', 'impact preview'], icon: Workflow }
    ]
  },
  {
    id: 'db-roles',
    label: 'Database Roles',
    icon: KeyRound,
    description: 'Papéis e privilégios PostgreSQL simulados, separados do RBAC administrativo da plataforma.',
    actionLabel: 'Novo database role',
    actionPlaceholder: 'ex: reporting_readonly',
    items: [
      { id: 'dbrole-1', title: 'postgres', subtitle: 'Database owner', status: 'System', tone: 'purple', meta: ['all privileges', 'protected'], icon: KeyRound },
      { id: 'dbrole-2', title: 'authenticated', subtitle: 'Client authenticated role', status: 'Active', tone: 'success', meta: ['RLS enforced', 'no DDL'], icon: UsersRound },
      { id: 'dbrole-3', title: 'anon', subtitle: 'Public API role', status: 'Active', tone: 'cyan', meta: ['RLS enforced', 'least privilege'], icon: UsersRound },
      { id: 'dbrole-4', title: 'reporting_readonly', subtitle: 'Analytics workload', status: 'Active', tone: 'success', meta: ['SELECT only', 'pooler allowed'], icon: Activity }
    ]
  },
  {
    id: 'indexes',
    label: 'Índices',
    icon: SearchCode,
    description: 'Simule índices simples, compostos, full-text e vetoriais, incluindo impacto estimado de query.',
    actionLabel: 'Criar índice',
    actionPlaceholder: 'ex: idx_orders_user_status',
    items: [
      { id: 'idx-1', title: 'idx_users_email', subtitle: 'users(email) • UNIQUE', status: 'Pronto', tone: 'success', meta: ['1.2 MB', '0.7ms avg'], icon: SearchCode },
      { id: 'idx-2', title: 'idx_orders_user_status', subtitle: 'orders(user_id, status)', status: 'Pronto', tone: 'success', meta: ['3.8 MB', '2.1ms avg'], icon: SearchCode },
      { id: 'idx-3', title: 'idx_products_search', subtitle: 'products(name, description) • FULLTEXT', status: 'Construindo', tone: 'warning', meta: ['76%', '~18s restantes'], icon: RefreshCw }
    ]
  },
  {
    id: 'query',
    label: 'Query Studio',
    icon: Braces,
    description: 'Workspace SQL simulado com histórico, queries salvas, EXPLAIN, transações, DDL/DML e estimativa de custo.',
    actionLabel: 'Salvar query',
    actionPlaceholder: 'ex: Pedidos pagos de hoje',
    items: [
      { id: 'q-1', title: 'Pedidos pagos de hoje', subtitle: 'SELECT • orders', status: 'Salva', tone: 'cyan', meta: ['24ms', '328 rows'], icon: FileCode2 },
      { id: 'q-2', title: 'Top produtos por receita', subtitle: 'JOIN • orders + products', status: 'Salva', tone: 'cyan', meta: ['61ms', '50 rows'], icon: FileCode2 },
      { id: 'q-3', title: 'Usuários inativos 30d', subtitle: 'SELECT • users', status: 'Rascunho', tone: 'neutral', meta: ['Explain disponível'], icon: FileCode2 }
    ],
    code: `SELECT p.name, SUM(o.total) AS revenue\nFROM orders o\nJOIN products p ON p.id = o.product_id\nWHERE o.status = 'paid'\nGROUP BY p.name\nORDER BY revenue DESC\nLIMIT 50;`
  },
  {
    id: 'db-functions',
    label: 'Functions & Triggers',
    icon: Workflow,
    description: 'Funções PostgreSQL, procedures e triggers de banco para lógica próxima aos dados, todos representados em modo mock.',
    actionLabel: 'Nova database function',
    actionPlaceholder: 'ex: set_updated_at',
    items: [
      { id: 'dbfn-1', title: 'set_updated_at()', subtitle: 'PL/pgSQL • trigger helper', status: 'Ativa', tone: 'success', meta: ['SECURITY INVOKER', '7 triggers'], icon: Workflow },
      { id: 'dbfn-2', title: 'calculate_order_total(uuid)', subtitle: 'SQL • returns numeric', status: 'Ativa', tone: 'success', meta: ['stable', 'avg 1.8ms'], icon: Braces },
      { id: 'dbtrg-1', title: 'orders_audit_trigger', subtitle: 'AFTER INSERT OR UPDATE • orders', status: 'Ativo', tone: 'cyan', meta: ['row-level', 'audit_log'], icon: Zap },
      { id: 'dbtrg-2', title: 'products_stock_webhook', subtitle: 'AFTER UPDATE • products.stock', status: 'Ativo', tone: 'cyan', meta: ['async', 'retry x3'], icon: Webhook }
    ],
    code: `create or replace function public.set_updated_at()\nreturns trigger language plpgsql as $$\nbegin\n  new.updated_at = now();\n  return new;\nend;\n$$;`
  },
  {
    id: 'views',
    label: 'Views',
    icon: Database,
    description: 'Views e materialized views simuladas para encapsular consultas, agregações e modelos de leitura reutilizáveis.',
    actionLabel: 'Nova view',
    actionPlaceholder: 'ex: monthly_revenue',
    items: [
      { id: 'view-1', title: 'paid_orders_summary', subtitle: 'VIEW • orders', status: 'Ativa', tone: 'success', meta: ['3 columns', 'security invoker'], icon: Database },
      { id: 'view-2', title: 'monthly_revenue', subtitle: 'MATERIALIZED VIEW', status: 'Atualizada', tone: 'cyan', meta: ['refresh 15 min', '18K rows'], icon: RefreshCw },
      { id: 'view-3', title: 'customer_ltv', subtitle: 'VIEW • customers + orders', status: 'Ativa', tone: 'success', meta: ['join 3 tables', 'read-only'], icon: Database }
    ],
    code: `create materialized view public.monthly_revenue as\nselect date_trunc('month', created_at) as month, sum(total) revenue\nfrom public.orders\nwhere status = 'paid'\ngroup by 1;`
  },
  {
    id: 'extensions',
    label: 'Extensions',
    icon: PackageCheck,
    description: 'Catálogo simulado de extensões PostgreSQL para busca, vetores, geodados, cron, auditoria e observabilidade.',
    actionLabel: 'Habilitar extensão',
    actionPlaceholder: 'ex: postgis',
    items: [
      { id: 'ext-1', title: 'pg_stat_statements', subtitle: 'Query statistics', status: 'Enabled', tone: 'success', meta: ['performance', 'preloaded'], icon: Activity },
      { id: 'ext-2', title: 'vector', subtitle: 'pgvector • embeddings', status: 'Enabled', tone: 'success', meta: ['HNSW', 'IVFFlat'], icon: Sparkles },
      { id: 'ext-3', title: 'pg_cron', subtitle: 'Database scheduler', status: 'Enabled', tone: 'cyan', meta: ['12 jobs', 'UTC'], icon: TimerReset },
      { id: 'ext-4', title: 'postgis', subtitle: 'Geospatial types & indexes', status: 'Available', tone: 'neutral', meta: ['GiST', 'geography'], icon: Globe2 }
    ]
  },
  {
    id: 'cron-queues',
    label: 'Cron & Queues',
    icon: TimerReset,
    description: 'Jobs agendados, filas duráveis, retries e dead-letter queues simulados para automações orientadas a dados.',
    actionLabel: 'Novo job/fila',
    actionPlaceholder: 'ex: nightly_cleanup',
    items: [
      { id: 'cron-1', title: 'nightly_cleanup', subtitle: '0 3 * * * • SQL job', status: 'Ativo', tone: 'success', meta: ['última 03:00', '38ms'], icon: TimerReset },
      { id: 'cron-2', title: 'refresh_revenue_mv', subtitle: '*/15 * * * * • REFRESH VIEW', status: 'Ativo', tone: 'success', meta: ['materialized view', '15 min'], icon: RefreshCw },
      { id: 'queue-1', title: 'email_delivery', subtitle: 'Durable queue', status: 'Healthy', tone: 'cyan', meta: ['1.4K pending', 'retry x5'], icon: Boxes },
      { id: 'queue-2', title: 'webhook_dlq', subtitle: 'Dead-letter queue', status: 'Attention', tone: 'warning', meta: ['18 messages', 'manual replay'], icon: AlertTriangle }
    ]
  },
  {
    id: 'replication',
    label: 'Replication & CDC',
    icon: RadioTower,
    description: 'Logical replication, CDC, publications, database webhooks e read replicas para scale-out e integração de dados.',
    actionLabel: 'Nova publicação',
    actionPlaceholder: 'ex: analytics_cdc',
    items: [
      { id: 'repl-1', title: 'brisabase_realtime', subtitle: 'Logical publication', status: 'Streaming', tone: 'success', meta: ['users', 'orders', 'messages'], icon: RadioTower },
      { id: 'repl-2', title: 'Read replica • us-east-1', subtitle: 'Cross-region read only', status: 'Healthy', tone: 'success', meta: ['lag 86ms', 'auto route'], icon: ServerCog },
      { id: 'repl-3', title: 'analytics_cdc', subtitle: 'WAL → warehouse', status: 'Streaming', tone: 'cyan', meta: ['LSN current', 'exactly-once target'], icon: Network },
      { id: 'repl-4', title: 'orders webhook', subtitle: 'INSERT/UPDATE → HTTPS', status: 'Healthy', tone: 'cyan', meta: ['HMAC', 'retry policy'], icon: Webhook }
    ]
  },
  {
    id: 'performance',
    label: 'Performance',
    icon: Activity,
    description: 'Slow queries, query plan, index advisor, locks, cache hit ratio e recomendações de tuning em modo simulado.',
    actionLabel: 'Analisar workload',
    actionPlaceholder: 'ex: checkout workload',
    items: [
      { id: 'perf-1', title: 'Slow query #81f2', subtitle: 'orders JOIN order_items • 1.84s', status: 'Needs index', tone: 'warning', meta: ['18K calls/day', 'seq scan'], icon: AlertTriangle },
      { id: 'perf-2', title: 'Index advisor', subtitle: '3 recommendations', status: 'Ready', tone: 'cyan', meta: ['-74% estimated cost', 'review SQL'], icon: SearchCode },
      { id: 'perf-3', title: 'Buffer cache hit', subtitle: '99.4%', status: 'Healthy', tone: 'success', meta: ['shared buffers', '24h'], icon: Gauge },
      { id: 'perf-4', title: 'Lock monitor', subtitle: '2 waiting transactions', status: 'Watching', tone: 'neutral', meta: ['max wait 42ms', 'no deadlocks'], icon: Activity }
    ]
  },
  {
    id: 'migrations',
    label: 'Migrations',
    icon: GitBranch,
    description: 'Fluxo simulado de versionamento de schema com diff, apply, rollback e histórico.',
    actionLabel: 'Nova migration',
    actionPlaceholder: 'ex: add_order_discount',
    items: [
      { id: 'mig-1', title: '20260827_add_orders_status', subtitle: '+ status enum • + index composto', status: 'Aplicada', tone: 'success', meta: ['production', 'Lucas M.'], icon: GitBranch },
      { id: 'mig-2', title: '20260826_add_product_tags', subtitle: '+ tags text[] • + GIN index', status: 'Aplicada', tone: 'success', meta: ['production', 'CLI v0.8'], icon: GitBranch },
      { id: 'mig-3', title: '20260827_customer_profile', subtitle: '+ 4 campos • ~ 0 drops', status: 'Pendente', tone: 'warning', meta: ['staging', 'Diff revisado'], icon: GitBranch }
    ]
  },
  {
    id: 'backups',
    label: 'Backups & Restore',
    icon: ArchiveRestore,
    description: 'Backups automáticos, snapshots manuais, restauração e PITR representados no console.',
    actionLabel: 'Criar snapshot',
    actionPlaceholder: 'ex: pre-release-v2.4',
    items: [
      { id: 'backup-1', title: 'Snapshot diário • 27/08 03:00', subtitle: 'Banco completo • 4.8 GB', status: 'Verificado', tone: 'success', meta: ['Retenção 30 dias', 'checksum OK'], icon: ArchiveRestore },
      { id: 'backup-2', title: 'Snapshot pré-release v2.4', subtitle: 'Banco + metadata • 4.7 GB', status: 'Verificado', tone: 'success', meta: ['Manual', 'Restore testado'], icon: ArchiveRestore },
      { id: 'backup-3', title: 'PITR', subtitle: 'Janela contínua de recuperação', status: 'Ativo', tone: 'cyan', meta: ['Últimos 7 dias', 'RPO < 5 min'], icon: TimerReset }
    ]
  },
  {
    id: 'import-export',
    label: 'Import / Export',
    icon: UploadCloud,
    description: 'Simule importação e exportação por JSON, CSV e SQL, incluindo migração assistida de outros BaaS.',
    actionLabel: 'Nova importação',
    actionPlaceholder: 'ex: Firebase customers export',
    items: [
      { id: 'imp-1', title: 'Firebase Firestore → BrisaDB', subtitle: '1.2M documentos mapeados', status: 'Pronto', tone: 'success', meta: ['0 conflitos', 'schema inferido'], icon: UploadCloud },
      { id: 'imp-2', title: 'Supabase PostgreSQL dump', subtitle: '42 tabelas • 18 policies', status: 'Simulado', tone: 'cyan', meta: ['SQL', 'RLS mapeado'], icon: Database },
      { id: 'imp-3', title: 'Exportação completa', subtitle: 'JSON + blobs manifest', status: 'Disponível', tone: 'neutral', meta: ['4.9 GB', 'expira em 24h'], icon: Cloud }
    ]
  },
  {
    id: 'object-storage',
    label: 'Object Storage+',
    icon: HardDrive,
    description: 'Camada avançada simulada de buckets, signed URLs, multipart upload, CORS, lifecycle e transformação de imagens.',
    actionLabel: 'Novo bucket',
    actionPlaceholder: 'ex: private-documents',
    items: [
      { id: 'bucket-public', title: 'public-assets', subtitle: 'Public bucket • CDN enabled', status: 'Ativo', tone: 'success', meta: ['CORS 3 origins', 'cache 1y'], icon: HardDrive },
      { id: 'bucket-private', title: 'private-documents', subtitle: 'Private bucket • signed URLs', status: 'Ativo', tone: 'success', meta: ['URL TTL 15m', 'owner policy'], icon: LockKeyhole },
      { id: 'bucket-video', title: 'media-uploads', subtitle: 'Multipart upload • 5 GB max', status: 'Ativo', tone: 'cyan', meta: ['chunk 10 MB', 'resume enabled'], icon: UploadCloud },
      { id: 'bucket-transform', title: 'Image transformations', subtitle: 'resize • crop • WebP/AVIF', status: 'Enabled', tone: 'purple', meta: ['on-the-fly', 'edge cached'], icon: Sparkles },
      { id: 'bucket-lifecycle', title: 'Lifecycle rule', subtitle: 'backups/** → archive after 30d', status: 'Enabled', tone: 'cyan', meta: ['delete after 365d'], icon: ArchiveRestore },
      { id: 'bucket-s3', title: 'S3 Compatibility', subtitle: 'AWS Signature V4 • S3 clients', status: 'Enabled', tone: 'success', meta: ['presigned URLs', 'interoperable API'], icon: Cloud },
      { id: 'bucket-tus', title: 'TUS Resumable Uploads', subtitle: 'Resume large uploads after interruption', status: 'Enabled', tone: 'success', meta: ['progress events', 'direct hostname'], icon: UploadCloud },
      { id: 'bucket-cdn', title: 'Storage CDN', subtitle: 'Global edge cache', status: 'Enabled', tone: 'cyan', meta: ['cache control', 'purge mock'], icon: Globe2 }
    ]
  },
  {
    id: 'vector-ai',
    label: 'Vector & AI',
    icon: Sparkles,
    description: 'Índices vetoriais, embeddings, busca semântica e pipelines AI como módulo simulado de dados.',
    actionLabel: 'Novo índice vetorial',
    actionPlaceholder: 'ex: product_embeddings',
    items: [
      { id: 'vec-1', title: 'product_embeddings', subtitle: '1536 dims • cosine', status: 'Ativo', tone: 'success', meta: ['84K vectors', '11ms p95'], icon: Sparkles },
      { id: 'vec-2', title: 'support_knowledge', subtitle: '3072 dims • cosine', status: 'Ativo', tone: 'success', meta: ['12K chunks', 'RAG ready'], icon: WandSparkles },
      { id: 'vec-3', title: 'Embedding pipeline', subtitle: 'documents.created → vectorize', status: 'Ativo', tone: 'cyan', meta: ['batch 100', 'retry x3'], icon: Workflow }
    ]
  }
];

const securityTabs: ModuleTab[] = [
  {
    id: 'identity',
    label: 'Identity',
    icon: UsersRound,
    description: 'Providers, sessões, MFA, redirects, templates e limites de autenticação em um único mock.',
    actionLabel: 'Adicionar provider',
    actionPlaceholder: 'ex: Microsoft Entra ID',
    items: [
      { id: 'id-email', title: 'E-mail & Senha', subtitle: 'Provider principal', status: 'Ativo', tone: 'success', meta: ['Reset habilitado', 'Sessão 30 dias'], icon: Mail },
      { id: 'id-google', title: 'Google OAuth', subtitle: 'OAuth 2.0 / OIDC', status: 'Ativo', tone: 'success', meta: ['2 redirect URLs', 'PKCE'], icon: Globe2 },
      { id: 'id-mfa', title: 'MFA', subtitle: 'TOTP + Recovery Codes', status: 'Opcional', tone: 'cyan', meta: ['Admins obrigatório', 'Usuários opt-in'], icon: Smartphone },
      { id: 'id-session', title: 'Session policy', subtitle: 'Refresh token rotation', status: 'Ativo', tone: 'success', meta: ['30d max', '10 sessões/user'], icon: TimerReset },
      { id: 'id-email-templates', title: 'Templates transacionais', subtitle: 'Reset, convite, magic link', status: 'Configurado', tone: 'cyan', meta: ['Português BR', 'Preview disponível'], icon: Mail },
      { id: 'id-passwordless', title: 'Magic Link & E-mail OTP', subtitle: 'Passwordless authentication', status: 'Ativo', tone: 'success', meta: ['6-digit OTP', 'link TTL 15m'], icon: Mail },
      { id: 'id-phone', title: 'Phone / SMS OTP', subtitle: 'Passwordless + MFA factor', status: 'Sandbox', tone: 'cyan', meta: ['Brasil', 'anti-abuse'], icon: Smartphone },
      { id: 'id-passkeys', title: 'Passkeys / WebAuthn', subtitle: 'Biometric & hardware-backed sign-in', status: 'Preview', tone: 'purple', meta: ['FIDO2', 'platform + security keys'], icon: KeyRound },
      { id: 'id-anonymous', title: 'Anonymous / Guest Sessions', subtitle: 'Guest → full account upgrade', status: 'Ativo', tone: 'success', meta: ['session migration', 'cart-safe'], icon: UsersRound },
      { id: 'id-enterprise', title: 'Enterprise SSO', subtitle: 'SAML 2.0 + OIDC', status: 'Configurado', tone: 'purple', meta: ['2 domains', 'JIT provisioning'], icon: ShieldCheck },
      { id: 'id-custom-token', title: 'Custom / Third-party JWT', subtitle: 'External identity federation', status: 'Ready', tone: 'cyan', meta: ['JWKS', 'custom claims'], icon: KeyRound },
      { id: 'id-hooks', title: 'Auth Hooks', subtitle: 'Before signup • custom claims • MFA decisions', status: 'Simulado', tone: 'neutral', meta: ['DB function', 'webhook'], icon: Workflow }
    ]
  },
  {
    id: 'policies',
    label: 'Policies / RLS',
    icon: ShieldCheck,
    description: 'Policies simuladas por tabela, bucket e função, com avaliação de acesso e preview de regras.',
    actionLabel: 'Nova policy',
    actionPlaceholder: 'ex: orders_owner_read',
    items: [
      { id: 'pol-1', title: 'orders_owner_read', subtitle: 'orders • SELECT', status: 'Enforced', tone: 'success', meta: ['auth.uid = user_id', 'p95 +0.4ms'], icon: ShieldCheck },
      { id: 'pol-2', title: 'profiles_self_update', subtitle: 'profiles • UPDATE', status: 'Enforced', tone: 'success', meta: ['auth.uid = id'], icon: ShieldCheck },
      { id: 'pol-3', title: 'avatars_public_read', subtitle: 'storage/avatars • READ', status: 'Enforced', tone: 'cyan', meta: ['public read', 'write owner-only'], icon: HardDrive }
    ],
    code: `allow select on orders\nwhen auth.uid == row.user_id;\n\nallow update on profiles\nwhen auth.uid == row.id;`
  },
  {
    id: 'roles',
    label: 'RBAC',
    icon: KeyRound,
    description: 'Papéis, scopes e permissões simulados para projetos, recursos e ambientes.',
    actionLabel: 'Novo papel',
    actionPlaceholder: 'ex: Support Agent',
    items: [
      { id: 'role-owner', title: 'Owner', subtitle: 'Acesso total à organização', status: 'Sistema', tone: 'purple', meta: ['24 permissions', '2 members'], icon: KeyRound },
      { id: 'role-dev', title: 'Developer', subtitle: 'Build, deploy e leitura de dados', status: 'Ativo', tone: 'success', meta: ['15 permissions', '8 members'], icon: Code2 },
      { id: 'role-support', title: 'Support', subtitle: 'Auth + logs sem dados sensíveis', status: 'Ativo', tone: 'cyan', meta: ['8 permissions', '4 members'], icon: UsersRound }
    ]
  },
  {
    id: 'protection',
    label: 'App Protection',
    icon: Shield,
    description: 'App attestation, rate limits, anti-abuse, CORS, IP rules e proteção contra tráfego automatizado.',
    actionLabel: 'Nova regra',
    actionPlaceholder: 'ex: login_rate_limit',
    items: [
      { id: 'prot-1', title: 'App Attestation', subtitle: 'Web + Android + iOS', status: 'Monitorando', tone: 'cyan', meta: ['97.8% verified', '3 apps'], icon: Shield },
      { id: 'prot-2', title: 'Auth rate limit', subtitle: '20 tentativas / 10 min / IP', status: 'Enforced', tone: 'success', meta: ['312 bloqueios hoje'], icon: Gauge },
      { id: 'prot-3', title: 'CORS policy', subtitle: '3 origens permitidas', status: 'Enforced', tone: 'success', meta: ['credentials on'], icon: Network },
      { id: 'prot-4', title: 'WAF managed rules', subtitle: 'OWASP baseline', status: 'Simulado', tone: 'primary', meta: ['SQLi', 'XSS', 'bots'], icon: ShieldCheck }
    ]
  },
  {
    id: 'secrets',
    label: 'Secrets Vault',
    icon: LockKeyhole,
    description: 'Segredos versionados e variáveis sensíveis com escopo por ambiente e serviço.',
    actionLabel: 'Novo secret',
    actionPlaceholder: 'ex: STRIPE_SECRET_KEY',
    items: [
      { id: 'sec-1', title: 'STRIPE_SECRET_KEY', subtitle: 'functions • production', status: 'Protegido', tone: 'success', meta: ['rotacionado há 12 dias', 'v4'], icon: LockKeyhole },
      { id: 'sec-2', title: 'RESEND_API_KEY', subtitle: 'messaging • production', status: 'Protegido', tone: 'success', meta: ['v2', 'masked'], icon: LockKeyhole },
      { id: 'sec-3', title: 'GITHUB_DEPLOY_TOKEN', subtitle: 'hosting • staging', status: 'Expira em 8d', tone: 'warning', meta: ['v1', 'rotation alert'], icon: LockKeyhole }
    ]
  },
  {
    id: 'service-accounts',
    label: 'Service Accounts',
    icon: KeyRound,
    description: 'Identidades de máquina simuladas para CI/CD, servidores e automações com scopes, expiração e rotação de credenciais.',
    actionLabel: 'Nova service account',
    actionPlaceholder: 'ex: github-production-deploy',
    items: [
      { id: 'svc-1', title: 'github-production-deploy', subtitle: 'CI/CD machine identity', status: 'Ativa', tone: 'success', meta: ['deploy:write', 'secrets:read'], icon: KeyRound },
      { id: 'svc-2', title: 'analytics-worker', subtitle: 'Server workload', status: 'Ativa', tone: 'success', meta: ['database:read', 'expires 90d'], icon: ServerCog },
      { id: 'svc-3', title: 'backup-automation', subtitle: 'Scheduled operations', status: 'Rotação em 12d', tone: 'warning', meta: ['backup:write', 'IP restricted'], icon: ArchiveRestore }
    ]
  },
  {
    id: 'compliance',
    label: 'Compliance & Governance',
    icon: ShieldCheck,
    description: 'Residência de dados, retenção, export/delete requests, políticas de privacidade e evidências de compliance em modo mock.',
    actionLabel: 'Nova política',
    actionPlaceholder: 'ex: LGPD customer-data',
    items: [
      { id: 'cmp-1', title: 'Data Residency', subtitle: 'Primary region • São Paulo', status: 'Enforced', tone: 'success', meta: ['sa-east', 'no cross-region writes'], icon: Globe2 },
      { id: 'cmp-2', title: 'LGPD / GDPR Requests', subtitle: 'Export + erase workflow', status: 'Ready', tone: 'success', meta: ['DSAR queue', 'audit trail'], icon: UsersRound },
      { id: 'cmp-3', title: 'Retention Policy', subtitle: 'Logs 30d • backups 35d', status: 'Configured', tone: 'cyan', meta: ['legal hold mock', 'auto purge'], icon: ArchiveRestore },
      { id: 'cmp-4', title: 'Compliance Center', subtitle: 'SOC 2 / ISO 27001 readiness', status: 'Mock evidence', tone: 'purple', meta: ['controls', 'evidence exports'], icon: ShieldCheck }
    ]
  },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: Activity,
    description: 'Histórico imutável simulado de alterações administrativas e ações sensíveis.',
    actionLabel: 'Exportar auditoria',
    actionPlaceholder: 'ex: Auditoria agosto 2026',
    items: [
      { id: 'aud-1', title: 'Policy atualizada', subtitle: 'orders_owner_read • Lucas Moreira', status: 'Success', tone: 'success', meta: ['15:42:11', '177.44.21.90'], icon: ShieldCheck },
      { id: 'aud-2', title: 'Secret rotacionado', subtitle: 'STRIPE_SECRET_KEY • CI Bot', status: 'Success', tone: 'success', meta: ['14:18:02', 'API'], icon: LockKeyhole },
      { id: 'aud-3', title: 'Tentativa de elevar papel', subtitle: 'Viewer → Admin • bloqueada', status: 'Blocked', tone: 'danger', meta: ['13:02:49', 'policy denied'], icon: AlertTriangle }
    ]
  }
];

const environmentTabs: ModuleTab[] = [
  {
    id: 'environments',
    label: 'Ambientes',
    icon: CloudCog,
    description: 'Ambientes isolados simulados para development, staging e production, com variáveis e serviços próprios.',
    actionLabel: 'Novo ambiente',
    actionPlaceholder: 'ex: qa',
    items: [
      { id: 'env-prod', title: 'Production', subtitle: 'sa-east-1 • 6 serviços', status: 'Saudável', tone: 'success', meta: ['protected', 'auto backups'], icon: CloudCog },
      { id: 'env-stage', title: 'Staging', subtitle: 'sa-east-1 • espelho de schema', status: 'Saudável', tone: 'success', meta: ['seed data', 'preview auth'], icon: CloudCog },
      { id: 'env-dev', title: 'Development', subtitle: 'local + cloud sandbox', status: 'Ativo', tone: 'cyan', meta: ['debug logs', 'free quota'], icon: Laptop }
    ]
  },
  {
    id: 'branches',
    label: 'Branches',
    icon: GitBranch,
    description: 'Branches de banco e configuração para cada feature, com merge/diff e expiração automática.',
    actionLabel: 'Nova branch',
    actionPlaceholder: 'ex: feat/new-checkout',
    items: [
      { id: 'br-1', title: 'feat/checkout-v3', subtitle: 'base: staging • 2 migrations', status: 'Ready', tone: 'success', meta: ['PR #248', 'expira 3d'], icon: GitBranch },
      { id: 'br-2', title: 'feat/ai-search', subtitle: 'base: staging • vector index', status: 'Ready', tone: 'success', meta: ['PR #251', '2.1 GB'], icon: GitBranch },
      { id: 'br-3', title: 'fix/auth-session', subtitle: 'base: production • policy diff', status: 'Review', tone: 'warning', meta: ['PR #252', 'protected'], icon: GitBranch }
    ]
  },
  {
    id: 'previews',
    label: 'Preview Deploys',
    icon: Rocket,
    description: 'Preview completo por branch com URLs, banco isolado, funções e variáveis de ambiente.',
    actionLabel: 'Gerar preview',
    actionPlaceholder: 'ex: checkout-v3-preview',
    items: [
      { id: 'pv-1', title: 'checkout-v3-pr-248', subtitle: 'preview-248.brisa.app', status: 'Online', tone: 'success', meta: ['DB branch linked', 'Functions 4'], icon: Rocket },
      { id: 'pv-2', title: 'ai-search-pr-251', subtitle: 'preview-251.brisa.app', status: 'Online', tone: 'success', meta: ['Vector ready', 'TTL 72h'], icon: Rocket }
    ]
  },
  {
    id: 'reliability',
    label: 'HA & Disaster Recovery',
    icon: CloudCog,
    description: 'Alta disponibilidade, failover, disaster recovery, manutenção e testes de recuperação representados no mock.',
    actionLabel: 'Novo recovery plan',
    actionPlaceholder: 'ex: production-dr-plan',
    items: [
      { id: 'ha-1', title: 'Multi-AZ Database', subtitle: 'Primary + synchronous standby', status: 'Healthy', tone: 'success', meta: ['automatic failover', 'RPO ~0'], icon: Database },
      { id: 'ha-2', title: 'Disaster Recovery', subtitle: 'São Paulo → Virginia', status: 'Ready', tone: 'success', meta: ['RPO 5 min', 'RTO 20 min'], icon: ArchiveRestore },
      { id: 'ha-3', title: 'Recovery Drill', subtitle: 'Quarterly restore test', status: 'Passed', tone: 'cyan', meta: ['last 12 Aug', '14m 22s'], icon: CheckCircle2 },
      { id: 'ha-4', title: 'Maintenance Window', subtitle: 'Sunday 03:00–05:00 BRT', status: 'Configured', tone: 'neutral', meta: ['notifications 72h', 'auto minor updates'], icon: TimerReset }
    ]
  },
  {
    id: 'promotion',
    label: 'Promotion',
    icon: Workflow,
    description: 'Pipeline simulado de promoção de mudanças com checks, aprovação e rollback.',
    actionLabel: 'Novo pipeline',
    actionPlaceholder: 'ex: staging-to-production',
    items: [
      { id: 'pipe-1', title: 'Staging → Production', subtitle: '6 checks • 2 approvals', status: 'Protegido', tone: 'purple', meta: ['Schema diff', 'Smoke tests'], icon: Workflow },
      { id: 'pipe-2', title: 'Dev → Staging', subtitle: '3 checks • auto promote', status: 'Ativo', tone: 'success', meta: ['lint', 'migrations', 'seed'], icon: Workflow }
    ]
  }
];

const developerTabs: ModuleTab[] = [
  {
    id: 'sdks',
    label: 'SDKs',
    icon: PackageCheck,
    description: 'SDKs simulados com instalação, versões, snippets e compatibilidade por plataforma.',
    actionLabel: 'Gerar client SDK',
    actionPlaceholder: 'ex: admin-typescript',
    items: [
      { id: 'sdk-js', title: '@brisabase/js', subtitle: 'JavaScript / TypeScript', status: 'v1.0.0', tone: 'success', meta: ['Web', 'Node', 'React Native'], icon: PackageCheck },
      { id: 'sdk-flutter', title: 'brisabase_flutter', subtitle: 'Dart / Flutter', status: 'v0.7.2', tone: 'success', meta: ['iOS', 'Android', 'Web'], icon: Smartphone },
      { id: 'sdk-python', title: 'brisabase-py', subtitle: 'Python', status: 'v0.6.1', tone: 'success', meta: ['Server', 'Async'], icon: Code2 },
      { id: 'sdk-swift', title: 'BrisaBase Swift', subtitle: 'Swift / iOS / macOS', status: 'v0.5.0', tone: 'cyan', meta: ['async/await', 'Codable'], icon: Smartphone },
      { id: 'sdk-kotlin', title: 'brisabase-kotlin', subtitle: 'Kotlin / Android', status: 'v0.5.0', tone: 'cyan', meta: ['Coroutines', 'Android'], icon: Smartphone },
      { id: 'sdk-go', title: 'brisabase-go', subtitle: 'Go server SDK', status: 'v0.4.3', tone: 'cyan', meta: ['Admin', 'Context'], icon: Code2 }
    ],
    code: `import { createClient } from '@brisabase/js'\n\nconst brisa = createClient({\n  projectId: 'proj_7K2A',\n  key: 'brisa_pk_live_••••••'\n})\n\nconst { data } = await brisa.db.from('orders').select('*')`
  },
  {
    id: 'cli',
    label: 'CLI',
    icon: Command,
    description: 'Comandos CLI simulados para login, link, dev, migrations, deploy, logs e secrets.',
    actionLabel: 'Criar comando salvo',
    actionPlaceholder: 'ex: deploy staging',
    items: [
      { id: 'cli-1', title: 'brisa dev', subtitle: 'Inicia stack local + dashboard', status: 'Disponível', tone: 'success', meta: ['DB', 'Auth', 'Storage', 'Functions'], icon: SquareTerminal },
      { id: 'cli-2', title: 'brisa db push', subtitle: 'Aplica migrations pendentes', status: 'Disponível', tone: 'success', meta: ['diff preview', '--dry-run'], icon: SquareTerminal },
      { id: 'cli-3', title: 'brisa functions deploy', subtitle: 'Deploy seletivo de funções', status: 'Disponível', tone: 'success', meta: ['--env', '--no-verify'], icon: SquareTerminal }
    ],
    code: `$ npm i -g @brisabase/cli\n$ brisa login\n$ brisa link proj_7K2A\n$ brisa dev\n\n✓ Database emulator :54321\n✓ Auth emulator     :54322\n✓ Storage emulator  :54323\n✓ Functions runtime :54324`
  },
  {
    id: 'emulator',
    label: 'Local Emulator',
    icon: Laptop,
    description: 'Stack local simulada para desenvolvimento offline com seed, reset e inspeção de serviços.',
    actionLabel: 'Nova stack local',
    actionPlaceholder: 'ex: checkout-local',
    items: [
      { id: 'emu-db', title: 'Database Emulator', subtitle: 'localhost:54321', status: 'Running', tone: 'success', meta: ['seeded', '42 collections'], icon: Database },
      { id: 'emu-auth', title: 'Auth Emulator', subtitle: 'localhost:54322', status: 'Running', tone: 'success', meta: ['18 fake users', 'email inbox'], icon: UsersRound },
      { id: 'emu-storage', title: 'Storage Emulator', subtitle: 'localhost:54323', status: 'Running', tone: 'success', meta: ['2 buckets', '312 MB'], icon: HardDrive },
      { id: 'emu-fn', title: 'Functions Emulator', subtitle: 'localhost:54324', status: 'Running', tone: 'success', meta: ['hot reload', '4 functions'], icon: Code2 }
    ]
  },
  {
    id: 'api-explorer',
    label: 'API Explorer',
    icon: Globe2,
    description: 'REST, Realtime e GraphQL playground simulados com auth, payload, headers e response inspector.',
    actionLabel: 'Salvar request',
    actionPlaceholder: 'ex: List recent orders',
    items: [
      { id: 'req-1', title: 'GET /v1/orders', subtitle: 'REST • public client', status: '200 OK', tone: 'success', meta: ['34ms', '128 KB'], icon: Globe2 },
      { id: 'req-2', title: 'POST /v1/functions/notify', subtitle: 'Function invoke', status: '200 OK', tone: 'success', meta: ['82ms', '2.1 KB'], icon: Zap },
      { id: 'req-3', title: 'WS /realtime/orders', subtitle: 'Realtime channel', status: 'Connected', tone: 'cyan', meta: ['21 events/min'], icon: RadioTower },
      { id: 'req-4', title: 'GraphQL Playground', subtitle: 'Schema introspection + query explorer', status: 'Ready', tone: 'purple', meta: ['typed schema', 'auth headers'], icon: Braces },
      { id: 'req-5', title: 'OpenAPI 3.1', subtitle: 'Generated REST specification', status: 'Generated', tone: 'success', meta: ['download JSON/YAML', 'SDK generation'], icon: FileCode2 },
      { id: 'req-6', title: 'Database RPC', subtitle: 'Invoke SQL functions over API', status: 'Ready', tone: 'cyan', meta: ['typed params', 'policy aware'], icon: Zap }
    ]
  },
  {
    id: 'type-generation',
    label: 'Type Generation',
    icon: Braces,
    description: 'Geração simulada de tipos e modelos a partir do schema do banco para SDKs e aplicações cliente.',
    actionLabel: 'Gerar tipos',
    actionPlaceholder: 'ex: web-typescript',
    items: [
      { id: 'types-ts', title: 'TypeScript Types', subtitle: 'Database schema → database.types.ts', status: 'Generated', tone: 'success', meta: ['42 tables', '12 enums'], icon: Braces },
      { id: 'types-dart', title: 'Dart Models', subtitle: 'Schema → typed models', status: 'Generated', tone: 'success', meta: ['null safety', 'JSON serializers'], icon: Smartphone },
      { id: 'types-swift', title: 'Swift Models', subtitle: 'Schema → Codable structs', status: 'Ready', tone: 'cyan', meta: ['relationships', 'enums'], icon: Smartphone }
    ],
    code: `$ brisa gen types typescript --project proj_7K2A > src/database.types.ts

✓ 42 tables
✓ 12 enums
✓ 8 database functions
✓ Generated in 312ms`
  },
  {
    id: 'iac',
    label: 'Infrastructure as Code',
    icon: FileCode2,
    description: 'Terraform/Pulumi e configuração declarativa simulados para projetos, policies, buckets, functions e ambientes.',
    actionLabel: 'Gerar configuração',
    actionPlaceholder: 'ex: production-terraform',
    items: [
      { id: 'iac-1', title: 'BrisaBase Terraform Provider', subtitle: 'Projects • Auth • Storage • Functions', status: 'v0.4 mock', tone: 'success', meta: ['plan/apply', 'state import'], icon: FileCode2 },
      { id: 'iac-2', title: 'Pulumi Package', subtitle: 'TypeScript / Python IaC', status: 'Preview', tone: 'cyan', meta: ['typed resources', 'stack outputs'], icon: Code2 },
      { id: 'iac-3', title: 'Config Export', subtitle: 'Dashboard → declarative YAML', status: 'Ready', tone: 'success', meta: ['diffable', 'secrets masked'], icon: Workflow }
    ],
    code: `resource "brisabase_bucket" "avatars" {
  project_id = "proj_7K2A"
  name       = "avatars"
  public     = true
}`
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Workflow,
    description: 'Marketplace simulado de integrações, connectors e extensões para eventos, observabilidade, pagamentos e data pipelines.',
    actionLabel: 'Adicionar integração',
    actionPlaceholder: 'ex: Stripe',
    items: [
      { id: 'int-1', title: 'GitHub', subtitle: 'Deploys + preview environments', status: 'Connected', tone: 'success', meta: ['2 repos', 'checks enabled'], icon: GitBranch },
      { id: 'int-2', title: 'Stripe', subtitle: 'Webhooks + Functions templates', status: 'Available', tone: 'cyan', meta: ['signed webhooks', 'starter kit'], icon: Zap },
      { id: 'int-3', title: 'OpenTelemetry', subtitle: 'Logs, metrics and traces export', status: 'Connected', tone: 'success', meta: ['OTLP', 'sampling 20%'], icon: Activity },
      { id: 'int-4', title: 'Data Warehouse', subtitle: 'CDC connector', status: 'Available', tone: 'neutral', meta: ['streaming', 'batch'], icon: Database }
    ]
  },
  {
    id: 'runtime-ops',
    label: 'Runtime Ops',
    icon: ServerCog,
    description: 'Deployments, execuções, triggers, cron, domínios e runtimes de Functions simulados em uma visão operacional.',
    actionLabel: 'Novo trigger',
    actionPlaceholder: 'ex: order_created_webhook',
    items: [
      { id: 'rt-dep', title: 'Deployment fn_20260827_1842', subtitle: '4 functions • Node 20', status: 'Active', tone: 'success', meta: ['commit 8a1d02f', '48s'], icon: Rocket },
      { id: 'rt-cron', title: 'daily-report', subtitle: '0 9 * * * • sendDailyReport', status: 'Enabled', tone: 'success', meta: ['next 09:00', 'UTC-3'], icon: TimerReset },
      { id: 'rt-event', title: 'orders.created', subtitle: '→ processOrder', status: 'Enabled', tone: 'cyan', meta: ['retry x3', 'DLQ enabled'], icon: Workflow },
      { id: 'rt-domain', title: 'api.minhaempresa.com', subtitle: '→ public functions gateway', status: 'Verified', tone: 'success', meta: ['TLS auto', 'Edge'], icon: Globe2 }
    ]
  }
];

const hostingTabs: ModuleTab[] = [
  {
    id: 'sites',
    label: 'Sites',
    icon: Globe2,
    description: 'Sites estáticos/SSR simulados conectados a Git ou upload manual, com preview e rollback.',
    actionLabel: 'Novo site',
    actionPlaceholder: 'ex: dashboard-web',
    items: [
      { id: 'site-1', title: 'brisa-store-web', subtitle: 'Next.js • main', status: 'Online', tone: 'success', meta: ['brisa-store.brisa.app', 'SSR'], icon: Globe2 },
      { id: 'site-2', title: 'docs', subtitle: 'VitePress • main', status: 'Online', tone: 'success', meta: ['docs.brisabase.dev', 'Static'], icon: Globe2 },
      { id: 'site-3', title: 'admin-preview', subtitle: 'React • staging', status: 'Preview', tone: 'cyan', meta: ['TTL 48h', 'protected'], icon: Globe2 }
    ]
  },
  {
    id: 'domains',
    label: 'Domains & SSL',
    icon: Network,
    description: 'Domínios customizados, DNS, certificados automáticos, redirects e headers de segurança.',
    actionLabel: 'Adicionar domínio',
    actionPlaceholder: 'ex: app.minhaempresa.com',
    items: [
      { id: 'dom-1', title: 'app.brisastore.com.br', subtitle: 'CNAME → edge.brisabase.dev', status: 'Verified', tone: 'success', meta: ['TLS auto', 'HSTS'], icon: Network },
      { id: 'dom-2', title: 'api.brisastore.com.br', subtitle: 'Functions gateway', status: 'Verified', tone: 'success', meta: ['TLS 1.3', 'WAF'], icon: Network },
      { id: 'dom-3', title: 'www.brisastore.com.br', subtitle: 'Redirect → app', status: 'Active', tone: 'cyan', meta: ['301 permanent'], icon: Network }
    ]
  },
  {
    id: 'deployments',
    label: 'Deployments',
    icon: Rocket,
    description: 'Histórico simulado de deploys, builds, previews, rollback e integração Git.',
    actionLabel: 'Deploy manual',
    actionPlaceholder: 'ex: release-v2.4.0',
    items: [
      { id: 'dep-1', title: 'production • 8a1d02f', subtitle: 'main • Lucas Moreira', status: 'Ready', tone: 'success', meta: ['41s build', '2m ago'], icon: Rocket },
      { id: 'dep-2', title: 'preview • pr-252', subtitle: 'fix/auth-session', status: 'Ready', tone: 'success', meta: ['37s build', '18m ago'], icon: Rocket },
      { id: 'dep-3', title: 'production • 98b0a11', subtitle: 'rollback candidate', status: 'Previous', tone: 'neutral', meta: ['instant rollback'], icon: RefreshCw }
    ]
  },
  {
    id: 'edge',
    label: 'Edge & CDN',
    icon: Cloud,
    description: 'CDN, cache rules, image optimization e headers no edge como experiência simulada de hosting.',
    actionLabel: 'Nova cache rule',
    actionPlaceholder: 'ex: static-assets-1y',
    items: [
      { id: 'edge-1', title: 'Global CDN', subtitle: '28 PoPs simulados', status: 'Enabled', tone: 'success', meta: ['94.1% cache hit', '38ms p95'], icon: Cloud },
      { id: 'edge-2', title: 'Image Optimization', subtitle: 'WebP/AVIF + resize', status: 'Enabled', tone: 'success', meta: ['1.8 TB saved/mo'], icon: Sparkles },
      { id: 'edge-3', title: 'Static assets cache', subtitle: '/assets/** • max-age=31536000', status: 'Enabled', tone: 'cyan', meta: ['immutable'], icon: Cloud }
    ]
  }
];

const messagingTabs: ModuleTab[] = [
  {
    id: 'channels',
    label: 'Canais',
    icon: BellRing,
    description: 'Push, e-mail e SMS simulados com providers, credentials e health checks.',
    actionLabel: 'Adicionar canal',
    actionPlaceholder: 'ex: Transactional SMS',
    items: [
      { id: 'ch-push', title: 'Push Notifications', subtitle: 'Web + Android + iOS', status: 'Ativo', tone: 'success', meta: ['248K devices', '98.7% delivered'], icon: BellRing },
      { id: 'ch-email', title: 'Transactional Email', subtitle: 'Brisa Mail Provider', status: 'Ativo', tone: 'success', meta: ['SPF/DKIM OK', '99.2% delivered'], icon: Mail },
      { id: 'ch-sms', title: 'SMS', subtitle: 'Provider sandbox', status: 'Sandbox', tone: 'cyan', meta: ['Brasil', 'OTP enabled'], icon: MessageSquareText }
    ]
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: FileCode2,
    description: 'Templates reutilizáveis com variáveis, preview e versionamento para mensagens transacionais.',
    actionLabel: 'Novo template',
    actionPlaceholder: 'ex: order-shipped',
    items: [
      { id: 'tpl-1', title: 'welcome-user', subtitle: 'E-mail • pt-BR', status: 'Published', tone: 'success', meta: ['v8', '{{user.name}}'], icon: Mail },
      { id: 'tpl-2', title: 'order-shipped', subtitle: 'Push + E-mail', status: 'Published', tone: 'success', meta: ['v4', '2 channels'], icon: BellRing },
      { id: 'tpl-3', title: 'otp-login', subtitle: 'SMS • 6 digits', status: 'Published', tone: 'cyan', meta: ['TTL 5 min'], icon: Smartphone }
    ]
  },
  {
    id: 'campaigns',
    label: 'Campanhas',
    icon: RadioTower,
    description: 'Segmentação, agendamento, A/B e métricas de campanha em modo totalmente simulado.',
    actionLabel: 'Nova campanha',
    actionPlaceholder: 'ex: Setembro Pro Upgrade',
    items: [
      { id: 'camp-1', title: 'Novidades v2.4', subtitle: 'Push • 82K usuários', status: 'Enviada', tone: 'success', meta: ['42.8% open', '1.8% conversion'], icon: RadioTower },
      { id: 'camp-2', title: 'Reativação 30 dias', subtitle: 'E-mail • segmento inativo', status: 'Agendada', tone: 'cyan', meta: ['03/09 10:00', '18K recipients'], icon: Mail },
      { id: 'camp-3', title: 'Trial ending', subtitle: 'E-mail + Push', status: 'Automação', tone: 'purple', meta: ['event-driven', '7d / 1d'], icon: Workflow }
    ]
  },
  {
    id: 'remote-config',
    label: 'Remote Config',
    icon: CloudCog,
    description: 'Configurações remotas simuladas por ambiente, plataforma e segmento sem novo deploy.',
    actionLabel: 'Nova configuração',
    actionPlaceholder: 'ex: checkout_timeout_ms',
    items: [
      { id: 'rc-1', title: 'checkout_v3_enabled', subtitle: 'boolean • production', status: 'true', tone: 'success', meta: ['Web 100%', 'Mobile 40%'], icon: CloudCog },
      { id: 'rc-2', title: 'max_cart_items', subtitle: 'number • all', status: '50', tone: 'cyan', meta: ['default 30', 'VIP 100'], icon: CloudCog },
      { id: 'rc-3', title: 'support_banner', subtitle: 'json • web', status: 'Published', tone: 'cyan', meta: ['v12', 'cache 60s'], icon: CloudCog }
    ]
  },
  {
    id: 'flags',
    label: 'Feature Flags',
    icon: Flag,
    description: 'Rollouts percentuais, segmentos, kill-switch e experimentação de features em mock.',
    actionLabel: 'Nova flag',
    actionPlaceholder: 'ex: ai_search',
    items: [
      { id: 'flag-1', title: 'checkout_v3', subtitle: 'production rollout', status: '40%', tone: 'cyan', meta: ['Brazil 60%', 'kill-switch ready'], icon: Flag },
      { id: 'flag-2', title: 'ai_search', subtitle: 'beta users', status: '10%', tone: 'purple', meta: ['2.4K users', 'A/B active'], icon: Flag },
      { id: 'flag-3', title: 'new_dashboard', subtitle: 'internal only', status: '100%', tone: 'success', meta: ['team segment'], icon: Flag }
    ]
  }
];


const usageTabs: ModuleTab[] = [
  {
    id: 'overview',
    label: 'Metering',
    icon: Gauge,
    description: 'Medição simulada de requests, egress, banco, storage, functions, realtime e mensagens.',
    actionLabel: 'Criar relatório',
    actionPlaceholder: 'ex: Agosto 2026 - Engenharia',
    items: [
      { id: 'meter-req', title: 'API Requests', subtitle: '18.4M neste ciclo', status: '62%', tone: 'cyan', meta: ['limite 30M', '+8.4%'], icon: Globe2 },
      { id: 'meter-db', title: 'Database Compute', subtitle: '412 horas compute', status: '51%', tone: 'cyan', meta: ['limite 800h', 'peak 2.8 vCPU'], icon: Database },
      { id: 'meter-storage', title: 'Storage', subtitle: '186.4 GB armazenados', status: '37%', tone: 'cyan', meta: ['limite 500 GB', 'egress 1.2 TB'], icon: HardDrive },
      { id: 'meter-fn', title: 'Functions', subtitle: '6.8M execuções', status: '68%', tone: 'warning', meta: ['limite 10M', '412 GB-s'], icon: Code2 }
    ]
  },
  {
    id: 'quotas',
    label: 'Quotas',
    icon: Gauge,
    description: 'Limites simulados por projeto e serviço com soft/hard limit e burst control.',
    actionLabel: 'Nova quota',
    actionPlaceholder: 'ex: staging-functions-limit',
    items: [
      { id: 'qt-1', title: 'Auth MAU', subtitle: '250K / 500K', status: '50%', tone: 'cyan', meta: ['soft 80%', 'hard 100%'], icon: UsersRound },
      { id: 'qt-2', title: 'Realtime Connections', subtitle: '12.8K / 25K concurrent', status: '51%', tone: 'cyan', meta: ['burst 30K'], icon: RadioTower },
      { id: 'qt-3', title: 'Function Concurrency', subtitle: '640 / 1,000', status: '64%', tone: 'warning', meta: ['queue enabled'], icon: ServerCog }
    ]
  },
  {
    id: 'observability',
    label: 'APM & Traces',
    icon: Activity,
    description: 'Performance, distributed traces, crash/error tracking, uptime e service health em um painel operacional simulado.',
    actionLabel: 'Novo monitor',
    actionPlaceholder: 'ex: checkout-api-uptime',
    items: [
      { id: 'obs-trace', title: 'Distributed Tracing', subtitle: 'API → DB → Function → Webhook', status: 'Sampling 20%', tone: 'cyan', meta: ['18.2K traces/h', 'p95 184ms'], icon: Activity },
      { id: 'obs-errors', title: 'Error Tracking', subtitle: 'Frontend + Functions', status: 'Healthy', tone: 'success', meta: ['0.18% error rate', '12 unresolved'], icon: AlertTriangle },
      { id: 'obs-perf', title: 'Performance Monitoring', subtitle: 'Web vitals + backend latency', status: 'Active', tone: 'success', meta: ['LCP 1.7s', 'API p95 142ms'], icon: Gauge },
      { id: 'obs-uptime', title: 'Uptime Monitors', subtitle: '8 endpoints • 5 regions', status: '99.99%', tone: 'success', meta: ['30s interval', '0 incidents'], icon: Globe2 },
      { id: 'obs-retention', title: 'Telemetry retention', subtitle: 'logs 30d • traces 14d • metrics 90d', status: 'Configured', tone: 'neutral', meta: ['export enabled'], icon: ArchiveRestore }
    ]
  },
  {
    id: 'alerts',
    label: 'Alerts',
    icon: BellRing,
    description: 'Alertas simulados de consumo, orçamento, latência, erro e disponibilidade.',
    actionLabel: 'Novo alerta',
    actionPlaceholder: 'ex: Functions > 80%',
    items: [
      { id: 'al-1', title: 'Budget 80%', subtitle: 'Gasto mensal projetado', status: 'Armed', tone: 'success', meta: ['E-mail + Slack', 'R$ 1.840'], icon: BellRing },
      { id: 'al-2', title: 'Functions error > 2%', subtitle: '5 min rolling window', status: 'Armed', tone: 'success', meta: ['Pager + E-mail'], icon: AlertTriangle },
      { id: 'al-3', title: 'Storage egress > 1.5 TB', subtitle: 'ciclo mensal', status: 'Armed', tone: 'success', meta: ['E-mail'], icon: BellRing }
    ]
  },
  {
    id: 'incidents',
    label: 'Incidents & Status',
    icon: AlertTriangle,
    description: 'Incidentes, service health, status page, comunicação e postmortems simulados para operação de produção.',
    actionLabel: 'Novo incidente',
    actionPlaceholder: 'ex: Elevated database latency',
    items: [
      { id: 'inc-1', title: 'Service Health', subtitle: '12/12 services operational', status: 'Operational', tone: 'success', meta: ['global', 'updated now'], icon: CheckCircle2 },
      { id: 'inc-2', title: 'Public Status Page', subtitle: 'status.brisabase.dev', status: 'Published', tone: 'success', meta: ['RSS', 'webhook subscribers'], icon: Globe2 },
      { id: 'inc-3', title: 'INC-2026-014', subtitle: 'Database latency • resolved', status: 'Postmortem', tone: 'cyan', meta: ['18 min', '5 Aug 2026'], icon: Activity },
      { id: 'inc-4', title: 'Maintenance Notice', subtitle: 'Database minor upgrade', status: 'Scheduled', tone: 'neutral', meta: ['30 Aug', '03:00 BRT'], icon: TimerReset }
    ]
  },
  {
    id: 'cost-controls',
    label: 'Cost Controls',
    icon: ShieldCheck,
    description: 'Orçamentos, bloqueios de burst e controles preventivos simulados para evitar surpresas de custo.',
    actionLabel: 'Novo budget',
    actionPlaceholder: 'ex: Production R$ 2500',
    items: [
      { id: 'cost-1', title: 'Production budget', subtitle: 'R$ 1.840 / R$ 2.500', status: '73%', tone: 'warning', meta: ['forecast R$ 2.230'], icon: ShieldCheck },
      { id: 'cost-2', title: 'Preview environments cap', subtitle: 'R$ 300 / month', status: 'Healthy', tone: 'success', meta: ['auto-pause after TTL'], icon: ShieldCheck },
      { id: 'cost-3', title: 'Egress hard cap', subtitle: '2 TB / month', status: 'Enabled', tone: 'success', meta: ['alert at 75%'], icon: ShieldCheck }
    ]
  }
];



const experimentsTabs: ModuleTab[] = [
  {
    id: 'ab-testing',
    label: 'A/B Testing',
    icon: Flag,
    description: 'Experimentos A/B e multivariados simulados com variantes, métricas primárias, guardrails e significância estatística.',
    actionLabel: 'Novo experimento',
    actionPlaceholder: 'ex: checkout-cta-color',
    items: [
      { id: 'exp-1', title: 'checkout-cta-color', subtitle: 'A: blue • B: cyan • 50/50', status: 'Running', tone: 'success', meta: ['conversion +6.4%', '42K users'], icon: Flag },
      { id: 'exp-2', title: 'pricing-copy-v2', subtitle: 'Control + 2 variants', status: 'Draft', tone: 'neutral', meta: ['revenue/user', 'guardrail: churn'], icon: WandSparkles },
      { id: 'exp-3', title: 'onboarding-short', subtitle: 'Remote Config experiment', status: 'Winner B', tone: 'cyan', meta: ['retention +3.1%', '95% confidence'], icon: CheckCircle2 }
    ]
  },
  {
    id: 'audiences',
    label: 'Audiences',
    icon: UsersRound,
    description: 'Segmentos reutilizáveis para experimentos, flags, campanhas e personalização com regras simuladas.',
    actionLabel: 'Nova audiência',
    actionPlaceholder: 'ex: power-users-br',
    items: [
      { id: 'aud-1', title: 'New users • Brazil', subtitle: 'country=BR AND account_age<7d', status: '84K', tone: 'cyan', meta: ['dynamic', 'analytics synced'], icon: UsersRound },
      { id: 'aud-2', title: 'Pro customers', subtitle: 'plan IN (pro,business)', status: '12.4K', tone: 'success', meta: ['billing attribute', 'real-time'], icon: UsersRound },
      { id: 'aud-3', title: 'High churn risk', subtitle: 'score > 0.72', status: '8.1K', tone: 'warning', meta: ['ML segment', 'daily refresh'], icon: UsersRound }
    ]
  },
  {
    id: 'rollouts',
    label: 'Progressive Rollouts',
    icon: Rocket,
    description: 'Rollouts graduais com percentuais, cohorts, rollback automático e comparação com grupo de controle.',
    actionLabel: 'Novo rollout',
    actionPlaceholder: 'ex: new-search-10pct',
    items: [
      { id: 'roll-1', title: 'new-search', subtitle: '35% → target 100%', status: 'Healthy', tone: 'success', meta: ['auto-pause on errors', 'control 10%'], icon: Rocket },
      { id: 'roll-2', title: 'edge-cache-v2', subtitle: '10% production traffic', status: 'Monitoring', tone: 'cyan', meta: ['p95 -18ms', '0 regressions'], icon: Gauge },
      { id: 'roll-3', title: 'checkout-v4', subtitle: '5% paid users', status: 'Paused', tone: 'warning', meta: ['guardrail triggered', 'manual review'], icon: AlertTriangle }
    ]
  },
  {
    id: 'personalization',
    label: 'Personalization',
    icon: Sparkles,
    description: 'Personalização simulada por objetivo com seleção automática de variante e exploração controlada.',
    actionLabel: 'Nova personalização',
    actionPlaceholder: 'ex: home-hero-personalized',
    items: [
      { id: 'per-1', title: 'Home hero', subtitle: 'Optimize: session depth', status: 'Learning', tone: 'purple', meta: ['4 variants', 'epsilon 8%'], icon: Sparkles },
      { id: 'per-2', title: 'Upgrade prompt', subtitle: 'Optimize: conversion', status: 'Active', tone: 'success', meta: ['3 segments', '+4.8% lift'], icon: WandSparkles }
    ]
  },
  {
    id: 'experiment-metrics',
    label: 'Metrics & Guardrails',
    icon: BarChart3,
    description: 'Catálogo de métricas, eventos, funis e guardrails que podem ser usados para decidir experimentos.',
    actionLabel: 'Nova métrica',
    actionPlaceholder: 'ex: paid_conversion_7d',
    items: [
      { id: 'met-1', title: 'Paid conversion 7d', subtitle: 'Primary metric', status: 'Ready', tone: 'success', meta: ['event-based', '7d window'], icon: BarChart3 },
      { id: 'met-2', title: 'Crash-free sessions', subtitle: 'Guardrail', status: '99.94%', tone: 'success', meta: ['quality signal'], icon: ShieldCheck },
      { id: 'met-3', title: 'API error rate', subtitle: 'Guardrail', status: '0.18%', tone: 'cyan', meta: ['5 min rolling'], icon: Activity }
    ]
  }
];

const appQualityTabs: ModuleTab[] = [
  {
    id: 'distribution',
    label: 'App Distribution',
    icon: UploadCloud,
    description: 'Distribuição simulada de builds iOS/Android para grupos de testers com release notes, expiração e feedback.',
    actionLabel: 'Nova distribuição',
    actionPlaceholder: 'ex: android-2.8.0-beta.4',
    items: [
      { id: 'dist-1', title: 'Android 2.8.0-beta.4', subtitle: 'AAB • 84.2 MB', status: 'Distributed', tone: 'success', meta: ['48 testers', 'release notes'], icon: Smartphone },
      { id: 'dist-2', title: 'iOS 2.8.0 (412)', subtitle: 'IPA • 92.1 MB', status: 'Processing', tone: 'cyan', meta: ['Internal QA', 'expires 30d'], icon: Smartphone },
      { id: 'dist-3', title: 'Android 2.7.9-hotfix', subtitle: 'APK • 78.4 MB', status: 'Archived', tone: 'neutral', meta: ['12 testers', 'signed'], icon: ArchiveRestore }
    ]
  },
  {
    id: 'testers',
    label: 'Testers & Groups',
    icon: UsersRound,
    description: 'Gestão de testers, grupos, convites, dispositivos e acesso às builds distribuídas.',
    actionLabel: 'Novo grupo',
    actionPlaceholder: 'ex: beta-customers-br',
    items: [
      { id: 'tg-1', title: 'Internal QA', subtitle: '18 testers', status: 'Active', tone: 'success', meta: ['iOS + Android', 'auto-enroll'], icon: UsersRound },
      { id: 'tg-2', title: 'Beta Customers', subtitle: '240 testers', status: 'Active', tone: 'success', meta: ['opt-in', 'feedback enabled'], icon: UsersRound },
      { id: 'tg-3', title: 'Design Review', subtitle: '9 testers', status: 'Restricted', tone: 'purple', meta: ['iOS only'], icon: UsersRound }
    ]
  },
  {
    id: 'test-lab',
    label: 'Test Lab',
    icon: Smartphone,
    description: 'Matriz simulada de testes em dispositivos virtuais/reais, versões de OS, idiomas e orientações.',
    actionLabel: 'Novo teste',
    actionPlaceholder: 'ex: checkout-regression',
    items: [
      { id: 'lab-1', title: 'Checkout regression', subtitle: '24 devices • Android/iOS', status: '22 passed', tone: 'warning', meta: ['2 failed', 'screenshots'], icon: Smartphone },
      { id: 'lab-2', title: 'Smoke • Pixel matrix', subtitle: '8 Android configs', status: 'Passed', tone: 'success', meta: ['12m 08s', 'video'], icon: CheckCircle2 },
      { id: 'lab-3', title: 'iOS localization', subtitle: '6 devices • pt-BR/es/en', status: 'Queued', tone: 'cyan', meta: ['UI test', '3 locales'], icon: Smartphone }
    ]
  },
  {
    id: 'quality-gates',
    label: 'Quality Gates',
    icon: ShieldCheck,
    description: 'Regras simuladas de promoção que combinam testes, crash-free, performance e coverage antes de liberar uma build.',
    actionLabel: 'Novo gate',
    actionPlaceholder: 'ex: production-mobile-gate',
    items: [
      { id: 'qg-1', title: 'Production mobile gate', subtitle: '5 required checks', status: 'Enforced', tone: 'success', meta: ['crash-free >99.8%', 'tests 100%'], icon: ShieldCheck },
      { id: 'qg-2', title: 'Beta gate', subtitle: '3 required checks', status: 'Enforced', tone: 'success', meta: ['smoke tests', 'LCP <2.5s'], icon: ShieldCheck }
    ]
  },
  {
    id: 'feedback',
    label: 'Feedback & Diagnostics',
    icon: MessageSquareText,
    description: 'Feedback de testers vinculado à build, dispositivo, screenshot, logs e sessão de diagnóstico simulada.',
    actionLabel: 'Novo ticket',
    actionPlaceholder: 'ex: checkout-freeze-pixel8',
    items: [
      { id: 'fb-1', title: 'Checkout freezes after Pix', subtitle: 'Pixel 8 • Android 16', status: 'Investigating', tone: 'warning', meta: ['video attached', 'logs linked'], icon: MessageSquareText },
      { id: 'fb-2', title: 'Keyboard overlaps form', subtitle: 'iPhone 15 • iOS 19', status: 'Fixed', tone: 'success', meta: ['build 413', 'tester confirmed'], icon: CheckCircle2 }
    ]
  }
];

const searchAiTabs: ModuleTab[] = [
  {
    id: 'search',
    label: 'Search',
    icon: SearchCode,
    description: 'Search dedicado simulado com full-text, typo tolerance, facets, ranking, synonyms e filtros de segurança.',
    actionLabel: 'Novo índice',
    actionPlaceholder: 'ex: products-search',
    items: [
      { id: 'sea-1', title: 'products-search', subtitle: '1.8M documents • 12 fields', status: 'Healthy', tone: 'success', meta: ['p95 28ms', 'facets 6'], icon: SearchCode },
      { id: 'sea-2', title: 'docs-search', subtitle: '84K documents', status: 'Healthy', tone: 'success', meta: ['typo tolerant', 'synonyms 42'], icon: SearchCode },
      { id: 'sea-3', title: 'users-admin-search', subtitle: 'restricted index', status: 'Policy protected', tone: 'purple', meta: ['RBAC filtered', 'audit enabled'], icon: ShieldCheck }
    ]
  },
  {
    id: 'hybrid',
    label: 'Hybrid & Semantic',
    icon: Sparkles,
    description: 'Busca híbrida combinando keyword, full-text e vector similarity com reranking simulado.',
    actionLabel: 'Nova pipeline',
    actionPlaceholder: 'ex: docs-hybrid-rag',
    items: [
      { id: 'hy-1', title: 'Docs hybrid search', subtitle: 'BM25 + vector + rerank', status: 'Active', tone: 'success', meta: ['topK 40', 'rerank 10'], icon: Sparkles },
      { id: 'hy-2', title: 'Product similarity', subtitle: 'text + image embeddings', status: 'Active', tone: 'success', meta: ['HNSW', 'cosine'], icon: Network },
      { id: 'hy-3', title: 'Support semantic search', subtitle: 'tickets + docs', status: 'Indexing', tone: 'cyan', meta: ['68%', 'chunking v3'], icon: Sparkles }
    ]
  },
  {
    id: 'ai-gateway',
    label: 'AI Gateway',
    icon: ServerCog,
    description: 'Gateway simulado para modelos com provider routing, fallback, rate limits, caching, budgets e logs por request.',
    actionLabel: 'Nova rota de IA',
    actionPlaceholder: 'ex: support-assistant-prod',
    items: [
      { id: 'aig-1', title: 'support-assistant-prod', subtitle: 'Primary model + fallback', status: 'Healthy', tone: 'success', meta: ['p95 1.8s', 'cache 21%'], icon: ServerCog },
      { id: 'aig-2', title: 'embeddings-default', subtitle: 'Embedding provider route', status: 'Healthy', tone: 'success', meta: ['batching', 'budget cap'], icon: Sparkles },
      { id: 'aig-3', title: 'vision-moderation', subtitle: 'Vision provider route', status: 'Limited', tone: 'warning', meta: ['50 rpm', 'fallback enabled'], icon: ServerCog }
    ]
  },
  {
    id: 'rag',
    label: 'RAG Pipelines',
    icon: Workflow,
    description: 'Pipelines simuladas de ingestão, chunking, embeddings, retrieval, reranking e generation com observabilidade.',
    actionLabel: 'Nova RAG pipeline',
    actionPlaceholder: 'ex: help-center-rag',
    items: [
      { id: 'rag-1', title: 'Help Center RAG', subtitle: 'Drive → chunk → embed → index', status: 'Active', tone: 'success', meta: ['18K chunks', 'daily sync'], icon: Workflow },
      { id: 'rag-2', title: 'Product catalog RAG', subtitle: 'DB changes → embedding queue', status: 'Active', tone: 'success', meta: ['CDC trigger', 'dead-letter'], icon: Workflow }
    ]
  },
  {
    id: 'evals',
    label: 'AI Evals',
    icon: Gauge,
    description: 'Datasets, avaliações offline/online, regression suites, quality scores, latency e cost tracking simulados.',
    actionLabel: 'Nova avaliação',
    actionPlaceholder: 'ex: support-answer-quality',
    items: [
      { id: 'ev-1', title: 'Support answer quality', subtitle: '500 golden cases', status: '92.4%', tone: 'success', meta: ['faithfulness', 'relevance'], icon: Gauge },
      { id: 'ev-2', title: 'RAG regression suite', subtitle: '120 queries', status: 'Passing', tone: 'success', meta: ['nightly', 'cost tracked'], icon: CheckCircle2 },
      { id: 'ev-3', title: 'Prompt v18 vs v19', subtitle: 'paired evaluation', status: 'Running', tone: 'cyan', meta: ['38%', 'human review'], icon: WandSparkles }
    ]
  }
];

const enterpriseTabs: ModuleTab[] = [
  {
    id: 'organizations',
    label: 'Organizations',
    icon: UsersRound,
    description: 'Organizações multi-tenant simuladas com owners, billing account, policies globais e projetos agrupados.',
    actionLabel: 'Nova organização',
    actionPlaceholder: 'ex: Acme Brasil',
    items: [
      { id: 'org-1', title: 'Brisa Studio', subtitle: '12 projects • 18 members', status: 'Business', tone: 'success', meta: ['central billing', 'SSO optional'], icon: UsersRound },
      { id: 'org-2', title: 'Acme Brasil', subtitle: '4 projects • 26 members', status: 'Enterprise', tone: 'purple', meta: ['SSO enforced', 'SCIM'], icon: UsersRound }
    ]
  },
  {
    id: 'workspaces',
    label: 'Workspaces & Teams',
    icon: Boxes,
    description: 'Workspaces, teams, memberships, custom roles e escopos organizacionais para colaboração em escala.',
    actionLabel: 'Novo workspace',
    actionPlaceholder: 'ex: Commerce Platform',
    items: [
      { id: 'ws-1', title: 'Commerce Platform', subtitle: '6 projects • 9 members', status: 'Active', tone: 'success', meta: ['custom roles', 'shared secrets'], icon: Boxes },
      { id: 'ws-2', title: 'Growth', subtitle: '3 projects • 7 members', status: 'Active', tone: 'success', meta: ['analyst role', 'experiment access'], icon: Boxes },
      { id: 'ws-3', title: 'External Agency', subtitle: '2 projects • 5 guests', status: 'Restricted', tone: 'warning', meta: ['time-boxed access', 'no billing'], icon: ShieldCheck }
    ]
  },
  {
    id: 'scim',
    label: 'SCIM Provisioning',
    icon: RefreshCw,
    description: 'Provisionamento e desprovisionamento simulado de usuários e grupos via SCIM 2.0 com sync e dry-run.',
    actionLabel: 'Nova conexão SCIM',
    actionPlaceholder: 'ex: entra-production',
    items: [
      { id: 'scim-1', title: 'Microsoft Entra ID', subtitle: 'Users + groups provisioning', status: 'Synced', tone: 'success', meta: ['126 users', '8 groups'], icon: RefreshCw },
      { id: 'scim-2', title: 'Okta Workforce', subtitle: 'Staging organization', status: 'Dry run', tone: 'cyan', meta: ['32 users', 'no writes'], icon: RefreshCw }
    ]
  },
  {
    id: 'siem',
    label: 'SIEM & Security Export',
    icon: Webhook,
    description: 'Export simulado de audit/security events para SIEM, data lake e SOC com signing, retries e filtering.',
    actionLabel: 'Novo export',
    actionPlaceholder: 'ex: splunk-security-events',
    items: [
      { id: 'siem-1', title: 'Splunk HEC', subtitle: 'Audit + auth + WAF events', status: 'Connected', tone: 'success', meta: ['signed', 'retry queue'], icon: Webhook },
      { id: 'siem-2', title: 'Datadog Security', subtitle: 'Security events stream', status: 'Connected', tone: 'success', meta: ['OTLP/HTTPS', 'filtered'], icon: Activity },
      { id: 'siem-3', title: 'S3 Audit Archive', subtitle: 'Immutable daily export', status: 'Active', tone: 'cyan', meta: ['365d retention', 'WORM mock'], icon: ArchiveRestore }
    ]
  },
  {
    id: 'enterprise-access',
    label: 'Enterprise Access',
    icon: KeyRound,
    description: 'Políticas empresariais simuladas para SSO enforcement, domain capture, session lifetime e break-glass access.',
    actionLabel: 'Nova política',
    actionPlaceholder: 'ex: require-sso-brisa.com',
    items: [
      { id: 'ea-1', title: 'Require SSO', subtitle: '@acme.com members', status: 'Enforced', tone: 'success', meta: ['SAML', '2 break-glass admins'], icon: ShieldCheck },
      { id: 'ea-2', title: 'Domain capture', subtitle: 'acme.com', status: 'Verified', tone: 'success', meta: ['auto-join disabled'], icon: Globe2 },
      { id: 'ea-3', title: 'Admin session policy', subtitle: '8h max • MFA every 24h', status: 'Enforced', tone: 'success', meta: ['IP condition', 'device trust'], icon: KeyRound }
    ]
  },
  {
    id: 'support',
    label: 'Support & SLA',
    icon: MessageSquareText,
    description: 'Enterprise support mock com SLA, named contacts, escalation, architectural reviews e ticket history.',
    actionLabel: 'Novo caso',
    actionPlaceholder: 'ex: production-latency-p1',
    items: [
      { id: 'sup-1', title: 'Enterprise SLA', subtitle: 'P1 response < 30 min', status: 'Active', tone: 'success', meta: ['24x7', 'named TAM'], icon: ShieldCheck },
      { id: 'sup-2', title: 'Architecture Review', subtitle: 'Quarterly technical review', status: 'Scheduled', tone: 'cyan', meta: ['12 Sep', 'capacity planning'], icon: MessageSquareText },
      { id: 'sup-3', title: 'CASE-1842', subtitle: 'Realtime latency investigation', status: 'Resolved', tone: 'success', meta: ['P2', '42 min'], icon: CheckCircle2 }
    ]
  }
];

const moduleConfigs: Record<ModuleId, ModuleConfig> = {
  'data-platform': {
    title: 'Data Platform',
    subtitle: 'Schema, índices, Query Studio, migrations, backups, import/export e busca vetorial — tudo simulado para fechar o desenho da camada de dados.',
    badge: 'Mock Data Plane',
    badgeTone: 'cyan',
    icon: Database,
    primaryAction: 'Novo recurso de dados',
    stats: [
      { label: 'Schemas', value: '42', helper: '+3 este mês', icon: Database },
      { label: 'Índices', value: '128', helper: '99.2% healthy', icon: SearchCode },
      { label: 'Backups', value: '30d', helper: 'PITR 7 dias', icon: ArchiveRestore },
      { label: 'Vectors', value: '96K', helper: '11ms p95', icon: Sparkles }
    ],
    tabs: dataPlatformTabs
  },
  security: {
    title: 'Identity & Security',
    subtitle: 'Providers, MFA, sessões, RBAC, policies, app protection, secrets e auditoria representados antes da implementação real.',
    badge: 'Security Mock',
    badgeTone: 'success',
    icon: ShieldCheck,
    primaryAction: 'Nova regra de segurança',
    stats: [
      { label: 'Policies', value: '36', helper: '100% enforced', icon: ShieldCheck },
      { label: 'Providers', value: '4', helper: 'OIDC ready', icon: UsersRound },
      { label: 'Threat blocks', value: '312', helper: 'últimas 24h', icon: Shield },
      { label: 'Secrets', value: '18', helper: '0 expostos', icon: LockKeyhole }
    ],
    tabs: securityTabs
  },
  environments: {
    title: 'Environments & Branching',
    subtitle: 'Ambientes isolados, database branches, previews e promotion pipelines para modelar o fluxo Dev → Staging → Production.',
    badge: 'Preview Infrastructure',
    badgeTone: 'purple',
    icon: GitBranch,
    primaryAction: 'Novo ambiente',
    stats: [
      { label: 'Ambientes', value: '3', helper: 'isolados', icon: CloudCog },
      { label: 'Branches', value: '7', helper: '3 previews', icon: GitBranch },
      { label: 'Preview URLs', value: '5', helper: 'TTL automático', icon: Rocket },
      { label: 'Checks', value: '11', helper: 'pipeline protected', icon: Workflow }
    ],
    tabs: environmentTabs
  },
  'developer-tools': {
    title: 'SDK, CLI & Developer Tools',
    subtitle: 'SDKs, CLI, emuladores locais, API Explorer e Runtime Ops para que o BrisaBase possa ser usado fora do console.',
    badge: 'Developer Experience',
    badgeTone: 'primary',
    icon: Code2,
    primaryAction: 'Gerar integração',
    stats: [
      { label: 'SDKs', value: '6', helper: '3 stable', icon: PackageCheck },
      { label: 'CLI', value: 'v0.8', helper: '12 comandos', icon: Command },
      { label: 'Emulators', value: '4', helper: 'todos running', icon: Laptop },
      { label: 'API latency', value: '34ms', helper: 'p50 mock', icon: Globe2 }
    ],
    tabs: developerTabs
  },
  hosting: {
    title: 'Hosting & Edge',
    subtitle: 'Sites, domínios, SSL, deployments, Git, CDN e cache representados como produto de entrega integrado ao BrisaBase.',
    badge: 'Edge Delivery Mock',
    badgeTone: 'cyan',
    icon: Globe2,
    primaryAction: 'Novo site',
    stats: [
      { label: 'Sites', value: '3', helper: '2 production', icon: Globe2 },
      { label: 'Deploys', value: '148', helper: '99.3% success', icon: Rocket },
      { label: 'CDN hit', value: '94.1%', helper: '28 PoPs', icon: Cloud },
      { label: 'TLS', value: '100%', helper: 'auto-renew', icon: ShieldCheck }
    ],
    tabs: hostingTabs
  },
  messaging: {
    title: 'Messaging & Remote Config',
    subtitle: 'Push, e-mail, SMS, templates, campanhas, Remote Config e Feature Flags em uma experiência simulada de engagement.',
    badge: 'Engagement Mock',
    badgeTone: 'purple',
    icon: BellRing,
    primaryAction: 'Nova automação',
    stats: [
      { label: 'Devices', value: '248K', helper: 'push reachable', icon: Smartphone },
      { label: 'Delivery', value: '98.7%', helper: 'últimos 7 dias', icon: BellRing },
      { label: 'Templates', value: '24', helper: '3 channels', icon: FileCode2 },
      { label: 'Flags', value: '18', helper: '4 rollouts', icon: Flag }
    ],
    tabs: messagingTabs
  },
  experiments: {
    title: 'Experiments & Personalization',
    subtitle: 'A/B testing, audiences, progressive rollouts, personalization e guardrails para validar mudanças antes do rollout completo.',
    badge: 'Experimentation Mock',
    badgeTone: 'purple',
    icon: Flag,
    primaryAction: 'Novo experimento',
    stats: [
      { label: 'Experimentos', value: '7', helper: '3 running', icon: Flag },
      { label: 'Users exposed', value: '128K', helper: 'últimos 30d', icon: UsersRound },
      { label: 'Winning lifts', value: '+5.2%', helper: 'média', icon: BarChart3 },
      { label: 'Rollouts', value: '4', helper: '1 paused', icon: Rocket }
    ],
    tabs: experimentsTabs
  },
  'app-quality': {
    title: 'App Quality & Distribution',
    subtitle: 'Distribuição de builds, testers, Test Lab, quality gates e feedback para fechar o ciclo de entrega mobile.',
    badge: 'Quality Mock',
    badgeTone: 'success',
    icon: Smartphone,
    primaryAction: 'Nova build',
    stats: [
      { label: 'Builds', value: '38', helper: '8 beta', icon: UploadCloud },
      { label: 'Testers', value: '267', helper: '3 grupos', icon: UsersRound },
      { label: 'Device runs', value: '1.8K', helper: '98.6% pass', icon: Smartphone },
      { label: 'Crash-free', value: '99.94%', helper: 'latest beta', icon: ShieldCheck }
    ],
    tabs: appQualityTabs
  },
  'search-ai': {
    title: 'Search & AI Platform',
    subtitle: 'Search dedicado, busca híbrida, AI Gateway, RAG pipelines e avaliações para aplicações modernas com IA.',
    badge: 'AI/Search Mock',
    badgeTone: 'cyan',
    icon: Sparkles,
    primaryAction: 'Novo recurso AI/Search',
    stats: [
      { label: 'Search QPS', value: '2.4K', helper: 'p95 28ms', icon: SearchCode },
      { label: 'Vectors', value: '1.9M', helper: '3 indexes', icon: Network },
      { label: 'AI requests', value: '418K', helper: '30d', icon: Sparkles },
      { label: 'Eval score', value: '92.4%', helper: 'golden set', icon: Gauge }
    ],
    tabs: searchAiTabs
  },
  enterprise: {
    title: 'Enterprise & Organizations',
    subtitle: 'Organizations, workspaces, SCIM, SIEM, enterprise access e SLA para representar operação de equipes maiores.',
    badge: 'Enterprise Mock',
    badgeTone: 'primary',
    icon: UsersRound,
    primaryAction: 'Novo recurso enterprise',
    stats: [
      { label: 'Organizations', value: '2', helper: '1 enterprise', icon: UsersRound },
      { label: 'Members', value: '44', helper: '6 custom roles', icon: UsersRound },
      { label: 'SCIM users', value: '158', helper: '2 IdPs', icon: RefreshCw },
      { label: 'SIEM exports', value: '3', helper: 'all healthy', icon: Webhook }
    ],
    tabs: enterpriseTabs
  },
  usage: {
    title: 'Usage, Quotas & Cost Control',
    subtitle: 'Metering de serviços, quotas, budgets e alertas para simular a camada necessária de operação e billing do BaaS.',
    badge: 'Metering Mock',
    badgeTone: 'warning',
    icon: Gauge,
    primaryAction: 'Novo controle',
    stats: [
      { label: 'Requests', value: '18.4M', helper: '62% da quota', icon: Globe2 },
      { label: 'Storage', value: '186 GB', helper: '37% da quota', icon: HardDrive },
      { label: 'Functions', value: '6.8M', helper: '68% da quota', icon: Code2 },
      { label: 'Forecast', value: 'R$ 2.230', helper: 'budget R$ 2.500', icon: Gauge }
    ],
    tabs: usageTabs
  }
};

interface PlatformExpansionProps {
  module: ModuleId;
}

interface StoredCustomResources {
  [module: string]: {
    [tab: string]: ResourceItem[];
  };
}

const STORAGE_KEY = 'brisabase_platform_expansion_v1';

function scopedStorageKey(projectId?: string) {
  return `${STORAGE_KEY}:${projectId || 'default'}`;
}

function readCustomResources(projectId?: string): StoredCustomResources {
  try {
    const scoped = localStorage.getItem(scopedStorageKey(projectId));
    if (scoped) return JSON.parse(scoped);
    // Compatibilidade com a versão anterior do mock.
    const legacy = localStorage.getItem(STORAGE_KEY);
    return legacy ? JSON.parse(legacy) : {};
  } catch {
    return {};
  }
}

export const PlatformExpansion: React.FC<PlatformExpansionProps> = ({ module }) => {
  const config = moduleConfigs[module];
  const { activeProject, showToast } = useApp();
  const [activeTab, setActiveTab] = useState(config.tabs[0].id);
  const [customResources, setCustomResources] = useState<StoredCustomResources>(() => readCustomResources(activeProject?.id));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resourceName, setResourceName] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    setCustomResources(readCustomResources(activeProject?.id));
  }, [activeProject?.id]);

  const activeTabConfig = config.tabs.find((tab) => tab.id === activeTab) || config.tabs[0];
  const customForTab = customResources[module]?.[activeTab] || [];
  const displayedItems = useMemo(
    () => [...customForTab, ...activeTabConfig.items],
    [customForTab, activeTabConfig.items]
  );

  const persistCustom = (next: StoredCustomResources) => {
    setCustomResources(next);
    localStorage.setItem(scopedStorageKey(activeProject?.id), JSON.stringify(next));
  };

  const createResource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceName.trim()) return;

    const nextItem: ResourceItem = {
      id: `custom-${Date.now()}`,
      title: resourceName.trim(),
      subtitle: `${activeTabConfig.label} • criado em modo simulado`,
      status: 'Simulado',
      tone: 'cyan',
      meta: ['localStorage', activeProject?.name || 'Projeto atual'],
      icon: activeTabConfig.icon
    };

    const next: StoredCustomResources = {
      ...customResources,
      [module]: {
        ...(customResources[module] || {}),
        [activeTab]: [nextItem, ...customForTab]
      }
    };
    persistCustom(next);
    setResourceName('');
    setIsCreateOpen(false);
    showToast('Recurso simulado criado', `${nextItem.title} foi adicionado ao mock de ${activeTabConfig.label}.`, 'success');
  };

  const runSimulation = (item: ResourceItem) => {
    setRunningId(item.id);
    window.setTimeout(() => {
      setRunningId(null);
      showToast('Simulação concluída', `${item.title}: operação executada sem alterar infraestrutura real.`, 'success');
    }, 550);
  };

  const Icon = config.icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        badge={<Badge variant={config.badgeTone} dot>{config.badge}</Badge>}
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {config.primaryAction}
          </Button>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {config.stats.map((stat) => {
          const StatIcon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl bg-[#07111F] border border-white/[0.08] p-4 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <span className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/15 grid place-items-center">
                  <StatIcon className="w-4 h-4 text-cyan-400" />
                </span>
                <Badge variant="outline" size="sm">mock</Badge>
              </div>
              <div className="mt-4 text-2xl font-bold text-slate-100">{stat.value}</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">{stat.label}</div>
              <div className="mt-1 text-[11px] text-slate-500">{stat.helper}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl overflow-hidden">
        <div className="px-5 pt-4">
          <Tabs
            tabs={config.tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: <tab.icon className="w-4 h-4" /> }))}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        <div className="p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <activeTabConfig.icon className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">{activeTabConfig.label}</h3>
                <Badge variant="neutral" size="sm">{displayedItems.length} recursos</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 max-w-3xl leading-relaxed">{activeTabConfig.description}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)} leftIcon={<Plus className="w-3.5 h-3.5" />}>
              {activeTabConfig.actionLabel}
            </Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {displayedItems.map((item) => {
              const ItemIcon = item.icon || activeTabConfig.icon;
              return (
                <div key={item.id} className="rounded-xl border border-white/[0.07] bg-[#0B1628]/55 p-4 hover:border-cyan-400/25 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-[#07111F] border border-white/[0.08] grid place-items-center shrink-0">
                        <ItemIcon className="w-4 h-4 text-cyan-400" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-100 truncate">{item.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">{item.subtitle}</div>
                      </div>
                    </div>
                    <Badge variant={(item.tone || 'neutral') as BadgeVariant} size="sm">{item.status}</Badge>
                  </div>
                  {item.meta && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.meta.map((meta) => (
                        <span key={meta} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.05] text-slate-400">{meta}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">Sem infraestrutura real conectada</span>
                    <button
                      onClick={() => runSimulation(item)}
                      disabled={runningId === item.id}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
                    >
                      {runningId === item.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Simular
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {activeTabConfig.code && (
            <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-[#020617]">
              <div className="px-4 py-2.5 border-b border-white/[0.07] bg-[#0B1628] flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                  Preview da integração
                </div>
                <Badge variant="outline" size="sm">somente mock</Badge>
              </div>
              <pre className="p-4 text-xs leading-relaxed text-cyan-200 overflow-x-auto"><code>{activeTabConfig.code}</code></pre>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-cyan-500/15 bg-gradient-to-r from-cyan-500/[0.05] via-blue-500/[0.04] to-transparent p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-cyan-500/10 grid place-items-center shrink-0"><Icon className="w-5 h-5 text-cyan-400" /></span>
          <div>
            <div className="text-xs font-bold text-slate-100">Fase atual: definição completa do produto</div>
            <p className="text-[11px] text-slate-400 mt-1 max-w-2xl">Todas as ações desta tela são intencionalmente simuladas. O objetivo agora é validar recursos, navegação e experiência antes de substituir mocks por serviços reais.</p>
          </div>
        </div>
        <Badge variant="cyan">100% simulado</Badge>
      </div>

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={activeTabConfig.actionLabel}
        subtitle={`Crie um item simulado em ${activeTabConfig.label}. Nada será provisionado de verdade.`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button variant="gradient" size="sm" onClick={createResource} disabled={!resourceName.trim()}>Adicionar ao mock</Button>
          </>
        }
      >
        <form onSubmit={createResource} className="space-y-4">
          <Input
            label="Nome do recurso"
            placeholder={activeTabConfig.actionPlaceholder}
            value={resourceName}
            onChange={(e) => setResourceName(e.target.value)}
            autoFocus
            required
          />
          <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/[0.05] p-3 text-xs text-slate-400 leading-relaxed">
            Este recurso será persistido apenas em <span className="font-mono text-cyan-300">localStorage</span> para deixar o fluxo navegável e testável durante a fase de mock.
          </div>
        </form>
      </Modal>
    </div>
  );
};
