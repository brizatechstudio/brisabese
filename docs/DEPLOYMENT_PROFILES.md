# BrisaBase Deployment Profiles

BrisaBase uses one application codebase and one public API surface across deployment sizes. Profiles change topology and operational guarantees; they do not change project schemas or SDK contracts.

## CLI-first onboarding

The official `brisabase` command is the recommended entrypoint for deployment profiles and named targets. Repository-maintainer scripts such as `npm run deployment -- ...` and `npm run target -- ...` remain available for compatibility, but user-facing examples use the CLI directly.

For the simplest local path:

```bash
brisabase deployment init hobby
brisabase up
```

`brisabase up` is intentionally a Hobby-only shortcut. Use `brisabase deployment up <profile>` for Self-Hosted or Enterprise so a production topology is always explicit.

## 1. Hobby / Local

Audience: beginners, students, prototypes and personal projects.

Topology:
- BrisaBase API/console in Docker;
- PostgreSQL, Redis, MinIO and Mailpit bundled locally;
- Functions Executor isolated in its own container;
- all host ports bound to `127.0.0.1` by the base local Compose;
- development-only local credentials are never accepted by the production validator.

Start:

```bash
brisabase deployment init hobby
brisabase up
# Equivalent explicit form:
brisabase deployment up hobby
```

The generated `.env.hobby` is intentionally local-only. Do not expose the Hobby stack directly to the internet.

## 2. Self-Hosted

Audience: professional developers, startups and teams running BrisaBase on one VPS or dedicated server.

Topology:
- bundled PostgreSQL, Redis and MinIO;
- Caddy TLS edge;
- isolated Functions execution plane;
- persistent Docker volumes;
- production secrets and immutable dependency images;
- production contract explicitly limited to `single-host`.

Start:

```bash
brisabase deployment init self-hosted
# BrisaBase secrets are generated automatically with independent random values.
# Configure domains and immutable image digests in .env.production.
brisabase deployment doctor self-hosted
brisabase deployment up self-hosted
```

`deployment init` writes the generated production environment with restrictive file permissions where the operating system supports them. It does not print generated secret values to the console.

`BRISABASE_PRODUCTION_TIER=ha` is deliberately rejected for this profile. High availability requires external infrastructure and the Enterprise profile.

## 3. Enterprise / External Infrastructure

Audience: large companies and regulated environments that already operate managed databases, caches, object storage, ingress/WAF and centralized observability.

Topology:
- BrisaBase application container, suitable for replication by the customer's orchestrator;
- a short-lived hardened migration container that receives `DATABASE_MIGRATION_URL`;
- the long-running BrisaBase runtime receives only the lower-privilege `DATABASE_URL`;
- external PostgreSQL over TLS;
- external authenticated Redis over TLS;
- external S3-compatible storage over HTTPS;
- optional external Functions execution service over HTTPS;
- optional bundled Caddy edge (`--profile edge`) or an existing corporate load balancer/WAF;
- `managed` deployment mode and `ha` production tier;
- no bundled PostgreSQL, Redis, MinIO or single-node Functions Executor in `docker-compose.enterprise.yml`.

The Enterprise profile deliberately does not label the single Functions container used by Hobby/Self-Hosted as HA. `FUNCTIONS_ENABLED=false` is the safe default. When a company deploys a replicated Functions plane behind its own internal/public HTTPS service, set:

```bash
FUNCTIONS_ENABLED=true
FUNCTIONS_EXECUTOR_URL=https://functions.example.com
FUNCTIONS_EXECUTOR_TOKEN=<unique-random-secret>
FUNCTIONS_RPC_CALLBACK_ORIGIN=https://brisabase.example.com
```

Start:

```bash
brisabase deployment init enterprise
# BrisaBase-owned secrets are generated automatically.
# Configure PostgreSQL/Redis/S3 credentials, domains and immutable images.
brisabase deployment doctor enterprise
brisabase deployment up enterprise
```

The application credential and migration credential must be different accounts in real enterprise infrastructure. `DATABASE_MIGRATION_URL` is consumed only by the migration service; it is intentionally absent from the application container.

Optional bundled edge:

```bash
docker compose --env-file .env.enterprise -f docker-compose.enterprise.yml --profile edge up -d
```

## Railway (minimal external services)

Railway is a production deployment mode for one BrisaBase service using Railway PostgreSQL and Redis. It is intentionally separate from the Self-Hosted Compose profile: Railway does not need the bundled PostgreSQL, Redis, MinIO, Caddy, or Functions containers.

1. Add PostgreSQL and Redis services to the same Railway project.
2. Deploy this repository as the BrisaBase service; `railway.json` selects the repository Dockerfile and `GET /healthz` as the deployment health check.
3. Import `.env.railway.example` into the BrisaBase service, use Railway reference variables for `DATABASE_URL` and `REDIS_URL`, and generate each `REPLACE_WITH_*` value independently with `npm run secrets:generate`.
4. Generate a public domain before the first production deployment. `RAILWAY_PUBLIC_DOMAIN` supplies the default HTTPS/WSS/CORS values when explicit URLs are omitted.

The initial Railway template keeps Storage, Functions, SMTP, backups/PITR, Hosting, and persistent observability disabled. The application still requires PostgreSQL, Redis, and the authentication/operations secrets. Enable a module only after its provider and secrets have been configured. For example, storage on Railway requires an external S3-compatible HTTPS endpoint; it does not start MinIO inside the BrisaBase service.

`DATABASE_SSL` and `REDIS_TLS` are explicit in the template because Railway private networking can use non-TLS connections. Set them to `true` when using public/TLS provider URLs.

## Switching a project between local and remote instances

`brisabase.json` contains the API URL used by the CLI. Named targets preserve several safe origins and switch that URL without moving credentials into the target file.

```bash
brisabase target add local http://localhost:3000
brisabase target add empresa https://baas.empresa.com
brisabase target list
brisabase target use empresa
brisabase target doctor empresa
```

Remote targets must use HTTPS. URLs containing usernames, passwords, query strings or fragments are rejected. `brisabase.targets.json` contains only target names and URLs and is ignored by Git so workstation-specific target state is not committed accidentally. The stored admin session remains in the CLI session store.

This supports the intended workflow:

```text
same application + same migrations + same SDK
              │
       ┌──────┴──────┐
       │             │
 localhost       own server
       │             │
       └──── target switch ────┘
```

## Migration path

A team can grow without changing application code:

```text
Hobby / localhost
      ↓
Self-Hosted / one VPS
      ↓
Enterprise / external PostgreSQL + Redis + S3 + ingress
```

Keep the same project IDs, migrations, REST/GraphQL contracts and SDK. Move infrastructure components through supported configuration and controlled backup/restore procedures rather than copying live database files.

## Profile rules

| Control | Hobby | Self-Hosted | Enterprise |
| --- | --- | --- | --- |
| Internet-facing production | No | Yes | Yes |
| Bundled PostgreSQL | Yes | Yes | No |
| Bundled Redis | Yes | Yes | No |
| Bundled MinIO | Yes | Yes | No |
| Bundled Functions executor | Yes | Yes | No; external HTTPS when enabled |
| TLS required | No (loopback) | Yes | Yes |
| Distributed Redis coordination | Local Redis | Bundled Redis | External Redis |
| Migration credential in app runtime | N/A/local | Bundled topology | No; migration service only |
| HA claim | No | No | Yes, infrastructure-dependent |
| Corporate WAF/LB | Optional/not needed | Optional | Recommended |
| External observability | Optional | Optional | Recommended |

## Important distinction: plan vs deployment profile

Commercial tiers (Free/Pro/Team/Enterprise) are billing/entitlement concepts. Deployment profiles (Hobby/Self-Hosted/Enterprise) describe infrastructure topology. Do not infer a commercial entitlement only from the Compose file a customer runs.
