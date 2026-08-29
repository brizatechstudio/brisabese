# BrisaBase 1.0.0 — Fase 8 concluída

## Escopo

A Fase 8 fecha Billing, Enterprise, Infrastructure as Code e o pacote operacional/comercial necessário para a release 1.0.0. Ela não declara certificações legais/compliance nem substitui a validação final em runner com Docker e dependências completas.

## Billing

- Planos Free, Pro, Team e Enterprise.
- Modo self-hosted sem processador externo (`BILLING_PROVIDER=disabled`).
- Stripe opcional para checkout, portal, subscriptions, invoices, Automatic Tax e refunds.
- Webhook Stripe com body bruto, HMAC SHA-256, comparação timing-safe e idempotência.
- Reserva transacional de refunds para evitar reembolso concorrente acima do saldo disponível.
- Ledger de uso idempotente, quotas rígidas no Free e overage nos planos pagos.
- Permissão `billing` separada no control plane; dados completos de cartão não são armazenados pelo BrisaBase.

## Enterprise

- Domínios organizacionais verificados por DNS TXT.
- OIDC nativo com PKCE S256 e e-mail verificado.
- SAML via gateway externo responsável por XMLDSig; identidade encaminhada é HMAC-assinada.
- JIT provisioning, enforced SSO e MFA administrativo por política.
- SCIM com tokens armazenados somente por hash.
- RBAC/custom roles, IP allowlist IPv4/IPv6, audit export e SIEM com secrets criptografados.
- Compliance Center com evidências técnicas; sem alegação automática de certificação SOC 2/GDPR.

## Infrastructure as Code

- Export de manifest por projeto/ambiente.
- Checksum SHA-256 canônico que ignora `generatedAt`.
- Drift detection.
- Histórico de exports.
- CLI `iac export`, `iac diff`, `iac check` e `iac history`.
- Terraform bridge com manifest checksum-pinned e `BRISABASE_TOKEN` como secret.

## Preparação de lançamento

- Templates de Termos e Privacidade marcados para revisão jurídica obrigatória.
- Guia de segurança.
- Política inicial de suporte/severidade.
- Documento de pricing técnico.
- Go-live checklist com gates de código, produção, billing, Enterprise, legal e release.

## Validação desta release

O fechamento exige:

```bash
npm run phase8:verify
```

mais parser TypeScript/TSX independente, resolução de imports, build isolado do SDK, validação de JSON/YAML/scripts, configuração positiva/negativa de produção, scanner de secrets, manifesto SHA-256 e round-trip do ZIP.

Os gates que exigem a instalação completa de dependências e infraestrutura continuam reservados ao runner final:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run release:validate:docker
```


## Resultado da validação local de fechamento

- `phase8:verify`: PASS, acumulando Fases 1–8.
- Parser independente: 372 arquivos TS/TSX sem erro sintático.
- Resolução de imports relativos: 1.223 imports resolvidos.
- SDK `@brisabase/js` 1.0.0: build isolado PASS.
- JSON, YAML e scripts CJS/MJS/shell: PASS.
- Validador de produção: PASS com billing desativado e PASS com configuração Stripe estruturalmente válida; credencial Stripe fraca é rejeitada.
- Scanner de segredos de alta confiança: PASS.
- `npm ci`: tentativa executada, mas excedeu o limite de 90 segundos deste ambiente; o `node_modules` parcial foi removido.

## Congelamento do artefato

- Manifesto SHA-256: 529 arquivos de origem/distribuição.
- ZIP: 530 arquivos incluindo `SOURCE_SHA256SUMS.txt`.
- Integridade ZIP: PASS.
- Round-trip em diretório limpo: 529/529 hashes conferidos.
- `phase8:verify` dentro do pacote extraído: PASS.
- rebuild isolado do SDK dentro do pacote extraído: PASS e determinístico.

## Release

Versão: **BrisaBase 1.0.0**.

A release somente deve receber tag/publicação definitiva após o runner final acima permanecer verde e o checklist `docs/GO_LIVE_CHECKLIST.md` ser concluído.
