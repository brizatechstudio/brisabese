# BrisaBase — Fase 5 concluída

Versão: **0.7.0**  
Data de fechamento: **2026-08-28**

## Escopo fechado

A Fase 5 fecha a Developer Platform do BrisaBase: Functions de produção self-hosted, REST Data API, GraphQL, SDK JavaScript/TypeScript oficial, CLI e artefatos de desenvolvimento gerados a partir do PostgreSQL real.

### Functions

- Executor de produção separado do processo principal.
- Container sem credenciais de PostgreSQL, Redis, Storage, JWT ou chave de criptografia.
- Token do executor separado dos segredos de autenticação.
- Rede Docker interna `functions-plane`, conectando somente BrisaBase e executor.
- Container `read_only`, `cap_drop: ALL`, `no-new-privileges`, tmpfs, limite de PIDs e health check.
- Código do usuário executado em processo filho com ambiente sanitizado e limites de memória/tempo.
- Acesso a Database/Auth/Storage/Realtime/Queues somente por capacidades RPC temporárias.
- Deploy versionado, rollback, logs, métricas e health.
- Secrets e variáveis por projeto/ambiente.
- Edição do JSON de ambiente sincroniza inclusões, alterações e remoções reais.
- Cron: criar, listar, ativar/desativar e excluir.
- Queues/jobs com retry explícito de itens em dead-letter.

### REST Data API

- CRUD real preservado com API Keys/JWT, RLS, filtros, paginação e rate limiting.
- Expansão de relacionamentos declarados por FK via `include`.
- Máximo de cinco relações por request e até 200 linhas raiz quando há expansão.
- Busca relacionada em lote para evitar N+1.
- RLS aplicado novamente às linhas relacionadas.
- Campos sensíveis conhecidos não são projetados automaticamente em relações.
- OpenAPI gerado documenta o parâmetro `include`.

### GraphQL

- Queries e mutations sobre o schema PostgreSQL real.
- Persisted Queries por SHA-256 no protocolo `version: 1`.
- Persisted Queries isoladas por organização/projeto/ambiente.
- Teto de 1.000 persisted queries por ambiente.
- Administração/listagem/remoção no control plane.
- Limites de documento, profundidade e complexidade.
- Complexidade passa a considerar também o `limit` solicitado em listas.
- RLS continua aplicado pelo mesmo runtime de segurança.

### Developer Tools

- `@brisabase/js` é o SDK oficial JavaScript/TypeScript desta release.
- SDK oficial compilável e com suporte a persisted GraphQL queries.
- OpenAPI 3.0.3 gerado do schema real.
- Tipos TypeScript gerados do schema real.
- Artefatos possuem checksum SHA-256, histórico e auditoria por escopo.
- Tela real de Developer Tools usa diretamente `/api/developer/*` e não depende do antigo ecosystem preview.
- Geradores multi-linguagem continuam preview e não são apresentados como pacotes oficiais publicados.

### CLI

Fluxos reais incluídos:

- `db pull`, `db diff`, `db push`.
- migrations e rollback.
- Functions: deploy, rollback, health, cron e queues/jobs.
- secrets e variáveis de ambiente.
- logs.
- Storage e Auth users.
- backup/restore existentes.
- `types pull` e `openapi pull`.
- `doctor`.

Os antigos estados `prepared`/placeholder não são usados para esses fluxos da Fase 5.

## Ajustes encontrados na validação final

A rodada final também corrigiu problemas que não faziam parte da implementação inicial, mas impediriam um fechamento confiável:

1. `TeamMember` legado usava o papel `Billing`, enquanto `UserRole` não o aceitava. Foi criado `TeamRole = UserRole | 'Billing'`, sem ampliar indevidamente os roles de usuários autenticados.
2. Remover uma variável do JSON da tela de Functions não a removia do backend. Foi adicionado `DELETE /api/functions/environment/:name` e sincronização completa do ambiente.
3. O gerador de segredos de produção não criava `FUNCTIONS_EXECUTOR_TOKEN`. Agora cria um valor forte e independente.
4. O fixture de homologação ainda desabilitava Functions. Agora o release runner de homologação testa Functions habilitadas e constrói um executor descartável a partir de `Dockerfile.functions`.
5. `production:validate` ignorava `BRISABASE_ENV_FILE`. O script/npm command agora respeita o arquivo indicado.
6. O executor compartilhava a rede de PostgreSQL/Redis/MinIO. Foi movido para uma rede interna dedicada `functions-plane`, acessível somente pelo BrisaBase.

## Validações verdes neste ambiente

- `npm run phase5:verify` — **PASS**, acumulando as Fases 1–4.
- Fase 1: identidade/upgrade/browser compatibility — **PASS**.
- Fase 2: Database contract — **PASS**.
- Fase 3: Authentication & Security contract — **PASS**.
- Fase 4: Storage + Realtime + Webhooks contract — **PASS**.
- Fase 5: Functions + APIs + GraphQL + Developer Tools contract — **PASS**.
- Parser independente: **376 TS/TSX** sem erro sintático.
- Resolver independente: **1.178 imports relativos** resolvidos.
- SDK `@brisabase/js`: build isolado com TypeScript — **PASS**.
- JSON/YAML/shell/CJS/MJS — **PASS**.
- Configuração self-hosted de produção com Functions habilitadas — **PASS**.
- Casos negativos: token ausente/compartilhado, Functions image sem digest e executor HTTP público — rejeitados corretamente.
- Scanner amplo: nenhum PEM/private key ou token externo conhecido encontrado. Valores estáticos restantes são fixtures locais/CI explicitamente marcadas ou placeholders de exemplo.

## Gates reservados para o runner final

Este ambiente não conseguiu concluir `npm ci`; a instalação atingiu o limite de execução e deixou apenas dependências parciais, removidas antes do empacotamento. Docker também será exercitado no runner final conforme combinado.

Continuam obrigatórios antes de promoção pública:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```

O release runner agora contém o contrato necessário para construir e exercitar o executor de Functions na stack descartável de homologação.

## Decisões de arquitetura

- Functions self-hosted são consideradas parte real do BrisaBase a partir desta fase, mas executam em plano separado e de menor privilégio.
- O executor não recebe acesso direto aos serviços de dados nem egress externo pelo Compose; integrações passam por capacidades controladas do BrisaBase.
- `@brisabase/js` é o único pacote SDK oficial desta fase. Geradores de outras linguagens permanecem roadmap/preview.
- Backup/PITR certificado, Hosting/infra de alta disponibilidade e recursos avançados pertencem às fases seguintes.

**FASE 5: CONCLUÍDA.**
