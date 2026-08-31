# BrisaBase — Desenvolvimento Local

Nesta fase o BrisaBase é tratado como um projeto local-first. A instalação suportada usa Node.js 22, npm 10/11 e Docker Compose.

## Pré-requisitos

- Node.js >= 22 < 23
- npm >= 10 < 12
- Docker Desktop com Docker Compose ativo

## Instalação

```powershell
npm install
```

## Ambiente local

O ambiente padrão usa `.env.hobby` como arquivo local, criado a partir de `.env.hobby.example`.

```powershell
npm run local:init
```

Verifique o ambiente:

```powershell
npm run local:doctor
```

Suba todos os serviços:

```powershell
npm run local:up
```

Consulte o estado:

```powershell
npm run local:status
```

Consulte os logs da aplicação:

```powershell
npm run local:logs
```

Pare o ambiente:

```powershell
npm run local:down
```

## Serviços locais

O Compose local fornece PostgreSQL, Redis, MinIO, Mailpit, Functions Executor, migração/seed e o servidor BrisaBase.

Redis é um serviço interno do Compose e não publica a porta 6379 no host. Isso evita conflito com uma instalação local do Redis.

As portas públicas locais são ligadas a `127.0.0.1`.

## Validação de código

```powershell
npm run lint
npm test
npm run build
```

Para os testes de integração que exigem o stack Docker:

```powershell
npm run test:docker
```

## URL local

Depois de o serviço `brisabase` ficar saudável:

```text
http://localhost:3000
```

A readiness pode ser verificada em:

```text
http://localhost:3000/health/required
```

## Escopo atual

Configurações de Railway, Render, Neon/PaaS e outros ambientes de hospedagem externa não fazem parte do fluxo de desenvolvimento desta fase. O repositório deve permanecer focado no stack local até a validação completa do produto.
