param()

$ErrorActionPreference = 'Stop'
if (-not $env:BRISABASE_E2E_SERVICE_KEY -or -not $env:BRISABASE_E2E_TEST_PASSWORD) {
  throw 'Set BRISABASE_E2E_SERVICE_KEY and BRISABASE_E2E_TEST_PASSWORD before running this real restart test.'
}

npm.cmd run test:e2e
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose -f ../../docker-compose.local.yml restart brisabase
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$deadline = (Get-Date).AddMinutes(2)
do {
  try {
    $health = Invoke-RestMethod http://localhost:3000/health
    if ($health.status -eq 'healthy') { break }
  } catch { }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if ($health.status -ne 'healthy') { throw 'BrisaBase did not become healthy after restart.' }

# The second run authenticates again and reads the same persisted table,
# bucket, policies and deployed Function through only public HTTP/WebSocket.
npm.cmd run test:e2e
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
