# BrisaBase — Fase 3 concluída

Versão: **0.5.0**

Data de fechamento: **2026-08-28**

## Objetivo da fase

Fechar Authentication e Segurança do BrisaBase sobre a base 0.4.0, mantendo isolamento por organização/projeto/ambiente e sem promover recursos de fases posteriores como produção pronta.

## Escopo fechado

### Autenticação de usuários finais

- Cadastro e login por e-mail/senha.
- Verificação e reenvio de verificação de e-mail.
- Recuperação e alteração de senha.
- Política de senha configurável: tamanho mínimo, maiúscula, minúscula, número e símbolo.
- Sessões persistentes, listagem, revogação individual e revogação global.
- Limite de sessões por usuário.
- Refresh tokens com rotação, família de tokens e detecção de replay/reutilização.
- Troca de senha revoga outras sessões e preserva a sessão autenticada atual.
- Anonymous Auth e conversão explícita de conta anônima para conta normal.

### Passwordless

- Magic Link.
- OTP por e-mail.
- OTP por telefone com integração Twilio configurável.
- Lifetime e tentativas máximas dos códigos one-time.
- Fluxos passwordless não marcam MFA como verificado apenas porque o projeto exige MFA.

### MFA

- MFA/TOTP para usuários finais.
- Enrollment, challenge e confirmação.
- Recovery codes.
- Rate limiting de MFA.
- Reconfiguração segura: o fator anterior só é removido depois da confirmação do novo fator.

### Passkeys / WebAuthn

- Registro de passkeys.
- Autenticação por passkey.
- Persistência de credential ID, public key, transports e contador.
- Verificação de challenge.
- Verificação de Origin permitido.
- Verificação de RP ID/hash.
- User Presence e User Verification.
- Verificação criptográfica de assinatura.
- Proteção contra replay por signature counter.

### OAuth e identidades

- Google OAuth.
- GitHub OAuth.
- Microsoft OAuth.
- Discord OAuth.
- Apple Sign-In com validação criptográfica do `id_token`.
- Persistência de identidades externas vinculadas.
- Account linking explícito iniciado por uma sessão autenticada.
- Remoção controlada de identidade vinculada.
- Não existe auto-link por simples coincidência de e-mail; conflitos retornam `ACCOUNT_LINK_REQUIRED`.
- Redirect URLs/origins são validados contra configuração permitida.
- Estado OAuth é vinculado ao fluxo/navegador para proteção contra CSRF/login injection.

### Autorização

- Custom Roles por projeto/ambiente.
- Custom Claims por usuário.
- Claims e role entram no JWT e no contexto usado por RLS.
- Tela administrativa de Roles & Claims.
- Integração visual com policies/RLS existentes.

### Segurança e operação

- Audit events de Auth.
- Proteção contra brute force/rate limiting distribuído via Redis quando configurado.
- Cookies HttpOnly/Secure conforme ambiente.
- Proteção de origem para refresh por cookie.
- Rotação de JWT com `JWT_SECRET_PREVIOUS` durante janela de transição.
- Rotação da chave de criptografia com `AUTH_ENCRYPTION_KEY_PREVIOUS`.
- Secrets OAuth permanecem criptografados em repouso.
- Configuração de WebAuthn, Twilio e key rotation adicionada aos contratos de ambiente e Docker.
- Validador de produção atualizado para os novos requisitos de Auth.

### Administração no console

- Usuários e detalhes do usuário.
- Sessões ativas e revogação.
- Roles & Claims.
- Configurações de senha/passwordless/MFA/passkeys.
- Configuração de providers OAuth.
- Allowed redirect origins.
- Estado real/API sem fallback silencioso para recursos fictícios.

## Migration

A Fase 3 usa **`018_auth_phase3.sql`**. O prefixo 018 foi escolhido para não colidir com migrations existentes (`016_platform_completion.sql` e demais migrations da base 0.4.0).

A migration adiciona, entre outros:

- `auth_identities`;
- `auth_one_time_codes`;
- `auth_passkeys`;
- `auth_custom_roles`;
- `custom_claims` em usuários;
- flags/configurações de Magic Link, OTP, Anonymous Auth, Passkeys, política de senha e redirect origins.

## Gates executados nesta rodada

Aprovados sem infraestrutura externa:

- `npm run phase3:verify`;
- regressão `phase2:verify`;
- regressão `phase1:verify`;
- compatibilidade de upgrade legado da Fase 1;
- contrato `auth-phase3-contract.test.cjs`;
- verificação sintática TS/TSX via compilador TypeScript disponível no runner, sem resolver dependências externas;
- resolução estática de imports relativos;
- validação de JSON/YAML e sintaxe dos scripts Node/shell;
- validação do manifesto e empacotamento final.

## Gates reservados para o runner final

Conforme o plano do projeto, os gates que exigem dependências completas e infraestrutura ficam para o runner final no computador do projeto:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:docker
npm run release:validate:docker
```

Também devem ser executados nesse momento os testes reais de SMTP/Twilio, callbacks OAuth com credenciais de homologação, WebAuthn em navegador real, concorrência, brute force distribuído, PostgreSQL/Redis/Docker e E2E.

## Critério de encerramento

A Fase 3 é considerada concluída no código quando os contratos estruturais da própria fase e as regressões das Fases 1 e 2 permanecem verdes. A promoção para produção continua condicionada aos release gates finais no runner completo.
