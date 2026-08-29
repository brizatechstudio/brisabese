# BrisaBase Real App

Aplicação Vite/React independente para provar o uso do BrisaBase como BaaS. O bundle importa somente o `BrisaBaseClient` público e faz chamadas HTTPS/WebSocket para `http://localhost:3000`. Não contém import do servidor, repositórios, engines, PostgreSQL, Redis, MinIO ou credenciais de infraestrutura.

## Preparação

1. Inicie o ambiente real:

   ```powershell
   docker compose -f docker-compose.local.yml up -d --build
   ```

2. Copie `examples/real-app/.env.example` para `examples/real-app/.env`. Os valores `VITE_*` são seguros para o navegador. `VITE_BRISABASE_PUBLIC_KEY` é opcional no estado atual: as chamadas autenticadas usam o JWT da sessão, sem enviar uma chave de API concorrente.

3. Crie uma API key `public` pelo painel/API administrativo se quiser preenchê-la. Nunca coloque uma chave `service`, `secret`, JWT de outra pessoa, senha de banco, chave S3 ou Redis no `.env` do browser.

4. Faça o bootstrap de desenvolvimento e valide o contrato. A chave de serviço fica somente no processo de teste, fora do Vite:

   ```powershell
   Set-Location examples/real-app
   $env:BRISABASE_E2E_SERVICE_KEY = 'bb_srv_local_development_only'
   $env:BRISABASE_E2E_TEST_PASSWORD = 'troque-por-uma-senha-de-teste-com-12-caracteres'
   npm run test:e2e
   ```

   Esse bootstrap usa **as APIs HTTP públicas** para criar, de forma idempotente, as tabelas `external_products` e `external_realtime_events`, o bucket `external-real-app`, policies RLS e a Function `external-hello-world`. A chave nunca é lida pelo app em execução no navegador.

5. Inicie o app:

   ```powershell
   npm run dev
   ```

   Abra `http://localhost:5173`. Para usar outra origem em produção, inclua essa origem em `CORS_ALLOWED_ORIGINS` no BrisaBase.

## Fluxos demonstrados

- Signup, login, `getUser`, refresh com rotação e logout via `BrisaBaseClient.auth`.
- Solicitação/confirmação de reset e confirmação/reenvio de e-mail pelos endpoints públicos. Os e-mails locais aparecem em [Mailpit](http://localhost:8025).
- CRUD de `external_products`, busca `ilike`, filtro de preço, ordenação e paginação. As policies persistidas permitem somente linhas com `owner_id = auth.uid()`.
- Upload, lista, URL assinada para visualização, download e exclusão no MinIO por `BrisaBaseClient.storage`. O prefixo do objeto é o ID do usuário e a policy de Storage é avaliada pelo BrisaBase; `storageKey` interno não é retornado.
- Canal WebSocket por `BrisaBaseClient.channel`. O teste usa uma tabela compartilhada de eventos para que dois clientes recebam eventos sem expor produtos protegidos por RLS.
- Execução da Function persistida por `BrisaBaseClient.functions.invoke`.
- Dashboard de health e monitor de requisições que mostra status, endpoint e latência sem registrar tokens nem corpos de requisição.

## Scripts

```powershell
npm run dev
npm run build
npm run test:e2e
npm run test
```

`test:e2e` é um teste de contrato real e sem mocks: exercita SDK/API, Auth, refresh/logout, filtros REST, CRUD/RLS com dois usuários, Storage/RLS, URL assinada, WebSocket, Function e respostas 401/403/404/409/429. Ele não usa Playwright; o projeto não tinha esse runner instalado e o teste headless valida diretamente o mesmo contrato público que o browser usa.

## Reinício real

Com as duas variáveis de teste ainda configuradas:

```powershell
./tests/restart-e2e.ps1
```

O script executa o E2E, reinicia apenas o container `brisabase`, espera `/health` e executa o E2E novamente. A segunda rodada reaproveita tabelas, bucket, policies e Function persistidos, acessando-os novamente via APIs públicas.

## Limitações conhecidas

Consulte [BRISABASE_EXTERNAL_CLIENT_GAP.md](../../BRISABASE_EXTERNAL_CLIENT_GAP.md). Em especial, o SDK ainda é consumido por alias de workspace porque não há pacote npm publicável separado neste repositório.
