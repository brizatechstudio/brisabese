ARG NODE_BUILD_IMAGE=node:22.18.0-bookworm-slim
ARG NODE_RUNTIME_IMAGE=node:22.18.0-bookworm-slim

FROM ${NODE_BUILD_IMAGE} AS build

# Non-secret compile-time frontend mode. Keep this ARG limited to a non-secret
# selector; never declare provider credentials as build arguments.
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

# The local stack uses PostgreSQL 16. Keep both dump and restore commands routed
# through BrisaBase so restore tooling cannot accidentally use an incompatible
# client binary for the running local server.
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
COPY --from=build /app/server/db/pg-ssl-options.cjs ./server/db/pg-ssl-options.cjs
COPY --from=build /app/server/db/legacy-compat.cjs ./server/db/legacy-compat.cjs
COPY --from=build /app/server/db/migrate.cjs ./server/db/migrate.cjs
COPY --from=build /app/server/db/status.cjs ./server/db/status.cjs
COPY --from=build /app/server/db/admin-create.cjs ./server/db/admin-create.cjs

EXPOSE 3000
# Local Docker readiness is checked through /health/required.
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then((r)=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/server/server.cjs"]

# Disposable local integration target used by restore/seed tests.
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
