# BrisaBase — Escopo do Mock Completo

Esta versão do projeto continua **100% simulada**. Nenhum serviço de infraestrutura real é provisionado e nenhuma integração externa é necessária nesta fase.

## Core já representado

- Dashboard e projetos
- Database: PostgreSQL Table Editor + SQL Editor + NoSQL collections/documents + connections/pooler
- Authentication (users + fluxos de login/cadastro/recuperação simulados)
- Storage
- Projetos / gestão de workspace
- Serverless Functions
- Realtime
- APIs
- Analytics e Logs
- Settings, API Keys, Webhooks, Members e Billing

## Expansão adicionada nesta fase

### Data Platform
- Schema e relacionamentos
- Índices simples, compostos, full-text e vetoriais
- SQL Editor executável em modo mock (DDL/DML, CREATE/ALTER TABLE, INSERT/SELECT/UPDATE/DELETE, EXPLAIN, transactions, saved queries e history)
- Table Editor relacional com columns, rows, RLS e Realtime
- Query Studio / SQL snippets
- Database functions, procedures e triggers
- Views e materialized views
- PostgreSQL extensions
- Cron jobs e durable queues / DLQ
- Logical replication, CDC, database webhooks e read replicas
- Query performance, slow queries, index advisor, locks e cache metrics
- Direct connection, session/transaction pooler, SSL e network settings
- Migrations, diff e rollback
- Backups, snapshots e PITR
- Import / Export e migração assistida
- Vector Search, embeddings e pipelines AI
- Object Storage avançado: buckets, signed URLs, multipart, TUS resumable uploads, S3 compatibility, CDN, CORS, lifecycle e image transformations

### Identity & Security
- Identity Providers
- Email/password, Magic Link, E-mail OTP, Phone/SMS, Anonymous/Guest e Custom JWT
- Enterprise SSO SAML/OIDC e Auth Hooks
- MFA e políticas de sessão
- RBAC e scopes
- Policies / RLS
- Storage policies
- App attestation / anti-abuse
- Rate limits, CORS e WAF conceitual
- Secrets Vault
- Audit Log

### Environments & Branching
- Development / Staging / Production
- Database branches
- Preview environments
- Promotion pipelines e checks

### Developer Experience
- SDKs multiplataforma
- CLI
- Local emulator stack
- API Explorer REST / GraphQL / RPC
- OpenAPI 3.1 e SDK generation
- Runtime Ops para Functions
- Deployments, triggers, cron e custom domains

### Hosting & Edge
- Sites
- Custom domains e SSL
- Git/deploy history
- Preview deployments
- Rollback
- CDN, cache rules e image optimization

### Messaging & Remote Config
- Push, e-mail e SMS
- Templates
- Campaigns e automações
- Remote Config
- Feature Flags e rollouts

### Usage & Cost Control
- Metering por serviço
- Quotas
- Usage alerts
- Budgets
- Hard/soft limits
- Cost controls
- APM, distributed traces, error tracking, uptime e performance monitoring


### Experiments & Personalization
- A/B e multivariate testing
- Audiences / cohorts
- Progressive rollouts e automatic pause
- Personalization
- Metrics, statistical guardrails e experiment history

### App Quality & Distribution
- Distribuição simulada de builds iOS/Android
- Tester groups e release access
- Test Lab / device matrix
- Quality gates
- Feedback e diagnostics vinculados à build

### Search & AI Platform
- Dedicated full-text search, facets, ranking e synonyms
- Hybrid / semantic search
- AI Gateway com routing/fallback/cache/budgets
- RAG pipelines
- AI evaluations e regression suites

### Enterprise & Organizations
- Organizations / workspaces / teams
- Organization roles e policies
- SCIM 2.0 provisioning mock
- SIEM / security exports
- SSO enforcement / domain capture / break-glass access
- Enterprise support / SLA

## Regra desta fase

Todos os recursos avançados criados pelo usuário ficam persistidos somente em `localStorage` pela chave `brisabase_platform_expansion_v1:<projectId>`.

A fase real só deve começar depois que o escopo, navegação e experiência estiverem congelados.

## Ordem sugerida para implementação real futura

1. Projects / tenancy / organizations
2. Auth + sessions + security policies
3. Database + query engine + migrations
4. Storage
5. Realtime
6. Functions runtime
7. SDK/API Gateway
8. Observability, metering e billing
9. Hosting, messaging e serviços complementares


## Realtime aprofundado

- Broadcast público/privado
- Presence com join/leave/sync
- Postgres Changes / database subscriptions
- Channel authorization com policies/RLS
- Publications e filtros de eventos

### Lacunas enterprise também representadas no mock
- Service Accounts / machine identities e rotação de credenciais
- Compliance & Data Governance (data residency, retenção, LGPD/GDPR workflows)
- HA / Disaster Recovery, failover, recovery drills e maintenance windows
- Type generation a partir do schema (`brisa gen types`)
- Infrastructure as Code (Terraform/Pulumi/YAML export)
- Integrations / Marketplace e exports OpenTelemetry/CDC
- Incidents, public status page e postmortems
