/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { isSemVerAtLeast } = require('./semver.cjs');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  '.env.example', '.env.production.example', '.env.homologation.example',
  'docker-compose.local.yml', 'docker-compose.production.yml', 'docker-compose.homologation.yml',
  'deploy/Caddyfile', 'deploy/minio-init.sh', 'deploy/postgres-init.sh',
  'developer/cli/brisabase.mjs', 'developer/sdk/package.json',
  'server/db/legacy-compat.cjs', 'src/services/legacyBrowserState.js',
  'src/components/layout/AppLayout.tsx', 'src/components/layout/Sidebar.tsx',
];
const failures = [];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root, file))) failures.push(`missing required file: ${file}`);

const ignored = new Set(['node_modules', 'dist', 'artifacts', 'coverage', 'playwright-report', 'test-results', '.git']);
const textFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (!/\.(?:png|jpe?g|gif|webp|ico|zip|gz|woff2?|ttf|lock)$/i.test(entry.name)) textFiles.push(full);
  }
}
walk(root);
const legacyCompatibilityFiles = new Set(['server/db/legacy-compat.cjs', 'src/services/legacyBrowserState.js', 'server/tests/legacy-upgrade-compat.test.cjs', 'server/tests/browser-upgrade-compat.test.cjs']);
for (const file of textFiles) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (relative !== 'scripts/verify-phase1.cjs' && !legacyCompatibilityFiles.has(relative) && /back[ _-]?forge|backforge/i.test(content)) failures.push(`legacy predecessor branding remains outside the isolated upgrade bridge: ${relative}`);
  if (/\bbf_(?:pub|sec|srv)_/i.test(content)) failures.push(`legacy API key prefix remains in ${relative}`);
}


for (const file of legacyCompatibilityFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!/backforge/i.test(source) || !/brisabase/i.test(source)) failures.push(`upgrade bridge is incomplete: ${file}`);
}
const sdkDist = fs.readFileSync(path.join(root, 'developer/sdk/dist/client.js'), 'utf8') + fs.readFileSync(path.join(root, 'developer/sdk/dist/client.d.ts'), 'utf8');
if (/back[ _-]?forge|backforge/i.test(sdkDist)) failures.push('generated SDK dist still exposes predecessor branding');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sdk = JSON.parse(fs.readFileSync(path.join(root, 'developer/sdk/package.json'), 'utf8'));
if (pkg.name !== 'brisabase') failures.push('root package name must be brisabase');
if (!isSemVerAtLeast(pkg.version, '0.3.0')) failures.push('root package version must be valid SemVer and Phase 1 (0.3.0) or newer');
if (sdk.name !== '@brisabase/js') failures.push('SDK package must be @brisabase/js');
if (sdk.version !== pkg.version) failures.push('SDK and platform versions must match');
if (pkg.scripts?.['release:validate:docker'] !== 'node scripts/run-docker-release-gates.cjs') failures.push('release:validate:docker script is missing');

const layout = fs.readFileSync(path.join(root, 'src/components/layout/AppLayout.tsx'), 'utf8');
const effectAt = layout.indexOf('useEffect(() =>');
const authReturnAt = layout.indexOf('if (!authReady)');
if (effectAt < 0 || authReturnAt < 0 || effectAt > authReturnAt) failures.push('AppLayout hook ordering is unsafe');
if (/multi-AZ/i.test(layout)) failures.push('AppLayout still promises multi-AZ provisioning');

const storagePage = fs.readFileSync(path.join(root, 'src/brisabase/pages/StoragePage.tsx'), 'utf8');
if (/CDN Global|CDN integrada/i.test(storagePage)) failures.push('Storage page still promises a managed global CDN');


const appContext = fs.readFileSync(path.join(root, 'src/context/AppContext.tsx'), 'utf8');
if (!/language: 'pt-BR' \| 'en-US'/.test(appContext)) failures.push('AppContext must expose PT-BR and EN-US');
if (!/document\.documentElement\.lang = (?:nextLanguage|savedLanguage)/.test(appContext)) failures.push('document language must follow the selected locale');
if (/setTheme|toggleTheme|theme\s*===\s*['"]light['"]/i.test(appContext)) failures.push('light theme control must not be reintroduced');
for (const authFile of ['Login.tsx', 'Register.tsx', 'ForgotPassword.tsx', 'ResetPassword.tsx', 'UserPasswordReset.tsx']) {
  const source = fs.readFileSync(path.join(root, 'src/pages/auth', authFile), 'utf8');
  if (!/isEnglish/.test(source)) failures.push(`public auth page is not bilingual: ${authFile}`);
}
if (/eu-west-1 \(Frankfurt\)/.test(layout)) failures.push('Frankfurt must not be mislabeled as eu-west-1');
if (!/eu-central-1 \(Frankfurt\)/.test(layout)) failures.push('Frankfurt eu-central-1 option is missing');

const sidebar = fs.readFileSync(path.join(root, 'src/components/layout/Sidebar.tsx'), 'utf8');
for (const route of ['/experiments', '/app-quality', '/search-ai', '/enterprise']) {
  if (!sidebar.includes(`!isRealMode`) || !sidebar.includes(route)) failures.push(`mock-only navigation guard is missing for ${route}`);
}

const localStorageSource = fs.readFileSync(path.join(root, 'src/services/runtime.ts'), 'utf8');
if (/brisabase\.organizationId/.test(localStorageSource) === false) failures.push('real runtime scope must use BrisaBase localStorage keys');
if (/backforge\./i.test(localStorageSource)) failures.push('legacy localStorage scope leaked outside the isolated upgrade bridge');
if (!/migrateLegacyScopeStorage\(\)/.test(localStorageSource)) failures.push('real runtime must execute the browser scope upgrade bridge before installing control-plane fetch');
const adminAuthSource = fs.readFileSync(path.join(root, 'src/brisabase/services/adminAuthService.ts'), 'utf8');
if (!/migrateLegacyAdminStorage\(\)/.test(adminAuthSource)) failures.push('admin auth must execute the legacy session upgrade bridge before reading BrisaBase session keys');
const postgresSource = fs.readFileSync(path.join(root, 'server/db/postgres.ts'), 'utf8');
if (!/migrateLegacyGlobalMigrationHistory/.test(postgresSource)) failures.push('runtime PostgreSQL migrations must preserve predecessor migration history');
const projectDatabaseSource = fs.readFileSync(path.join(root, 'server/db/realProjectDatabase.ts'), 'utf8');
if (!/migrateLegacyProjectMigrationHistory/.test(projectDatabaseSource)) failures.push('project schema migrations must preserve predecessor migration history');

const productionCompose = fs.readFileSync(path.join(root, 'docker-compose.production.yml'), 'utf8');
for (const service of ['postgres:', 'redis:', 'minio:', 'minio-init:', 'brisabase:', 'reverse-proxy:']) {
  if (!productionCompose.includes(`  ${service}`)) failures.push(`production Compose is missing ${service}`);
}
if (/^  (?:mailpit|seed|mock):/m.test(productionCompose)) failures.push('production Compose contains a development-only service');
if (!/S3_ACCESS_KEY/.test(productionCompose) || !/MINIO_ROOT_USER/.test(productionCompose)) failures.push('production Compose must separate MinIO bootstrap and application identities');

const productionEnv = fs.readFileSync(path.join(root, '.env.production.example'), 'utf8');
for (const key of ['BRISABASE_DEPLOYMENT_MODE', 'BRISABASE_RELEASE', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'AUTH_ENCRYPTION_KEY', 'ADMIN_BOOTSTRAP_TOKEN', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'APP_DOMAIN', 'STORAGE_DOMAIN']) {
  if (!new RegExp(`^${key}=`, 'm').test(productionEnv)) failures.push(`.env.production.example is missing ${key}`);
}

if (failures.length) {
  console.error('[BRISABASE PHASE 1 VERIFY] FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`[BRISABASE PHASE 1 VERIFY] PASS (${textFiles.length} text files checked).`);
