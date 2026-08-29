# BrisaBase — Fase 1 concluída: estabilização e limpeza

Versão da base: **0.3.0**  
Data de consolidação: **2026-08-28**

## Escopo concluído

### Estabilidade do console
- Corrigida a ordem de Hooks do `AppLayout`; o `useEffect` de criação de projeto não fica mais depois de retornos condicionais de autenticação.
- Estados de sessão continuam explícitos para carregamento e redirecionamento.
- Removida página migrada e não referenciada de Settings para reduzir código morto.
- Real mode não expõe rotas/sidebar de módulos que continuam apenas como mock/preview.

### Identidade BrisaBase
- Migração de branding da base, runtime, CLI, SDK, headers internos, chaves, localStorage, migrations, scripts e documentação.
- SDK padronizado como `@brisabase/js`.
- CLI padronizado como `brisabase`.
- Plataforma, SDK e CLI alinhados em `0.3.0`.
- Prefixos de API key padronizados em `bb_*`.

### Compatibilidade de upgrade
- Histórico global de migrations de versões anteriores é migrado para `brisabase_schema_migrations` sob advisory lock.
- Histórico interno de migrations de cada projeto/ambiente é migrado para `__brisabase_migrations` dentro de transação e lock por schema.
- Cinco migrations cujo conteúdo mudou **somente em comentários de identidade** possuem tradução explícita de checksum antigo → atual; qualquer checksum desconhecido continua sendo rejeitado.
- O histórico legado só é removido depois da verificação completa; conflito preserva os dados antigos e aborta o upgrade.
- `db:status` reconhece o histórico antigo antes do primeiro `db:migrate`.
- Organização, projeto, ambiente e sessão administrativa existentes no navegador são migrados uma única vez para as chaves `brisabase.*`; valores BrisaBase já existentes sempre têm precedência.
- Testes dedicados cobrem sucesso, preservação em conflito e migração do estado do navegador.

### Interface e produto
- Dark mode é o único tema suportado no console.
- Menu usa `Storage` como nome do produto.
- Preferência PT-BR/EN-US permanece persistida em Settings; shell, navegação e preferências alternam imediatamente.
- Storage recebeu textos essenciais bilíngues e deixou de prometer CDN global gerenciada.
- Criação de projeto deixou de prometer replicação Multi-AZ; região é apresentada como metadado do runtime atual.

### Separação real x mock
No modo `VITE_DATA_SOURCE=api`, recursos de expansão que ainda não têm control plane real deixam de ser navegáveis/anunciados. Eles continuam disponíveis exclusivamente no modo mock para evolução futura.

### Configuração e produção
- `.env.example` refeito para desenvolvimento BrisaBase.
- `.env.homologation.example` criado.
- `.env.production.example` criado.
- `docker-compose.production.yml` criado.
- `docker-compose.homologation.yml` criado.
- Caddy/TLS configurado no perfil de produção.
- PostgreSQL recebe usuário de aplicação separado do bootstrap administrativo.
- MinIO recebe usuário/policy de aplicação separado da conta root.
- Redis exige autenticação no perfil de produção.
- Imagens de produção devem ser fixadas por digest.
- Validador de produção recusa placeholders, segredos fracos/iguais, URLs inseguras e capacidades ainda não certificadas.

### Capacidades deliberadamente bloqueadas em produção nesta fase
- `FUNCTIONS_ENABLED=true` — requer executor de produção isolado/certificado em fase posterior.
- `BACKUP_ENABLED=true` — requer certificação de restore/PITR em fase posterior.
- Infrastructure/Ecosystem previews — não entram no perfil real de produção.
- Multi-region/Multi-AZ gerenciado e CDN edge — não são anunciados como ativos.

## Verificações executadas neste ambiente

### PASS
- `npm run phase1:verify`: valida arquivos obrigatórios, branding, prefixos, versões, Hook ordering, promessas indevidas, contratos de upgrade e executa os testes de compatibilidade de migrations/navegador.
- Transpilação sintática independente de **366 arquivos TypeScript/TSX** com TypeScript global: sem diagnostics sintáticos.
- `npm run test:phase1:compat`: ponte de upgrade global/projeto e estado do navegador — PASS.
- SDK `@brisabase/js` reconstruído com TypeScript global; artefatos `dist` sem identidade anterior.
- Resolução estática de imports relativos em fontes não-testes — PASS.
- Parse dos manifests JSON e Compose YAML.
- `node -c` nos scripts Node/CJS adicionados/alterados.
- `sh -n`/`bash -n` nos scripts shell de deploy/release/init.
- Validador de produção executado com configuração self-hosted de homologação e referências de imagem digest-pinned sintéticas: contrato aceito.

### Gate externo pendente — ambiente, não defeito confirmado da base
Uma nova tentativa de `npm ci` também não concluiu: o registry npm retornou falhas DNS `EAI_AGAIN` e a execução atingiu o limite do runner. O `node_modules` parcial, por consequência, não contém todos os pacotes `@types`; `npm run typecheck` acusa somente essas definições ausentes antes de chegar a uma validação confiável do projeto.

Docker também não está instalado neste runner, então os release gates que sobem PostgreSQL/Redis/MinIO/BrisaBase não puderam ser executados aqui.

Por isso, antes de promover esta base a release de produção, execute em CI/ambiente com rede e Docker:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```

A **Fase 1 está encerrada no escopo de código/configuração/upgrade definido para esta etapa**. Os gates abaixo continuam sendo obrigatórios para promover qualquer commit a produção, mas não foram marcados como aprovados neste runner por ausência de rede npm/Docker.

## Status

**FASE 1: CONCLUÍDA.** A base está pronta para seguir para a Fase 2 sem pendência conhecida dentro do escopo desta fase.

## Próxima fase

**Fase 2 — Database completo**: Table Editor, SQL Editor, schema/DDL, imports/exports, views, functions, triggers, RLS/policies, migrations/diff e ferramentas de administração PostgreSQL.
