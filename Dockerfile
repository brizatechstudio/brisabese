ARG NODE_BUILD_IMAGE=node:22.18.0-bookworm-slim
ARG NODE_RUNTIME_IMAGE=node:22.18.0-bookworm-slim

FROM ${NODE_BUILD_IMAGE} AS build

# Non-secret compile-time frontend mode. Render exposes Blueprint env vars to the
# runtime, but Vite reads VITE_* during the image build. Keep this ARG limited
# to a non-secret mode selector; never declare provider credentials as ARGs.
ARG VITE_DATA_SOURCE=api
ENV VITE_DATA_SOURCE=${VITE_DATA_SOURCE}

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_RUNTIME_IMAGE} AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The bundled control plane keeps esbuild external because function compilation
# happens at runtime. Package only the lock-resolved compiler and its platform
# binary rather than installing every development dependency in production.
COPY --from=build /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=build /app/node_modules/@esbuild ./node_modules/@esbuild

# Backup/Restore supports the two production database majors used by BrisaBase:
# self-hosted PostgreSQL 16 and managed Neon PostgreSQL 18. The public pg_dump /
# pg_restore commands below are wrappers that inspect server_version_num and
# dispatch to the exact matching major instead of relying on cross-major restore
# behavior.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 postgresql-client-18 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/server/backup/postgres-tool-router.cjs /usr/local/lib/brisabase/postgres-tool-router.cjs
RUN printf '%s\n' '#!/bin/sh' 'exec node /usr/local/lib/brisabase/postgres-tool-router.cjs pg_dump "$@"' > /usr/local/bin/pg_dump \
  && printf '%s\n' '#!/bin/sh' 'exec node /usr/local/lib/brisabase/postgres-tool-router.cjs pg_restore "$@"' > /usr/local/bin/pg_restore \
  && chmod 0755 /usr/local/bin/pg_dump /usr/local/bin/pg_restore

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/db/migrations ./server/db/migrations
# Shared TLS and upgrade-compatibility helpers are required by the operator DB
# tools copied below. Keep them beside the CommonJS callers so relative requires
# also work in production and disposable migration containers.
COPY --from=build /app/server/db/pg-ssl-options.cjs ./server/db/pg-ssl-options.cjs
COPY --from=build /app/server/db/legacy-compat.cjs ./server/db/legacy-compat.cjs
# Kept for explicit operator use only; production startup does not invoke it.
COPY --from=build /app/server/db/migrate.cjs ./server/db/migrate.cjs
COPY --from=build /app/server/db/status.cjs ./server/db/status.cjs
COPY --from=build /app/server/db/admin-create.cjs ./server/db/admin-create.cjs
# Deployment/orchestrator configuration is validated by the release/deploy gate.
# The application performs its own strict runtime-only validation through
# config.assertRealRuntime() before connecting to any dependency.
COPY --from=build /app/scripts/validate-production-env.cjs ./scripts/validate-production-env.cjs

EXPOSE 3000
# Liveness is intentionally independent from external dependencies. Compose
# retains /health/required for self-hosted readiness; PaaS providers use /healthz.
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r)=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server/server.cjs"]

# Disposable integration target. It contains the seed used by destructive
# Docker restore tests. The local database is PostgreSQL 16, so the restore
# drill proves that the router selects the v16 binaries even though v18 is also
# packaged for the managed Neon target.
FROM runtime AS integration
USER root
RUN /usr/lib/postgresql/16/bin/pg_dump --version | grep -E ' 16\.' >/dev/null \
  && /usr/lib/postgresql/18/bin/pg_dump --version | grep -E ' 18\.' >/dev/null \
  && pg_dump --version | grep -E ' 18\.' >/dev/null
COPY --from=build /app/server/db/seed.cjs ./server/db/seed.cjs
RUN mkdir -p /app/server/backup/data && chown node:node /app/server/backup/data
USER node

# Keep this as the final/default Dockerfile target.
FROM runtime AS production
