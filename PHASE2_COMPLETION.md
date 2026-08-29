# BrisaBase — Fase 2 concluída

Versão: **0.4.0**

## Escopo fechado

- Table Editor: paginação, busca multi-coluna, filtros, ordenação, importação CSV/JSON, exportação, append/upsert, edição por PK simples e bloqueio seguro para tabelas sem PK/PK composta.
- Schema visual: renomear tabela; criar/alterar/remover colunas; `DEFAULT`, `UNIQUE`, `NOT NULL`; confirmações destrutivas.
- SQL Editor: histórico, queries salvas/favoritas por usuário+projeto+ambiente, timeout, max rows, cancelamento escopado, EXPLAIN/ANALYZE dedicado, métricas média/p95/sucesso/erro, exportação CSV/JSON.
- Objetos PostgreSQL: relacionamentos/FKs, B-tree/Hash/GIN/GiST/BRIN, functions, triggers, views, materialized views, enums, sequences e catálogo controlado de extensões.
- Migrations: `sqlUp`, `sqlDown`, checksum, histórico, rollback apenas da migration aplicada mais recente e snapshot/schema diff.
- Segurança: RLS/policies visuais com simulação; operações globais do cluster continuam bloqueadas para preservar isolamento.

## Gates locais executáveis sem infraestrutura

- `npm run phase2:verify`
- verificação sintática TS/TSX
- resolução estática de imports relativos
- JSON/YAML/shell scripts

## Gates reservados para o runner final

Quando o runner completo estiver ligado: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:docker`, E2E e testes de concorrência/isolamento em PostgreSQL real.
