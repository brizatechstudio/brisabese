# BrisaBase — Auditoria Final do Mock

Status: **escopo funcional congelável para a fase de mock**.

## Cobertura navegável

- Core BaaS: Projects, PostgreSQL/Table Editor, SQL Editor, NoSQL, Auth, Storage, Functions, Realtime e APIs.
- Platform: Data Platform, Security, Environments/Branches, DevTools/SDK/CLI/IaC, Hosting/Edge, Messaging/Remote Config/Flags.
- Ecosystem: Experiments/Personalization, App Quality/Distribution/Test Lab, Search/AI, Enterprise/Organizations/SCIM/SIEM.
- Operations: Analytics, Logs/APM/Tracing, Usage/Quotas/Cost Controls/Incidents.
- Administration: Settings/API Keys/Webhooks, Members e Billing.

## Regra de implementação

Todos os módulos desta versão permanecem simulados. Recursos criados pelas telas de expansão usam `localStorage` e nenhuma ação provisiona infraestrutura real.

## Auditoria de navegação/ações

- Rotas principais possuem destinos registrados no React Router.
- Busca global inclui os módulos principais e os quatro módulos de ecossistema.
- CTAs das telas PlatformExpansion abrem criação mock e persistem recursos.
- Cards da PlatformExpansion possuem ação **Simular** com feedback via toast.
- SQL Editor permanece o único mock com parser/estado mais profundo, permitindo DDL/DML básico refletido no Table Editor.
- Login social permanece explicitamente simulado; nenhuma credencial externa é enviada.

## Antes do backend real

1. Revisar visualmente todas as resoluções alvo.
2. Rodar `npm run lint` e `npm run build`.
3. Fazer smoke test manual de cada rota e modal.
4. Congelar nomes de recursos, contratos de UI e modelo de navegação.
5. Só então substituir mocks serviço por serviço.

## Resultado da auditoria automática desta entrega

- 28 rotas de aplicação registradas (desconsiderando o catch-all).
- 0 destinos estáticos de navegação sem rota correspondente.
- 0 elementos `<button>` sem `onClick` ou comportamento de submit.
- 62 arquivos `.ts`/`.tsx` transpile-checked sem erro de sintaxe.
- Recursos de `PlatformExpansion` agora são persistidos por projeto em `brisabase_platform_expansion_v1:<projectId>`.

> O build Vite completo depende de uma instalação local consistente das dependências. Neste ambiente, `npm ci` não concluiu; por isso a entrega não inclui `node_modules` e deve ser validada com `npm install && npm run lint && npm run build` na máquina de desenvolvimento.

## Final UI closure — Dark-only + Localization

- Light mode was removed from the product mock. BrisaBase now boots in dark mode only and clears legacy theme keys from localStorage.
- The header theme toggle and all `.light` CSS overrides were removed.
- The main Core BaaS navigation now uses the product name `Storage` instead of `Armazenamento`.
- Settings now includes a `Preferências / Preferences` tab with persisted `Português (Brasil)` and `English (US)` interface choices using `brisabase_language`.
- Main navigation, global search shell, project selector, user menu, notification chrome, settings shell and new-project modal respond to the language choice.
- Identity coverage now explicitly includes Passkeys / WebAuthn in the mock roadmap.

### Static audit results

- Registered application routes: 29
- Navigation targets without a matching route: 0
- Native HTML buttons without an action or submit behavior: 0 (the reusable Button component itself is excluded)
- TypeScript/TSX transpile syntax diagnostics: 0
- Light-theme UI references: 0

The product remains 100% simulated. No real database, OAuth provider, object storage, function runtime, WebSocket service or external infrastructure was connected in this pass.
