const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

const migration = read('server/db/migrations/021_backup_hosting_infrastructure_phase6.sql');
assert(migration.includes('UNIQUE(hostname)'), 'custom domains must be globally unique');
assert(migration.includes("CHECK (status IN ('pending','verified','disabled','failed'))"), 'domain verification status constraint missing');
assert(migration.includes('backup_recovery_drills'), 'recovery drill persistence missing');
assert(migration.includes('runtime_instances'), 'runtime heartbeat persistence missing');
assert(migration.includes('operations_incidents'), 'incident persistence missing');

const certification = read('server/backup/recoveryCertification.ts');
assert(certification.includes("WHERE status='passed'"), 'restore certification must require a passed drill');
assert(certification.includes('config.backup.certified && row'), 'restore certification must require flag plus evidence');
const backupRoutes = read('server/routes/backup.ts');
assert((backupRoutes.match(/await requireRestoreCertification/g) || []).length >= 2, 'snapshot restore and PITR endpoints must enforce certification');
const pitr = read('server/routes/platformPitr.ts');
assert(pitr.includes('assertRecoveryCertified'), 'platform PITR must enforce recovery certification');
assert(pitr.includes('RESTORE_ENTIRE_BRISABASE_DATABASE'), 'platform PITR explicit confirmation missing');

const hosting = read('server/platform/hostingEngine.ts');
assert(hosting.includes('resolveTxt(`_brisabase.${row.hostname}`)'), 'custom domain ownership must be DNS-verified');
assert(hosting.includes("tls_status='pending'"), 'DNS verification must not falsely claim certificate issuance');
assert(hosting.includes("supplied !== 'application/octet-stream'"), 'CLI octet-stream uploads must infer browser-safe MIME types');
assert(hosting.includes('defaultCacheControl'), 'hosting cache policy missing');
assert(hosting.includes("PUBLIC_|VITE_"), 'static runtime environment must be explicitly public');
assert(hosting.includes("url.protocol !== 'https:'"), 'external redirects must be HTTPS-only');
const caddy = read('deploy/Caddyfile');
assert(caddy.includes('on_demand_tls') && caddy.includes('ask http://brisabase:3000/internal/hosting/domain-authorized'), 'Caddy on-demand TLS authorization missing');
assert(caddy.includes('https:// {') && caddy.includes('on_demand'), 'Caddy catch-all on-demand TLS site missing');

const infra = read('server/infrastructure/productionInfrastructureEngine.ts');
assert(infra.includes("last_heartbeat_at < now() - interval '45 seconds'"), 'stale replica degradation missing');
assert(infra.includes("last_heartbeat_at < now() - interval '5 minutes'"), 'offline/stopped replica transition missing');
assert(infra.includes('embeddedMultiAzProvisioning: false'), 'self-hosted runtime must explicitly report no embedded Multi-AZ');
assert(infra.includes("WHERE project_id IS NULL AND environment_id IS NULL AND status <> 'resolved'"), 'public status must not leak tenant incidents');
const infraRoutes = read('server/routes/productionInfrastructure.ts');
assert(infraRoutes.includes('BRISABASE_OPERATIONS_TOKEN') || infraRoutes.includes('operationsToken'), 'platform incident operator authentication missing');
assert(infraRoutes.includes('/internal/infrastructure/incidents'), 'platform incident operator endpoint missing');

const validator = read('scripts/validate-production-env.cjs');
assert(!validator.includes('BACKUP_ENABLED must remain false until'), 'obsolete backup prohibition remains');
assert(validator.includes('BACKUP_ENCRYPTION_KEY must be at least 32 bytes'), 'backup key hardening missing');
assert(validator.includes('BRISABASE_PRODUCTION_TIER=ha requires BRISABASE_DEPLOYMENT_MODE=managed'), 'HA responsibility contract missing');
assert(validator.includes('HOSTING_CADDY_ASK_TOKEN must be at least 32 bytes'), 'custom-domain TLS ask token hardening missing');

const compose = read('docker-compose.production.yml');
assert((compose.match(/^  postgres:$/gm) || []).length === 1, 'bundled production compose should expose one PostgreSQL instance, not pretend Multi-AZ');
assert(compose.includes('BRISABASE_PRODUCTION_TIER: ${BRISABASE_PRODUCTION_TIER:-single-host}'), 'bundled production topology must default to single-host');
assert(compose.includes('BACKUP_ENABLED: "true"'), 'production snapshots should be enabled');
assert(compose.includes('HOSTING_CADDY_ASK_TOKEN'), 'Caddy ask token must reach API and proxy');

console.log('Backup + Production + Hosting + Infrastructure Phase 6 contract: PASS');
