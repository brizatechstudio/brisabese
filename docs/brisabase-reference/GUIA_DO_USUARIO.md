# Guia de uso do BrisaBase

Este guia é para quem administra um projeto no BrisaBase e para quem precisa garantir que cada pessoa veja somente os próprios dados. Para integrar uma aplicação web, mobile ou servidor, leia também o [guia de integração](INTEGRACAO_DE_APLICACOES.md).

## Conceitos que protegem os dados

O isolamento tem três camadas, e as três devem estar configuradas:

| Camada | Para que serve | O que impede |
| --- | --- | --- |
| Organização | Separa empresas/equipes | Um membro sem vínculo não administra outra organização. |
| Projeto e ambiente | Separa aplicações e `development`/`staging`/`production` | Uma credencial não troca de projeto ou ambiente por cabeçalho. |
| RLS | Separa os registros de cada usuário final | Um usuário autenticado não lê, altera ou apaga linhas de outra pessoa. |

Uma função de equipe como `admin` permite administrar o projeto. Ela **não** substitui as policies RLS dos dados da sua aplicação. Para dados por usuário, configure sempre as quatro policies abaixo.

## 1. Iniciar e entrar

Para o ambiente local, com o Docker Desktop em execução:

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

Abra `http://localhost:3000` e entre com uma conta administrativa. Em uma instalação nova, crie o primeiro owner pelo procedimento de administrador do [guia de Docker de produção](deployment/docker.md#first-administrator). Não publique as credenciais do ambiente local nem as use fora dele.

Verifique a saúde antes de trabalhar:

```powershell
Invoke-WebRequest http://localhost:3000/health/required
```

O serviço só está pronto quando a resposta for HTTP 200 e indicar as dependências como saudáveis.

## 2. Criar o espaço da aplicação

No painel:

1. Crie ou escolha uma **organização**.
2. Crie um **projeto** para a sua aplicação.
3. Use ambientes separados para desenvolvimento, homologação e produção.
4. No ambiente desejado, crie as tabelas, buckets e policies de segurança.
5. Convide somente as pessoas que precisam administrar o projeto e atribua o menor papel necessário.

Papéis de organização:

| Papel | Uso recomendado |
| --- | --- |
| `owner` | Proprietário da organização; mantenha poucos. |
| `admin` | Administração do projeto e membros. |
| `developer` | Desenvolvimento do projeto, sem administração total. |
| `viewer` | Consulta de configurações e dados autorizados. |
| `billing` | Acesso a faturamento, quando configurado. |

Um usuário final da sua aplicação não precisa ser membro da organização. Ele usa o fluxo de autenticação público da aplicação e só recebe os dados liberados pelas suas policies RLS.

## 3. Criar uma tabela privada por usuário

Exemplo: uma aplicação de tarefas. Crie a tabela `tasks` com ao menos estes campos:

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | `text` | Chave primária. |
| `owner_id` | `text` | Obrigatória; contém o ID do usuário autenticado. |
| `title` | `text` | Obrigatória. |
| `completed` | `boolean` | Opcional, com valor padrão definido pela aplicação. |
| `created_at` | `text` ou data/hora | Opcional. |

Em **Security / Policies**, crie estas quatro policies para o recurso `table` `tasks`:

| Operação | Condição |
| --- | --- |
| `SELECT` | `row.owner_id = auth.uid()` |
| `INSERT` | `new.owner_id = auth.uid()` |
| `UPDATE` | `row.owner_id = auth.uid() and new.owner_id = auth.uid()` |
| `DELETE` | `row.owner_id = auth.uid()` |

Essas condições são avaliadas no BrisaBase. Portanto, enviar `owner_id` de outra pessoa pelo navegador não concede acesso: a inserção, alteração ou leitura é negada. Em runtime real, a ausência de uma policy correspondente é negada por padrão.

Nunca use uma policy `true` para uma tabela privada. Use-a apenas quando os dados forem realmente públicos e isso tiver sido revisado.

### Checklist de isolamento

Antes de publicar:

1. Cadastre duas contas de teste, A e B.
2. Crie uma tarefa de A com `owner_id` de A.
3. Com o token de B, tente listar, consultar por ID, alterar, excluir e criar uma linha com o `owner_id` de A.
4. Todos os acessos de B devem retornar lista vazia, `403`, `404` ou outro resultado negado pela API — nunca a linha de A.
5. Faça o mesmo para cada tabela, bucket e canal Realtime privado.

O contrato Docker do BrisaBase executa esse padrão de isolamento com usuários distintos; o teste da sua aplicação deve cobrir as tabelas e regras que você criou.

## 4. Autenticação dos usuários finais

Sua aplicação deve usar somente os endpoints públicos de Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/user`
- `POST /api/auth/logout`

Guarde o access token apenas no armazenamento seguro da plataforma. Em um navegador, prefira memória e um mecanismo de sessão apropriado à sua aplicação; em mobile, use o armazenamento seguro do sistema operacional. Ao receber 401, renove a sessão uma vez; se continuar 401, faça logout e peça novo login.

Não use o login administrativo (`/api/admin/auth/*`) dentro da sua aplicação para usuários finais. Ele existe para o painel de controle e não é uma API de dados da aplicação.

## 5. Chaves e segredos

| Credencial | Pode ir no navegador? | Uso |
| --- | --- | --- |
| Access token do próprio usuário | Sim, somente durante a sessão | Auth, dados, Storage e Realtime submetidos a RLS. |
| Chave `public` do projeto | Sim, se o endpoint exigir | Identifica o projeto; não substitui RLS. |
| Chave `secret` | Não | Backend confiável, quando necessário. |
| Chave `service` | Não, nunca | Operação interna/auditada; pode executar bypass RLS explícito. |
| Senhas de banco, Redis, MinIO e S3 | Não | Apenas infraestrutura. |

Não envie duas credenciais concorrentes em uma chamada autenticada. Para a sessão do usuário, envie o JWT. O BrisaBase rejeita chaves com cabeçalhos de organização, projeto ou ambiente que não correspondam ao escopo real da chave.

## 6. Arquivos privados

Para cada bucket privado, mantenha o mesmo princípio do banco:

- use caminho com o ID do usuário, por exemplo `usuarios/<auth.uid()>/foto.png`;
- crie policies de `SELECT`, `INSERT`, `UPDATE` e `DELETE` que comparem o proprietário do objeto com `auth.uid()`;
- gere URL assinada apenas depois de a policy autorizar a leitura;
- não exponha `storageKey`, credenciais S3 ou uma service key ao cliente.

O Storage aplica as policies antes de listar, baixar, enviar, restaurar ou apagar objetos.

## 7. Realtime e Functions

Assine apenas tabelas que já têm policy de leitura adequada. Realtime reaplica o contexto de projeto, ambiente e usuário; ele não deve ser usado como atalho para consultar uma tabela privada.

Functions em modo `service` são trabalho de backend confiável e podem fazer bypass de RLS de forma explícita e auditável. Não habilite esse modo para uma função controlada por usuário nem exponha uma credencial de serviço no cliente. As Functions embutidas permanecem desabilitadas na topologia de produção certificada atualmente.

## 8. Problemas comuns

| Resposta | Causa provável | Ação |
| --- | --- | --- |
| 401 | Token ausente, expirado ou inválido | Tente renovar a sessão; se falhar, peça login. |
| 403 | RLS, papel ou escopo negado | Corrija a policy ou o escopo; não tente contornar com service key no navegador. |
| 404 | Registro/objeto não existe ou é ocultado por policy | Não revele a existência do dado ao usuário. |
| 409 | Conflito de cadastro ou estado | Leia a resposta e apresente uma ação de correção. |
| 429 | Rate limit | Respeite `Retry-After` ou faça poucas tentativas com backoff. |

Para código e exemplos de Web, mobile, Storage e Realtime, continue no [guia de integração](INTEGRACAO_DE_APLICACOES.md).
