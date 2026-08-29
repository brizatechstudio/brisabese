# BrisaBase — status da consolidação do runtime

## Estado atual

**Versão 0.9.0 — Fases 1 a 7 concluídas em 2026-08-28.**

O console em `VITE_DATA_SOURCE=api` utiliza o runtime BaaS real e não faz fallback silencioso para fixtures. Módulos que ainda pertencem à Fase 8 permanecem fora da superfície real até sua implementação.

## Capacidades reais consolidadas

- Control plane Express + PostgreSQL com isolamento por organização/projeto/ambiente.
- Database completo: SQL/Table Editor, schema, índices, FKs, views/materialized views, enums, sequences, functions/triggers, RLS/policies, import/export, snapshot/diff e migrations/rollback.
- Auth: password, sessões/refresh rotation/replay detection, verificação/reset, passwordless, MFA/TOTP, Passkeys/WebAuthn, cinco OAuth providers, identidades vinculadas, roles/claims e hardening.
- Storage S3/MinIO: signed URLs/uploads, multipart resumable, copy/move, versionamento, CORS/lifecycle e transformações.
- Realtime: WebSocket, CDC PostgreSQL, Broadcast/Presence, Redis Pub/Sub, rate limiting e SDK reconnect/heartbeat.
- Webhooks: HMAC, SSRF protection, retry/backoff, idempotência, dead-letter, replay e worker multi-instância.
- REST/GraphQL: CRUD/relations/RLS, persisted GraphQL queries e limites de custo.
- Functions: executor isolado, deploy/versionamento/rollback, cron, queues/jobs, logs, secrets/env.
- Developer Tools: OpenAPI/TypeScript gerados do schema, SDK oficial `@brisabase/js` e CLI.
- Backup/Hosting/Infra: snapshots, recovery drills, PITR condicionado, Hosting versionado, custom domains/TLS, runtime heartbeat, incidents/status e topologia explícita.
- Remote Config + Feature Flags: conditions, segmentos e rollout determinístico.
- Experiments: A/B assignment sticky, lifecycle e métricas de conversão.
- Product Analytics: ingest, séries, funnels e retenção D1/D7/D30.
- App Quality: crash/error/ANR/performance/trace, release health e App Distribution.
- Search: full-text PostgreSQL, embeddings, vector cosine e hybrid search.
- AI Gateway: providers OpenAI-compatible, secrets criptografados, allowlist/SSRF hardening, generate/embeddings/RAG e token/cost/latency metrics.
- Messaging avançado: Push, e-mail, SMS, templates, campanhas, scheduling e segmentos.

## Produção self-hosted

O pacote distribuído mantém o contrato `single-host` da Fase 6. Não existe simulação de Multi-AZ. `BRISABASE_PRODUCTION_TIER=ha` continua exigindo deployment `managed` e dependências externas apropriadas.

AI providers só podem apontar para hostnames públicos explicitamente incluídos em `AI_PROVIDER_ALLOWED_HOSTS`. Retenção de Analytics, App Quality e AI Usage é configurável entre 7 e 730 dias.

## Compatibilidade de atualização

A ponte da Fase 1 continua válida para históricos de migrations e estado migrado do navegador. Os prefixos numéricos de migration permanecem únicos. A Fase 7 adiciona:

`022_advanced_platform_phase7.sql`

## Próxima etapa

A Fase 8 concentra Billing financeiro, Enterprise/compliance, IaC/automação comercial e fechamento de lançamento 1.0.

## Validação

`npm run phase7:verify` executa cumulativamente as verificações das Fases 1–7. O fechamento também usa parser independente TS/TSX, resolução AST de imports, build isolado do SDK, JSON/YAML/scripts, scanner de segredos e contratos positivos/negativos do ambiente de produção.

No runner final continuam obrigatórios:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```

Veja `PHASE1_COMPLETION.md` até `PHASE7_COMPLETION.md` para os relatórios por fase.

## Fase 8 / BrisaBase 1.0.0

A migration `023_billing_enterprise_iac_phase8.sql` adiciona persistência de billing comercial, Enterprise e exports IaC. Ela preserva a sequência única das migrations anteriores e deve ser aplicada com `npm run db:migrate`.

A release 1.0.0 mantém compatibilidade de upgrade validada pelas Fases 1–7 e passa a exigir `phase8:verify` antes de promoção.

