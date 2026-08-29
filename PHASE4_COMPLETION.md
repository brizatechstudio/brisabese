# BrisaBase — Fase 4 concluída

Versão: **0.6.0**

Data de fechamento: **2026-08-28**

## Objetivo da fase

Fechar Storage, Realtime e Webhooks sobre a base 0.5.0, mantendo isolamento por organização/projeto/ambiente e sem antecipar o escopo de Functions/APIs/SDK/CLI da Fase 5.

## Storage

- Buckets reais em PostgreSQL + bytes S3/MinIO.
- Buckets públicos/privados, RLS, signed read URLs e signed upload URLs.
- Upload/download/delete/restore/versionamento.
- Copy, move e rename reais; a interface não aponta mais para rotas inexistentes.
- Multipart/resumable upload persistido por projeto/ambiente, com partes retomáveis e limite cumulativo pelo tamanho máximo do bucket.
- A interface usa multipart automaticamente para arquivos acima de 16 MiB, em partes de 8 MiB.
- CORS configurável por bucket, com validação de origins/métodos/headers e preflight avaliado pelo próprio bucket.
- Lifecycle por bucket para expiração lógica de objetos e aborto de multipart incompleto.
- Scheduler de lifecycle no runtime real.
- Transformação de imagens com Sharp: resize, crop/fit, rotate, qualidade e saída WebP/AVIF/JPEG/PNG, com limites de dimensão/pixels.
- Limite de tamanho e MIME types continuam aplicados no upload final.
- Backup/restore do metadata de Storage preserva CORS e lifecycle.
- Eventos de Webhook para bucket/object/multipart/lifecycle.

> O multipart desta fase é resumable no nível da aplicação: as partes são persistidas como objetos temporários no backend S3 e combinadas pelo runtime na conclusão. Multipart S3 nativo/streaming de composição pode ser adotado em uma otimização futura sem mudar o contrato público.

## Realtime

- WebSocket real com autenticação e isolamento por projeto/ambiente.
- CDC PostgreSQL, subscriptions e filtros.
- Broadcast e Presence.
- Redis Pub/Sub para múltiplas instâncias.
- Heartbeat, detecção de conexão inativa e proteção de slow client.
- Rate limit distribuído por Redis para mensagens e broadcasts.
- SDK JavaScript com reconexão automática, exponential backoff + jitter, rejoin/resubscribe e heartbeat.
- Contagens vivas de conexões/canais/subscriptions do endpoint administrativo são tenant-scoped; métricas process-wide sensíveis não são retornadas como se fossem métricas do tenant.
- Eventos CDC e Broadcast podem alimentar o Webhook Engine.

## Webhooks

- Persistência real de definições e histórico de entregas.
- Escopo obrigatório de organização/projeto/ambiente no control plane.
- Criação, atualização, remoção e rotação de segredo.
- HMAC-SHA256 sobre timestamp + payload, com headers `x-brisabase-*` reservados e não sobrescrevíveis.
- Headers customizados validados.
- Targets HTTPS e proteção SSRF para redes privadas/reservadas; redirects são desabilitados.
- Timeout configurável.
- Retry com exponential backoff.
- Dead-letter após esgotar tentativas.
- Auto-disable após falhas consecutivas repetidas.
- Worker concorrente seguro usando claim transacional `FOR UPDATE SKIP LOCKED`.
- Recuperação de entregas presas em `processing` após interrupção do worker.
- Idempotência por `(webhook_id, event_id)`.
- Test delivery, histórico e replay manual.
- Console real com criação, teste, exclusão, rotação do segredo, histórico e replay.
- O segredo é mostrado somente na criação/rotação e não reaparece na listagem normal.
- Eventos reais integrados nesta fase incluem Database CDC, Auth user lifecycle, Storage e Realtime Broadcast.

## Migration

A Fase 4 usa **`019_storage_realtime_webhooks_phase4.sql`** e adiciona:

- `storage_buckets.cors_config`;
- `storage_buckets.lifecycle_rules`;
- metadata complementar de `storage_multipart_uploads`;
- `webhooks`;
- `webhook_deliveries`;
- índices de fila, escopo, histórico e idempotência de eventos.

## Gates executados nesta rodada

Aprovados sem infraestrutura externa:

- `npm run phase4:verify`;
- regressão acumulativa das Fases 1, 2 e 3;
- contratos de Database/Auth herdados;
- contrato `storage-realtime-webhooks-phase4-contract.test.cjs`;
- `npm run build:sdk`;
- parse sintático independente de TS/TSX pelo TypeScript disponível no runner;
- checagem de imports relativos, JSON, YAML e shell;
- validação de migration numbering e empacotamento/hash no fechamento da release.

## Fechamento final da release 0.6.0

Na rodada final de congelamento da Fase 4 também foram confirmados:

- `npm run phase4:verify`: PASS, incluindo cumulativamente Fases 1–3;
- parse sintático independente: **388 arquivos TS/TSX**;
- resolução estática: **1.231 imports relativos** em TS/TSX;
- SDK `@brisabase/js` recompilado com TypeScript 5.8;
- JSON: PASS;
- YAML: PASS;
- scripts shell/CJS/MJS: PASS;
- configuração self-hosted sintética segura aceita por `validate-production-env.cjs`;
- scanner de segredos: nenhuma credencial externa encontrada; valores estáticos remanescentes estão limitados a fixtures de desenvolvimento/CI e ao template de contrato `.env.homologation.example`, agora marcado explicitamente como não implantável;
- manifesto SHA-256 regenerado após todas as alterações;
- pacote ZIP validado arquivo a arquivo contra o manifesto.

## Gates reservados para o runner final

Como combinado para o projeto, a promoção final depende do runner completo no computador do projeto:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:docker
npm run release:validate:docker
```

Nessa rodada também devem ser exercitados MinIO/S3 real, uploads grandes/interrompidos, CORS em browser, lifecycle com relógio real, WebSocket/Redis multi-instância, CDC PostgreSQL, endpoints HTTPS de Webhook de homologação, retry/dead-letter sob falha de rede e concorrência horizontal.

## Critério de encerramento

A Fase 4 é considerada concluída no código quando Storage, Realtime e Webhooks possuem runtime real e contratos de segurança/isolamento, e `phase4:verify` mantém todas as regressões anteriores verdes. A certificação de produção continua condicionada aos release gates finais no runner completo.
