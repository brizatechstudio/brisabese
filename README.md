# BrisaBase

BrisaBase is a local-first backend platform for application development.

## Local development

The supported environment at this stage is local development only. The project is designed to run on a developer machine with Docker and Docker Compose.

### Start the local stack

```powershell
docker compose -f docker-compose.local.yml up -d --build
```

Check services:

```powershell
docker compose -f docker-compose.local.yml ps
```

View BrisaBase logs:

```powershell
docker compose -f docker-compose.local.yml logs --tail=200 brisabase
```

Stop the stack:

```powershell
docker compose -f docker-compose.local.yml down
```

## Validation

Before considering a change complete, run:

```powershell
npm install
npm run lint
npm test
npm run build
```

The local Docker stack should also start successfully with all required services healthy or completed successfully as one-shot initialization jobs.

## Scope

External deployment providers and hosted-environment templates are intentionally out of scope for the current development phase. Keep the repository focused on the local Docker stack until the local product is fully validated.
