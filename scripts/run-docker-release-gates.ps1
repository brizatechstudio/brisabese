$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LocalProject = 'brisabase-release-local'
$ProductionProject = 'brisabase-release-production'
$ProductionEnv = $null
$LocalStarted = $false
$ProductionStarted = $false
$TranscriptStarted = $false
$Succeeded = $false
$LocalComposeArgs = @('compose', '--project-name', $LocalProject, '-f', 'docker-compose.local.yml')
$ProductionComposeArgs = @()

Set-Location $ProjectRoot
New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot 'test-results') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot 'artifacts') | Out-Null
$Timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$ValidationLog = Join-Path $ProjectRoot "test-results\release-validation-$Timestamp.log"
Start-Transcript -Path $ValidationLog -Force | Out-Null
$TranscriptStarted = $true

function Assert-NativeCommand {
  param([Parameter(Mandatory = $true)][string]$Label)
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Assert-DisposableProject {
  param([Parameter(Mandatory = $true)][string]$ProjectName)
  if ($ProjectName -notin @('brisabase-release-local', 'brisabase-release-production')) {
    throw "Refusing destructive Compose cleanup for non-disposable project '$ProjectName'."
  }
}

function Wait-BrisaBaseReadiness {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][int]$Attempts,
    [Parameter(Mandatory = $true)][string]$Label
  )
  for ($Attempt = 1; $Attempt -le $Attempts; $Attempt += 1) {
    try {
      $Response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($Response.StatusCode -eq 200) {
        Write-Host "$Label ready at $Url"
        return
      }
    } catch {
      # The service is expected to refuse connections while containers start.
    }
    Start-Sleep -Seconds 2
  }
  throw "Timed out waiting for $Label at $Url."
}

function Get-AvailableLoopbackPort {
  $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $Listener.Start()
    return ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
  } finally {
    $Listener.Stop()
  }
}

try {
  foreach ($CommandName in @('docker', 'node', 'npm')) {
    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
      throw "Required command was not found: $CommandName"
    }
  }

  docker version
  Assert-NativeCommand 'docker version'
  docker compose version
  Assert-NativeCommand 'docker compose version'

  $LocalApiPort = Get-AvailableLoopbackPort
  $LocalApiUrl = "http://127.0.0.1:$LocalApiPort"
  $env:BRISABASE_PORT = $LocalApiPort
  $env:BRISABASE_POSTGRES_PORT = Get-AvailableLoopbackPort
  $env:BRISABASE_REDIS_PORT = Get-AvailableLoopbackPort
  $env:BRISABASE_MINIO_PORT = Get-AvailableLoopbackPort
  $env:BRISABASE_MINIO_CONSOLE_PORT = Get-AvailableLoopbackPort
  $env:BRISABASE_SMTP_PORT = Get-AvailableLoopbackPort
  $env:BRISABASE_MAILPIT_PORT = Get-AvailableLoopbackPort
  $env:BRISABASE_CORS_ALLOWED_ORIGIN = $LocalApiUrl
  $env:BRISABASE_PUBLIC_URL = $LocalApiUrl
  $env:BRISABASE_REALTIME_PUBLIC_URL = "ws://127.0.0.1:$LocalApiPort/realtime/v1/websocket"
  $env:ADMIN_UI_URL = $LocalApiUrl
  $env:BRISABASE_API_URL = $LocalApiUrl
  # Explicit opt-in only for this disposable local release stack. The Compose
  # file defaults BACKUP_RESTORE_CERTIFIED to false outside this gate.
  $env:BRISABASE_BACKUP_RESTORE_CERTIFIED = 'true'

  Write-Host "`n[1/8] Clean installation and non-container gates"
  npm ci
  Assert-NativeCommand 'npm ci'
  npm run release:manifest:verify
  Assert-NativeCommand 'source manifest verification'
  npm run release:evidence
  Assert-NativeCommand 'release evidence generation'
  node scripts/generate-sbom.cjs --output artifacts/brisabase.cdx.json
  Assert-NativeCommand 'CycloneDX SBOM generation'
  npm audit --audit-level=low
  Assert-NativeCommand 'npm audit'
  npm audit --omit=dev --audit-level=low
  Assert-NativeCommand 'production npm audit'
  npm run test:ci
  Assert-NativeCommand 'npm run test:ci'

  Write-Host "`n[2/8] Real local stack"
  docker @LocalComposeArgs config | Out-Null
  Assert-NativeCommand 'local Compose validation'
  # A previous interrupted certification can leave named volumes behind. Reset
  # only the fixed disposable project so every run truly starts from an empty DB.
  Assert-DisposableProject -ProjectName $LocalProject
  docker @LocalComposeArgs down --volumes --remove-orphans
  Assert-NativeCommand 'local disposable pre-clean'
  $env:COMPOSE_PROJECT_NAME = $LocalProject
  $LocalStarted = $true
  docker @LocalComposeArgs up --detach --build
  if ($LASTEXITCODE -ne 0) {
    docker @LocalComposeArgs ps --all
    docker @LocalComposeArgs logs --no-color
    throw 'Local Compose startup failed.'
  }
  try {
    Wait-BrisaBaseReadiness -Url "$LocalApiUrl/health/required" -Attempts 90 -Label 'Local stack'
  } catch {
    docker @LocalComposeArgs logs brisabase
    throw
  }

  Write-Host "`n[3/8] Tenant isolation and concurrent load"
  $env:BRISABASE_REAL_E2E = 'true'
  $env:ADMIN_BOOTSTRAP_TOKEN = 'local-bootstrap-token-for-isolated-e2e-only-2026'
  npm run test:docker
  Assert-NativeCommand 'real Docker integration'
  $env:BRISABASE_LOAD_SMOKE = 'true'
  npm run test:docker:load
  Assert-NativeCommand 'Docker load smoke'

  Write-Host "`n[4/8] Destructive restore and restart persistence"
  node scripts/prepare-local-recovery-certification.cjs
  Assert-NativeCommand 'local recovery certification precondition'
  $env:BRISABASE_RESTORE_DRILL = 'true'
  npm run test:docker:restore
  Assert-NativeCommand 'Docker restore drill'
  $env:BRISABASE_REAL_RESTART_E2E = 'true'
  npm run test:docker:restart
  Assert-NativeCommand 'Docker restart persistence'

  Write-Host "`n[5/8] Browser against the real control plane"
  npx playwright install chromium
  Assert-NativeCommand 'Playwright Chromium installation'
  npm run test:browser
  Assert-NativeCommand 'Playwright browser matrix'

  docker @LocalComposeArgs down --volumes --remove-orphans
  Assert-NativeCommand 'local Compose cleanup'
  $LocalStarted = $false
  Remove-Item Env:COMPOSE_PROJECT_NAME -ErrorAction SilentlyContinue
  # The production contract must run in a clean process environment. These
  # switches are valid only for the disposable local stack and are rejected by
  # the production validator when they leak into it.
  foreach ($Name in @('BRISABASE_REAL_E2E', 'BRISABASE_LOAD_SMOKE', 'BRISABASE_RESTORE_DRILL', 'BRISABASE_REAL_RESTART_E2E', 'BRISABASE_TEST_RATE_LIMIT', 'BRISABASE_API_URL', 'BRISABASE_BACKUP_RESTORE_CERTIFIED', 'ADMIN_UI_URL', 'ADMIN_BOOTSTRAP_TOKEN')) {
    Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
  }

  Write-Host "`n[6/8] Immutable images and production configuration"
  $ProductionApiPort = Get-AvailableLoopbackPort
  $ProductionApiUrl = "http://127.0.0.1:$ProductionApiPort"
  $env:BRISABASE_HOMOLOGATION_PORT = $ProductionApiPort
  $ProductionEnv = Join-Path $ProjectRoot ".env.homologation.validation.$([guid]::NewGuid().ToString('N'))"
  $ProductionEnvForDocker = $ProductionEnv -replace '\\', '/'
  $EnvironmentContent = Get-Content -Raw -LiteralPath '.env.homologation.example'
  $EnvironmentContent = [regex]::Replace($EnvironmentContent, '(?m)^BRISABASE_ENV_FILE=.*$', "BRISABASE_ENV_FILE=$ProductionEnvForDocker")
  [System.IO.File]::WriteAllText($ProductionEnv, $EnvironmentContent, (New-Object System.Text.UTF8Encoding($false)))
  $ImageLocks = node scripts/lock-container-images.cjs | Out-String
  Assert-NativeCommand 'immutable image resolution'
  [System.IO.File]::AppendAllText($ProductionEnv, "`n$ImageLocks", (New-Object System.Text.UTF8Encoding($false)))
  node scripts/validate-production-env.cjs $ProductionEnv
  Assert-NativeCommand 'production environment validation'

  $ProductionComposeArgs = @('compose', '--project-name', $ProductionProject, '--env-file', $ProductionEnv, '-f', 'docker-compose.production.yml', '-f', 'docker-compose.homologation.yml')
  $ProductionImages = docker @ProductionComposeArgs config --images | Out-String
  Assert-NativeCommand 'production Compose image validation'
  Write-Host $ProductionImages
  [System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'artifacts/container-images.txt'), $ProductionImages, (New-Object System.Text.UTF8Encoding($false)))
  if ([regex]::Matches($ProductionImages, '@sha256:').Count -lt 5) {
    throw 'Production requires at least five service images pinned by digest.'
  }
  $ProductionConfig = docker @ProductionComposeArgs config | Out-String
  Assert-NativeCommand 'production Compose validation'
  if ([regex]::Matches($ProductionConfig, 'NODE_(?:BUILD|RUNTIME)_IMAGE: .*@sha256:').Count -lt 2) {
    throw 'The Node build and runtime images are not pinned by digest.'
  }

  Write-Host "`n[7/8] Final image, unprivileged PostgreSQL role and production behavior"
  Assert-DisposableProject -ProjectName $ProductionProject
  docker @ProductionComposeArgs down --volumes --remove-orphans
  Assert-NativeCommand 'production disposable pre-clean'
  $ProductionStarted = $true
  docker @ProductionComposeArgs up --detach --build postgres redis minio minio-init mailpit brisabase
  if ($LASTEXITCODE -ne 0) {
    docker @ProductionComposeArgs ps --all
    docker @ProductionComposeArgs logs --no-color
    throw 'Production Compose startup failed.'
  }
  try {
    Wait-BrisaBaseReadiness -Url "$ProductionApiUrl/health/required" -Attempts 120 -Label 'Production stack'
  } catch {
    docker @ProductionComposeArgs logs brisabase
    throw
  }
  $RoleFlags = (docker @ProductionComposeArgs exec -T postgres psql -U brisabase_admin -d brisabase -tAc "SELECT concat(CASE WHEN rolsuper THEN 'true' ELSE 'false' END,':',CASE WHEN rolcreatedb THEN 'true' ELSE 'false' END,':',CASE WHEN rolcreaterole THEN 'true' ELSE 'false' END,':',CASE WHEN rolreplication THEN 'true' ELSE 'false' END) FROM pg_roles WHERE rolname='brisabase_app'") | Out-String
  Assert-NativeCommand 'PostgreSQL application role inspection'
  if ($RoleFlags.Trim() -ne 'false:false:false:false') {
    throw "Application database role has unexpected privileges: $($RoleFlags.Trim())"
  }
  $env:BRISABASE_PRODUCTION_CONTRACT = 'true'
  $env:BRISABASE_API_URL = $ProductionApiUrl
  $env:ADMIN_BOOTSTRAP_TOKEN = 'ci_bootstrap_2026_homologation_E6u5N8r3T9y2W4m7Q1p0'
  npm run test:docker:production
  Assert-NativeCommand 'production behavior contract'

  Write-Host "`n[8/8] Clean shutdown of disposable environments"
  docker @ProductionComposeArgs down --volumes --remove-orphans
  Assert-NativeCommand 'production Compose cleanup'
  $ProductionStarted = $false
  $Succeeded = $true
} catch {
  Write-Host "`nBrisaBase release gates failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
  if ($ProductionStarted -and $ProductionComposeArgs.Count -gt 0) {
    docker @ProductionComposeArgs down --volumes --remove-orphans
  }
  if ($LocalStarted) {
    docker @LocalComposeArgs down --volumes --remove-orphans
  }
  if ($ProductionEnv -and (Test-Path -LiteralPath $ProductionEnv)) {
    Remove-Item -LiteralPath $ProductionEnv -Force
  }
  foreach ($Name in @('COMPOSE_PROJECT_NAME', 'BRISABASE_REAL_E2E', 'BRISABASE_LOAD_SMOKE', 'BRISABASE_RESTORE_DRILL', 'BRISABASE_REAL_RESTART_E2E', 'BRISABASE_PRODUCTION_CONTRACT', 'BRISABASE_API_URL', 'BRISABASE_BACKUP_RESTORE_CERTIFIED', 'ADMIN_UI_URL', 'ADMIN_BOOTSTRAP_TOKEN', 'BRISABASE_PORT', 'BRISABASE_POSTGRES_PORT', 'BRISABASE_REDIS_PORT', 'BRISABASE_MINIO_PORT', 'BRISABASE_MINIO_CONSOLE_PORT', 'BRISABASE_SMTP_PORT', 'BRISABASE_MAILPIT_PORT', 'BRISABASE_CORS_ALLOWED_ORIGIN', 'BRISABASE_PUBLIC_URL', 'BRISABASE_REALTIME_PUBLIC_URL', 'BRISABASE_HOMOLOGATION_PORT')) {
    Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
  }
  if ($TranscriptStarted) {
    Stop-Transcript | Out-Null
  }
}

if ($Succeeded) {
  Write-Host "`nBrisaBase release gates: PASSED"
  Write-Host "Log: $ValidationLog"
  exit 0
}
Write-Host "Log: $ValidationLog"
exit 1
