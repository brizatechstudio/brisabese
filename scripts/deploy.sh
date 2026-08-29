#!/usr/bin/env sh
set -eu

ENV_FILE="${BRISABASE_ENV_FILE:-.env}"
export BRISABASE_ENV_FILE="${ENV_FILE}"
COMPOSE="docker compose --env-file ${ENV_FILE} -f docker-compose.production.yml"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[BRISABASE] ${ENV_FILE} was not found. Copy .env.production.example to .env and set real secrets." >&2
  exit 1
fi

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only
fi

node scripts/validate-production-env.cjs "${ENV_FILE}"
${COMPOSE} config --quiet
${COMPOSE} build brisabase
${COMPOSE} up -d --remove-orphans

APP_URL="$(grep '^APP_URL=' "${ENV_FILE}" | cut -d= -f2-)"
if [ -z "${APP_URL}" ]; then echo '[BRISABASE] APP_URL is required.' >&2; exit 1; fi
curl --fail --silent --show-error --retry 20 --retry-delay 3 "${APP_URL%/}/health/required" >/dev/null
echo '[BRISABASE] deploy completed; strict readiness check passed.'
