# Integração segura de aplicações

Use o BrisaBase como BaaS por HTTPS e WebSocket. Sua aplicação cliente nunca deve falar diretamente com PostgreSQL, Redis, MinIO ou com serviços internos do Docker.

Antes de começar, crie o projeto, ambiente, tabelas e policies conforme o [guia de uso](GUIA_DO_USUARIO.md). O exemplo funcional completo está em [`examples/real-app`](../examples/real-app/README.md).

## Configuração do cliente

No frontend, mantenha somente configuração pública:

```env
VITE_BRISABASE_URL=https://api.exemplo.com
VITE_BRISABASE_PROJECT_ID=proj_...
VITE_BRISABASE_ENVIRONMENT_ID=env_...
VITE_BRISABASE_PUBLIC_KEY=
```

Em desenvolvimento local, `VITE_BRISABASE_URL` é normalmente `http://localhost:3000`. Em produção, use `https://` e configure a origem do seu frontend em `CORS_ALLOWED_ORIGINS` antes de publicar.

Não inclua `VITE_BRISABASE_SERVICE_KEY`, senha de banco, Redis, MinIO, S3, token administrativo ou segredo de Function em variável com prefixo `VITE_`. Tudo com esse prefixo pode entrar no bundle do navegador.

## Web com o cliente TypeScript

O cliente público é `src/sdk/brisaBaseClient.ts`. Enquanto não houver pacote npm separado, use o alias do workspace do exemplo ou copie o cliente para a camada pública do seu monorepo.

```ts
import { BrisaBaseClient } from '@brisabase/js';

const client = new BrisaBaseClient({
  url: import.meta.env.VITE_BRISABASE_URL,
  projectId: import.meta.env.VITE_BRISABASE_PROJECT_ID,
  environmentId: import.meta.env.VITE_BRISABASE_ENVIRONMENT_ID,
});
```

### Cadastro, login e renovação

```ts
const registered = await client.auth.signUp({
  email: 'ana@example.com',
  password: 'uma-senha-com-pelo-menos-12-caracteres',
  displayName: 'Ana',
});

const loggedIn = await client.auth.signInWithPassword(
  'ana@example.com',
  'uma-senha-com-pelo-menos-12-caracteres',
);

client.setAccessToken(loggedIn.session.access_token);

// Renove antes de expirar ou depois de um único 401 recuperável.
const refreshed = await client.auth.refreshSession(loggedIn.session.refresh_token);
client.setAccessToken(refreshed.access_token);
```

Não persista senha. Ao encerrar a sessão, chame `client.auth.signOut()` e limpe o token do estado local. Trate 401 como sessão expirada, 403 como autorização negada e 429 com backoff limitado, respeitando `Retry-After` quando presente.

### Dados privados com RLS

Defina a tabela e as quatro policies da seção “Criar uma tabela privada por usuário” do [guia de uso](GUIA_DO_USUARIO.md). O cliente pode então usar a API sem filtro de `owner_id` imposto pelo browser:

```ts
type Task = { id: string; owner_id: string; title: string; completed: boolean };

const me = await client.auth.getUser();

const created = await client.from<Task>('tasks').insert({
  id: crypto.randomUUID(),
  owner_id: me.id,
  title: 'Revisar políticas RLS',
  completed: false,
});

const mine = await client
  .from<Task>('tasks')
  .select('*')
  .order('title', { ascending: true })
  .limit(50)
  .get();
```

O `owner_id` é enviado para identificar a linha, mas a decisão final é do RLS no servidor. Uma tentativa de falsificar o ID de outra pessoa deve falhar.

### Storage privado

```ts
const file = document.querySelector<HTMLInputElement>('#avatar')!.files![0];
const path = `usuarios/${me.id}/${file.name}`;

await client.storage.from('avatars').upload(path, file, {
  metadata: { uploadedBy: me.id },
});

const signed = await client.storage.from('avatars').createSignedUrl(path, 60);
```

Faça a policy do bucket comparar o dono do objeto/caminho com `auth.uid()`. Não construa URL direta do MinIO nem retorne segredos S3 ao cliente.

### Realtime

```ts
const channel = client
  .channel('minhas-tarefas')
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'tasks',
  }, (event) => console.log(event))
  .subscribe();

// Ao desmontar a tela:
await channel.unsubscribe();
```

Realtime respeita o contexto autenticado e as policies. Não use uma tabela compartilhada sem revisar quem pode ler cada evento.

## Sem SDK: contrato HTTP

Qualquer cliente — React Native, Flutter, Unity, C#, backend ou CLI — pode usar o mesmo contrato público:

| Recurso | Endpoint/protocolo |
| --- | --- |
| Auth | `/api/auth/signup`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/user`, `/api/auth/logout` |
| Dados | `/rest/v1/{tabela}` |
| Storage | `/storage/v1/object/{bucket}/{caminho}` e URLs assinadas |
| Realtime | `wss://{host}/realtime/v1/websocket` |

Exemplo de leitura HTTP com JWT:

```ts
const response = await fetch(`${baseUrl}/rest/v1/tasks?order=title.asc&limit=50`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!response.ok) throw new Error(`BrisaBase respondeu HTTP ${response.status}`);
const tasks = await response.json();
```

O cliente mobile deve guardar o token no cofre seguro do sistema operacional e usar `https://`/`wss://` em produção. Nunca embuta uma chave `service`.

## Backend confiável

Um backend seu pode usar uma chave `secret` ou `service` somente quando houver um motivo explícito e auditável. Restrinja a chave ao projeto/ambiente correto, guarde-a em um gerenciador de segredos e não a repasse ao navegador.

Uma chave `service` pode executar bypass RLS quando esse bypass é solicitado explicitamente. Por isso, trate-a como credencial de infraestrutura: valide o usuário no seu backend, autorize cada ação e registre auditoria antes de usá-la.

## Teste obrigatório antes do deploy

Para cada recurso privado, automatize este cenário:

1. Crie dois usuários finais, A e B.
2. Insira com A um registro e um arquivo privados.
3. Autenticado como B, tente ler, alterar, apagar e inserir em nome de A.
4. Confirme que B não recebe o registro/arquivo e que as escritas são negadas.
5. Execute o mesmo cenário por REST, SDK, Storage e Realtime quando usados.

O exemplo [`examples/real-app`](../examples/real-app/README.md) e os testes de integração do repositório demonstram esse fluxo. A responsabilidade de criar policies específicas para as suas tabelas continua sendo da aplicação.
