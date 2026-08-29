# BrisaBase — Fase 7 concluída

Versão: **0.9.0**  
Data de fechamento: **2026-08-28**

## Escopo fechado

A Fase 7 transforma os módulos avançados que antes eram preview em capacidades reais, persistidas e isoladas por organização/projeto/ambiente.

### Remote Config, Feature Flags e Experiments

- Remote Config versionado com condições e targeting por regras/segmentos.
- Feature Flags com payload, regras e rollout gradual de 0 a 100%.
- Segmentos nomeados reutilizáveis.
- Bucketing determinístico SHA-256 por sujeito e salt.
- A/B tests com variantes que totalizam 10.000 basis points.
- Atribuição sticky e race-safe por sujeito.
- Start/pause/complete/cancel e winner opcional.
- Métrica primária e conversão por variante.
- UI real para flags, rollout, segmentos, experimentos e métricas.

### Product Analytics

- Ingestão de eventos pelo data plane, em lotes limitados.
- Usuários, sessões, eventos, séries diárias e eventos principais.
- Funnels sequenciais com limite rígido de eventos analisados.
- Retenção por coorte D1/D7/D30.
- Retenção física configurável de dados entre 7 e 730 dias.

### App Quality e App Distribution

- Eventos crash, error, ANR, performance e trace.
- Stack/message/metadata e duração de performance com limites.
- Release health e usuários afetados.
- P95/latência agregada para sinais de performance.
- App Distribution com releases e artefatos opcionais validados no Storage real.

### Search, Vector e RAG

- Full-text search PostgreSQL com índice GIN.
- Índices de busca por projeto/ambiente.
- Upsert de documentos com metadata.
- Embeddings numéricos validados, com dimensão inferida/travada no primeiro lote quando não informada.
- Busca vetorial por cosine similarity com fallback limitado a 500 documentos por consulta para proteger memória.
- Hybrid search texto + vetor.
- Embeddings via AI Gateway.
- RAG integrado: embedding da pergunta, retrieval híbrido e geração usando apenas o contexto recuperado.

O fallback vetorial desta release não exige `CREATE EXTENSION`/pgvector no PostgreSQL compartilhado. Uma camada vetorial especializada pode ser adicionada futuramente sem quebrar o contrato atual.

### AI Gateway

- Providers OpenAI-compatible configuráveis por projeto/ambiente.
- API keys criptografadas no backend e nunca retornadas ao frontend.
- Allowlist explícita de hostnames de provider.
- HTTPS obrigatório, DNS resolution e bloqueio de redes privadas/reservadas.
- Redirects bloqueados para evitar bypass de SSRF.
- Generate, embeddings e RAG.
- Limites de timeout e tamanho de resposta.
- Pricing validado e métricas de input/output tokens, erros, latência e custo USD.
- AI Usage com retenção configurável.

Nenhum provider é considerado configurado sem credencial real persistida.

### Messaging avançado

- Push via FCM existente.
- E-mail via SMTP existente.
- SMS via Twilio existente.
- Templates persistentes por canal.
- Campanhas, agendamento e cancelamento.
- Audiência por usuário, role, plataforma e segmentos nomeados.
- E-mail/SMS somente para contatos verificados.
- Segmentos resolvidos também para Push através de `userIds`.
- Claim atômico de campanhas para impedir envio duplicado em múltiplas instâncias.
- Recuperação de campanha presa em `sending` para retry explícito.

## Segurança e isolamento

- Data plane avançado passa pelo API Gateway existente.
- Control plane exige autenticação e organização/projeto/ambiente.
- Operações de gestão exigem role de gerenciamento.
- Avaliação anônima de flags/config/experiments exige `subjectId` estável; não existe bucket global `anonymous`.
- AI Gateway possui SSRF hardening e allowlist de hostnames validada também no ambiente de produção.
- Segredos de AI permanecem criptografados.
- Telemetria e documentos são escopados por projeto/ambiente.

## Migration

A fase adiciona:

`022_advanced_platform_phase7.sql`

Ela cria persistência para segmentos, Remote Config, flags, experiments/assignments, Analytics, App Quality, App Distribution, Search/embeddings, AI providers/usage e Messaging avançado.

## Versões

- Plataforma: **0.9.0**
- SDK oficial `@brisabase/js`: **0.9.0**
- CLI: **0.9.0**

Geradores adicionais continuam preview; apenas `@brisabase/js` é tratado como SDK oficial nesta release.

## Validação executada

- `npm run phase7:verify`: PASS, incluindo regressão cumulativa das Fases 1–6.
- Contrato Phase 7 Advanced Platform: PASS.
- 383 arquivos TS/TSX parseados sem erro sintático.
- 1.166 imports relativos reais resolvidos via AST.
- Build isolado do SDK: PASS.
- JSON: PASS.
- YAML: PASS.
- Shell/CJS/MJS: PASS.
- Configuração self-hosted de produção: PASS.
- AI provider allowlist inválida: rejeitada.
- Retenção fora de 7–730 dias: rejeitada.
- Scanner de segredos externos conhecidos: sem credenciais reais detectadas.

## Gates reservados para o runner final

Como nas fases anteriores, a promoção final em uma máquina com registry npm e Docker disponíveis ainda exige:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```

Esses gates não são substituídos pelos verificadores estruturais desta fase.

## Resultado

**Fase 7: CONCLUÍDA / VERDE.**
