# BrisaBase 1.0.1-beta.1 — candidato beta das Fases 1–8

BrisaBase é um BaaS baseado em PostgreSQL com console visual e runtime real para Database, Authentication, Storage, Realtime, Webhooks, Functions, REST, GraphQL, Backup, Hosting, infraestrutura operacional, Remote Config, Feature Flags, Experiments, Product Analytics, App Quality, Search/Vector/RAG, AI Gateway, Messaging multicanal, Billing, Enterprise e Infrastructure as Code.

## Advanced Platform — Fase 7

A base **1.0.0** fecha as oito fases de implementação; **1.0.1-beta.1** prepara a certificação e distribuição do beta sem mover a tag anterior. Billing comercial é provider-aware, Enterprise adiciona SSO/SCIM/RBAC/SIEM/políticas e IaC oferece manifests com checksum e drift detection. Recursos externos só são considerados ativos quando seus providers e credenciais reais estão configurados.

### Experiments e configuração dinâmica

- Remote Config versionado e condicional.
- Feature Flags com targeting, segmentos e rollout gradual.
- A/B tests com atribuição determinística/sticky e métricas de conversão.

### Analytics e App Quality

- Eventos, usuários, sessões e séries diárias.
- Funnels e retenção D1/D7/D30 por coorte.
- Crash/error/ANR/performance/trace.
- Release health e App Distribution ligado ao Storage.
- Retenção física configurável dos dados avançados.

### Search, Vector, RAG e AI

- Full-text search PostgreSQL com GIN.
- Embeddings e cosine similarity com limite de memória no fallback.
- Hybrid search.
- AI Gateway OpenAI-compatible com chaves criptografadas, HTTPS, allowlist, SSRF protection, token/cost/latency metrics.
- Embeddings e RAG integrados ao Search.

### Messaging avançado

- Push/FCM, SMTP/e-mail e Twilio/SMS.
- Templates, campanhas, scheduling e segmentos.
- Contatos verificados para e-mail/SMS.
- Claim atômico para impedir campanhas duplicadas em múltiplas instâncias.

## Fases concluídas

- **Fase 1 / 0.3.0** — estabilização e compatibilidade de upgrade.
- **Fase 2 / 0.4.0** — Database completo.
- **Fase 3 / 0.5.0** — Authentication & Security.
- **Fase 4 / 0.6.0** — Storage + Realtime + Webhooks.
- **Fase 5 / 0.7.0** — Functions + APIs + GraphQL + SDK/CLI/Developer Tools.
- **Fase 6 / 0.8.0** — Backup/Recovery + Hosting + Produção + Infraestrutura.
- **Fase 7 / 0.9.0** — Remote Config + Flags + Experiments + Analytics + App Quality + Messaging + Search/Vector/RAG/AI.
- **Fase 8 / 1.0.0** — Billing + Enterprise + IaC + fechamento operacional/comercial da release 1.0.

## Perfis de implantação

O mesmo BrisaBase pode crescer sem trocar API, SDK ou modelo de dados:

- **Hobby / Local** — stack Docker completa para iniciantes, estudos e protótipos, presa a `127.0.0.1`.
- **Self-Hosted** — produção `single-host` em VPS/servidor próprio, com TLS, volumes persistentes e serviços empacotados.
- **Enterprise** — containers do BrisaBase/Functions com PostgreSQL, Redis e S3 externos, TLS obrigatório e topologia preparada para HA.

Começo mais simples:

```bash
npm ci
npm run deployment -- init hobby
npm run deployment -- up hobby
```

Servidor próprio:

```bash
npm run deployment -- init self-hosted
# substitua os placeholders de .env.production
npm run deployment -- doctor self-hosted
npm run deployment -- up self-hosted
```

Infraestrutura corporativa:

```bash
npm run deployment -- init enterprise
# configure PostgreSQL/Redis/S3 externos e imagens imutáveis em .env.enterprise
npm run deployment -- doctor enterprise
npm run deployment -- up enterprise
```

Os perfis de implantação são independentes dos tiers comerciais Free/Pro/Team/Enterprise. Consulte `docs/DEPLOYMENT_PROFILES.md` e `docs/SECURITY_BASELINE.md`.

## Modos do console

Runtime real por padrão:

```bash
VITE_DATA_SOURCE=api
```

Fixtures/previews somente quando explicitamente habilitados:

```bash
VITE_DATA_SOURCE=mock
```

## Desenvolvimento local

Requisitos: Node.js 22, npm 10+ e Docker para a stack completa.

```bash
cp .env.example .env
npm ci
npm run db:migrate
npm run dev
```

Ou:

```bash
docker compose -f docker-compose.local.yml up -d --build
curl http://localhost:3000/health/required
```

## Upgrade

```bash
npm run db:migrate
npm run db:status
```

A Fase 7 adiciona `022_advanced_platform_phase7.sql` e a Fase 8 adiciona `023_billing_enterprise_iac_phase8.sql`. A ponte de compatibilidade de releases anteriores continua preservada.

## AI Gateway

Providers são configurados no painel/Control Plane e suas chaves ficam criptografadas no backend. `AI_PROVIDER_ALLOWED_HOSTS` limita explicitamente os destinos permitidos. Nenhum provider é ativado automaticamente.

A retenção de telemetria avançada pode ser configurada por:

```bash
ANALYTICS_RETENTION_DAYS=90
APP_QUALITY_RETENTION_DAYS=90
AI_USAGE_RETENTION_DAYS=90
```

Faixa válida em produção: 7–730 dias.

## Produção self-hosted

O contrato da Fase 6 permanece: o Compose distribuído suporta explicitamente `single-host`; HA exige deployment `managed` e infraestrutura externa adequada. Functions continuam no plano de execução privado; Restore/PITR exigem certificação operacional e recovery drill aprovado.

Valide o ambiente escolhido antes de deploy:

```bash
BRISABASE_ENV_FILE=.env.production npm run production:validate
```

## Validação acumulativa

```bash
npm run phase1:verify
npm run phase2:verify
npm run phase3:verify
npm run phase4:verify
npm run phase5:verify
npm run phase6:verify
npm run phase7:verify
npm run phase8:verify
```

`phase8:verify` inclui todas as regressões anteriores e o contrato Billing + Enterprise + IaC da release 1.0.

Gates completos no runner final:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```

## Relatórios

- `PHASE1_COMPLETION.md`
- `PHASE2_COMPLETION.md`
- `PHASE3_COMPLETION.md`
- `PHASE4_COMPLETION.md`
- `PHASE5_COMPLETION.md`
- `PHASE6_COMPLETION.md`
- `PHASE7_COMPLETION.md`
- `PHASE8_COMPLETION.md`
- `BRISABASE_MIGRATION_STATUS.md`

## Billing, Enterprise e IaC — 1.0

`BILLING_PROVIDER=disabled` mantém instalações self-hosted sem cobrança externa. Quando Stripe é habilitado, checkout/portal/invoices/refunds passam pelo provedor e os webhooks usam assinatura e idempotência. Enterprise oferece domínio verificado, OIDC/SAML Gateway, SCIM, custom roles, IP allowlist, SIEM e evidências técnicas de compliance. IaC exporta manifests com checksum canônico e drift detection.

Antes de lançamento público, revise `docs/legal/TERMS_TEMPLATE.md`, `docs/legal/PRIVACY_TEMPLATE.md` e complete `docs/GO_LIVE_CHECKLIST.md`.

O processo de beta está documentado em `docs/BETA_POLICY.md`, `docs/RELEASE_PROCESS.md`, `docs/REPOSITORY_GOVERNANCE.md` e `SECURITY.md`. O canal de distribuição do candidato é o artefato imutável produzido pelo **BrisaBase Production Gate**; não trate a branch `main` ou um build local como release.
