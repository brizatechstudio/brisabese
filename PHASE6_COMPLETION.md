# BrisaBase — Fase 6 concluída

Versão: **0.8.0**  
Data de fechamento: **2026-08-28**

## Escopo fechado

A Fase 6 fecha Backup/Recovery, Hosting e a camada de operação self-hosted/infraestrutura do BrisaBase sem simular capacidades gerenciadas que não existem no Compose distribuído.

### Backup, restore e PITR

- Backups automáticos em produção com agendamento e retenção.
- Criptografia com chave dedicada e bucket de backup separado.
- Verificação de integridade e preview de restore.
- Recovery drills persistidos.
- Restore destrutivo e PITR só são liberados quando **BACKUP_RESTORE_CERTIFIED=true** e existe um recovery drill aprovado.
- PITR via provider Neon com token operacional separado e confirmação explícita para recuperação da base inteira.
- Cron validado antes de persistir; falha de uma agenda não interrompe as demais.
- Snapshot creation pode operar em produção mesmo com restore ainda não certificado.

### Hosting

- Deploy estático real com releases, ativação e rollback.
- Preview imutável por deployment.
- Upload grande via CLI preservando MIME browser-safe.
- Custom domains com verificação DNS TXT.
- TLS on-demand via Caddy com endpoint `ask` autorizado pelo BrisaBase.
- Redirects e rewrites.
- Variáveis públicas do site limitadas a `PUBLIC_*` e `VITE_*`.
- Redirect externo somente HTTPS.
- Cache seguro: assets content-hashed podem ser imutáveis; nomes comuns não ficam presos a cache longo após rollback.

### Infraestrutura e operação

- Heartbeat real de instâncias/runtime.
- Estado de réplicas derivado de heartbeat observado, sem inventar réplicas.
- Instâncias atrasadas ficam degradadas; heartbeats muito antigos ficam offline/stopped.
- Health de PostgreSQL, Redis, Storage, Functions, Backup e Hosting.
- Incident management com token operacional separado.
- `/status` público sem exposição de incidentes de tenants/projetos.
- O Compose self-hosted declara `single-host` como topologia suportada.
- `BRISABASE_PRODUCTION_TIER=ha` só é aceito em deployment `managed`; o pacote self-hosted não simula Multi-AZ.
- Infrastructure/Ecosystem previews permanecem desabilitados em produção.

### Produção

- `.env.production.example` e `.env.homologation.example` alinhados com 0.8.0.
- `docker-compose.production.yml` inclui Backup, Hosting custom domains, Caddy e tokens operacionais separados.
- Gerador de segredos produz chaves independentes para Backup, Hosting/Caddy ask, PITR e operations.
- Validador de produção permite backups com segurança e continua bloqueando configurações HA/PITR/TLS inválidas.
- Migration da fase: `021_backup_hosting_infrastructure_phase6.sql`.

## Ajustes finais encontrados na validação

1. O validador standalone ainda continha a regra antiga que proibia `BACKUP_ENABLED=true`; foi alinhado à nova política: criar snapshots é permitido, restore/PITR continuam dependentes de certificação operacional.
2. Restore/PITR não confiam apenas em uma flag de ambiente: também exigem recovery drill aprovado persistido.
3. O scheduler de backups passou a isolar falhas por agenda e validar expressões cron antes de salvar.
4. O status público foi mantido restrito a incidentes globais da plataforma, evitando vazamento de incidentes de tenants.
5. Hosting passou a inferir MIME seguro em uploads via CLI e a usar cache imutável apenas para assets com nome content-hashed.
6. Variáveis de Hosting expostas ao browser são limitadas a prefixos públicos explícitos.
7. O pacote self-hosted continua declaradamente single-host; modo HA exige infraestrutura managed/externa adequada.

## Validações verdes neste ambiente

- `npm run phase6:verify` — **PASS**, acumulando Fases 1–5.
- Fase 1 / upgrade/browser compatibility — **PASS**.
- Fase 2 / Database contract — **PASS**.
- Fase 3 / Authentication & Security contract — **PASS**.
- Fase 4 / Storage + Realtime + Webhooks contract — **PASS**.
- Fase 5 / Functions + APIs + GraphQL + Developer Tools contract — **PASS**.
- Fase 6 / Backup + Production + Hosting + Infrastructure contract — **PASS**.
- Parser independente: **385 TS/TSX** sem erro sintático.
- Resolver AST independente: **1.195 imports relativos** resolvidos.
- SDK `@brisabase/js`: build isolado com TypeScript global — **PASS**.
- JSON/YAML/shell/CJS/MJS — **PASS**.
- Configuração self-hosted sintética segura de produção — **PASS**.
- Caso negativo `ha + self-hosted` — rejeitado corretamente.
- Scanner amplo: nenhum PEM/private key ou token externo conhecido encontrado.

## Gates reservados para o runner final

A tentativa de `npm ci` neste ambiente deixou uma instalação parcial de typings; o `node_modules` foi removido antes da release. Por isso o `typecheck` completo e o build integral continuam obrigatórios no runner final com registry e Docker disponíveis:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```

O erro observado no `typecheck` deste runner foi exclusivamente `TS2688` para type definitions ausentes na instalação parcial, não um erro de fonte. O SDK foi recompilado separadamente com TypeScript global após a limpeza.

## Decisões de arquitetura

- Backup creation é uma capacidade real de produção a partir desta fase; restore/PITR destrutivos continuam condicionados a evidência de recovery drill.
- O BrisaBase self-hosted distribuído é single-host. HA/multi-region exige deployment managed ou infraestrutura externa apropriada.
- TLS de custom domains usa autorização on-demand do Caddy; o BrisaBase não emite certificado para domínio não verificado/autorizado.
- O status público nunca é uma janela para incidentes privados de tenants.

**FASE 6: CONCLUÍDA.**
