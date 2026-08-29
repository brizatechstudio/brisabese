#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_PROJECT="brisabase-release-local"
PRODUCTION_PROJECT="brisabase-release-production"
LOCAL_COMPOSE=(docker compose --project-name "$LOCAL_PROJECT" -f docker-compose.local.yml)
PRODUCTION_ENV=""
PRODUCTION_COMPOSE=()
LOCAL_STARTED=false
PRODUCTION_STARTED=false

cd "$PROJECT_ROOT"
mkdir -p artifacts test-results
VALIDATION_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
VALIDATION_LOG="$PROJECT_ROOT/test-results/release-validation-$VALIDATION_TIMESTAMP.log"
exec > >(tee "$VALIDATION_LOG") 2>&1

cleanup() {
  local exit_code=$?
  set +e
  if [[ "$PRODUCTION_STARTED" == "true" && ${#PRODUCTION_COMPOSE[@]} -gt 0 ]]; then
    "${PRODUCTION_COMPOSE[@]}" down --volumes --remove-orphans
  fi
  if [[ "$LOCAL_STARTED" == "true" ]]; then
    "${LOCAL_COMPOSE[@]}" down --volumes --remove-orphans
  fi
  if [[ -n "$PRODUCTION_ENV" && -f "$PRODUCTION_ENV" ]]; then
    rm -f -- "$PRODUCTION_ENV"
  fi
  if [[ $exit_code -eq 0 ]]; then
    printf '\nBrisaBase release gates: PASSOU\nLog: %s\n' "$VALIDATION_LOG"
  else
    printf '\nBrisaBase release gates: FALHOU (exit %s)\nLog: %s\n' "$exit_code" "$VALIDATION_LOG"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Comando obrigatório não encontrado: %s\n' "$1" >&2
    exit 127
  fi
}

assert_disposable_project() {
  case "$1" in
    brisabase-release-local|brisabase-release-production) ;;
    *)
      printf "Recusando limpeza destrutiva para projeto Compose não descartável: %s\n" "$1" >&2
      exit 1
      ;;
  esac
}

wait_for_readiness() {
  local url=$1
  local attempts=$2
  local label=$3
  for _ in $(seq 1 "$attempts"); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      printf '%s pronto em %s\n' "$label" "$url"
      return 0
    fi
    sleep 2
  done
  printf 'Timeout aguardando %s em %s\n' "$label" "$url" >&2
  return 1
}

available_loopback_port() {
  node -e "const net=require('node:net'); const server=net.createServer(); server.listen(0,'127.0.0.1',()=>{console.log(server.address().port); server.close();});"
}

for command_name in docker node npm curl; do
  require_command "$command_name"
done
docker version
docker compose version

LOCAL_API_PORT="$(available_loopback_port)"
LOCAL_API_URL="http://127.0.0.1:$LOCAL_API_PORT"
export BRISABASE_PORT="$LOCAL_API_PORT"
export BRISABASE_POSTGRES_PORT="$(available_loopback_port)"
export BRISABASE_REDIS_PORT="$(available_loopback_port)"
export BRISABASE_MINIO_PORT="$(available_loopback_port)"
export BRISABASE_MINIO_CONSOLE_PORT="$(available_loopback_port)"
export BRISABASE_SMTP_PORT="$(available_loopback_port)"
export BRISABASE_MAILPIT_PORT="$(available_loopback_port)"
export BRISABASE_CORS_ALLOWED_ORIGIN="$LOCAL_API_URL"
export BRISABASE_PUBLIC_URL="$LOCAL_API_URL"
export BRISABASE_REALTIME_PUBLIC_URL="ws://127.0.0.1:$LOCAL_API_PORT/realtime/v1/websocket"
export ADMIN_UI_URL="$LOCAL_API_URL"
export BRISABASE_API_URL="$LOCAL_API_URL"
# Explicit opt-in only for this disposable local release stack. The Compose
# file defaults BACKUP_RESTORE_CERTIFIED to false outside this gate.
export BRISABASE_BACKUP_RESTORE_CERTIFIED=true

printf '\n[1/8] Instalação limpa e gates sem containers\n'
npm ci
npm run release:manifest:verify
npm run release:evidence
node scripts/generate-sbom.cjs --output artifacts/brisabase.cdx.json
npm audit --audit-level=low
npm audit --omit=dev --audit-level=low
npm run test:ci

printf '\n[2/8] Validação e inicialização da stack real local\n'
"${LOCAL_COMPOSE[@]}" config >/dev/null
# A prior interrupted run may leave named volumes behind. Reset only the fixed
# disposable certification project so the database is fresh on every run.
assert_disposable_project "$LOCAL_PROJECT"
"${LOCAL_COMPOSE[@]}" down --volumes --remove-orphans
LOCAL_STARTED=true
if ! COMPOSE_PROJECT_NAME="$LOCAL_PROJECT" "${LOCAL_COMPOSE[@]}" up --detach --build; then
  "${LOCAL_COMPOSE[@]}" ps --all
  "${LOCAL_COMPOSE[@]}" logs --no-color
  exit 1
fi
if ! wait_for_readiness "$LOCAL_API_URL/health/required" 90 'stack local'; then
  "${LOCAL_COMPOSE[@]}" logs brisabase
  exit 1
fi

printf '\n[3/8] Integração multi-tenant e carga concorrente\n'
BRISABASE_REAL_E2E=true \
ADMIN_BOOTSTRAP_TOKEN=local-bootstrap-token-for-isolated-e2e-only-2026 \
npm run test:docker
BRISABASE_LOAD_SMOKE=true \
ADMIN_BOOTSTRAP_TOKEN=local-bootstrap-token-for-isolated-e2e-only-2026 \
npm run test:docker:load

printf '\n[4/8] Restore destrutivo e persistência após restart\n'
COMPOSE_PROJECT_NAME="$LOCAL_PROJECT" node scripts/prepare-local-recovery-certification.cjs
BRISABASE_RESTORE_DRILL=true \
ADMIN_BOOTSTRAP_TOKEN=local-bootstrap-token-for-isolated-e2e-only-2026 \
npm run test:docker:restore
COMPOSE_PROJECT_NAME="$LOCAL_PROJECT" \
BRISABASE_REAL_RESTART_E2E=true \
ADMIN_BOOTSTRAP_TOKEN=local-bootstrap-token-for-isolated-e2e-only-2026 \
npm run test:docker:restart

printf '\n[5/8] Navegador contra o control plane real\n'
npx playwright install --with-deps chromium
ADMIN_BOOTSTRAP_TOKEN=local-bootstrap-token-for-isolated-e2e-only-2026 \
npm run test:browser

"${LOCAL_COMPOSE[@]}" down --volumes --remove-orphans
LOCAL_STARTED=false
unset BRISABASE_REAL_E2E BRISABASE_LOAD_SMOKE BRISABASE_RESTORE_DRILL BRISABASE_REAL_RESTART_E2E BRISABASE_TEST_RATE_LIMIT BRISABASE_API_URL BRISABASE_BACKUP_RESTORE_CERTIFIED ADMIN_UI_URL ADMIN_BOOTSTRAP_TOKEN

printf '\n[6/8] Imagens imutáveis e contrato de configuração de produção\n'
PRODUCTION_API_PORT="$(available_loopback_port)"
PRODUCTION_API_URL="http://127.0.0.1:$PRODUCTION_API_PORT"
export BRISABASE_HOMOLOGATION_PORT="$PRODUCTION_API_PORT"
PRODUCTION_ENV="$(mktemp "$PROJECT_ROOT/.env.homologation.validation.XXXXXX")"
sed "s|^BRISABASE_ENV_FILE=.*$|BRISABASE_ENV_FILE=$PRODUCTION_ENV|" .env.homologation.example > "$PRODUCTION_ENV"
node scripts/lock-container-images.cjs >> "$PRODUCTION_ENV"
node scripts/validate-production-env.cjs "$PRODUCTION_ENV"
PRODUCTION_COMPOSE=(docker compose --project-name "$PRODUCTION_PROJECT" --env-file "$PRODUCTION_ENV" -f docker-compose.production.yml -f docker-compose.homologation.yml)
PRODUCTION_IMAGES="$("${PRODUCTION_COMPOSE[@]}" config --images)"
printf '%s\n' "$PRODUCTION_IMAGES"
printf '%s\n' "$PRODUCTION_IMAGES" > artifacts/container-images.txt
if [[ "$(grep -c '@sha256:' <<< "$PRODUCTION_IMAGES")" -lt 5 ]]; then
  printf 'O contrato exige pelo menos cinco imagens de serviço fixadas por digest.\n' >&2
  exit 1
fi
"${PRODUCTION_COMPOSE[@]}" config | grep -E 'NODE_(BUILD|RUNTIME)_IMAGE: .*@sha256:'

printf '\n[7/8] Imagem final, role PostgreSQL sem privilégios e comportamento de produção\n'
assert_disposable_project "$PRODUCTION_PROJECT"
"${PRODUCTION_COMPOSE[@]}" down --volumes --remove-orphans
PRODUCTION_STARTED=true
if ! "${PRODUCTION_COMPOSE[@]}" up --detach --build postgres redis minio minio-init mailpit brisabase; then
  "${PRODUCTION_COMPOSE[@]}" ps --all
  "${PRODUCTION_COMPOSE[@]}" logs --no-color
  exit 1
fi
if ! wait_for_readiness "$PRODUCTION_API_URL/health/required" 120 'stack de produção'; then
  "${PRODUCTION_COMPOSE[@]}" logs brisabase
  exit 1
fi
ROLE_FLAGS="$("${PRODUCTION_COMPOSE[@]}" exec -T postgres psql -U brisabase_admin -d brisabase -tAc "SELECT concat(CASE WHEN rolsuper THEN 'true' ELSE 'false' END,':',CASE WHEN rolcreatedb THEN 'true' ELSE 'false' END,':',CASE WHEN rolcreaterole THEN 'true' ELSE 'false' END,':',CASE WHEN rolreplication THEN 'true' ELSE 'false' END) FROM pg_roles WHERE rolname='brisabase_app'")"
if [[ "$ROLE_FLAGS" != 'false:false:false:false' ]]; then
  printf 'Role da aplicação possui privilégios indevidos: %s\n' "$ROLE_FLAGS" >&2
  exit 1
fi
BRISABASE_PRODUCTION_CONTRACT=true \
BRISABASE_API_URL="$PRODUCTION_API_URL" \
ADMIN_BOOTSTRAP_TOKEN=ci_bootstrap_2026_homologation_E6u5N8r3T9y2W4m7Q1p0 \
npm run test:docker:production

printf '\n[8/8] Encerramento limpo dos ambientes descartáveis\n'
"${PRODUCTION_COMPOSE[@]}" down --volumes --remove-orphans
PRODUCTION_STARTED=false
