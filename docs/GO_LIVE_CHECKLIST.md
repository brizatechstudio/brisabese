# BrisaBase 1.0.1-beta.1 — Go-Live Checklist

Execute também `docs/PUBLIC_BETA_RUNBOOK.md` no ambiente real que receberá usuários. Gates em stack descartável comprovam o mecanismo técnico, mas não substituem DNS/TLS, credenciais, backup/restore e smoke test da implantação final.

Para todas as credenciais, provedores, rotação e testes de aceitação, usar `docs/EXTERNAL_CREDENTIALS_IMPLEMENTATION.md`.

## Código e regressão
- [ ] `npm run phase8:verify`
- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:browser`
- [ ] `npm run release:manifest:verify`
- [ ] `npm run release:validate:docker`

## Produção
- [ ] `BRISABASE_ENV_FILE=.env.production npm run production:validate`
- [ ] imagens imutáveis e secrets únicos;
- [ ] DNS/TLS/custom domains validados;
- [ ] smoke test executado usando as URLs públicas reais;
- [ ] backup automático executado e restore drill do provedor/storage real aprovado;
- [ ] rollback da aplicação testado e candidato anterior conhecido registrado;
- [ ] PITR testado quando habilitado;
- [ ] alertas, status page e on-call definidos conforme a operação realmente disponível;
- [ ] quotas/usage verificados com o plano esperado.

## Billing
- [ ] beta público: `BILLING_PROVIDER=disabled` confirmado; ativação futura: `paddle`;
- [ ] nenhuma credencial Paddle Live é necessária nem deve ativar cobrança durante o beta gratuito;
- [ ] antes de cobrança real, webhook Paddle registrado em `/billing/v1/paddle/webhook` e assinatura validada;
- [ ] checkout/portal/subscription/transaction/refund testados em Paddle Sandbox antes de credenciais Live;
- [ ] pricing, impostos, cancelamento e política de refunds aprovados comercial/juridicamente antes da fase paga.

## Enterprise
- [ ] domínio DNS verificado quando Enterprise for habilitado para clientes;
- [ ] OIDC/SAML Gateway testado com conta não privilegiada;
- [ ] SCIM testado para create/update/disable de usuários e grupos;
- [ ] IP allowlist testada com procedimento de break-glass;
- [ ] SIEM testado e segredos rotacionados;
- [ ] Compliance Center revisado como evidência técnica, não certificação.

Itens Enterprise que não forem oferecidos no beta público gratuito podem permanecer desabilitados, desde que isso esteja claro na oferta e configuração do ambiente.

## Legal e suporte
- [ ] Termos e Política de Privacidade finais publicados após revisão responsável;
- [ ] entidade operadora, jurisdição e canais de contato preenchidos sem placeholders;
- [ ] subprocessadores reais documentados;
- [ ] habilitar Private Vulnerability Reporting e confirmar o `security.txt` versionado;
- [ ] canal privado de suporte/privacidade, responsável operacional e escalonamento P0/P1 publicados.

## Git e release
- [ ] `main` protegida conforme `docs/REPOSITORY_GOVERNANCE.md`;
- [ ] nova tag beta criada somente após o runner final verde no mesmo SHA;
- [ ] commit/release imutável publicado;
- [ ] SBOM, pacotes, digests, logs, traces e manifesto SHA-256 arquivados;
- [ ] evidência de backup/restore, rollback e smoke test vinculada à decisão de go-live.
