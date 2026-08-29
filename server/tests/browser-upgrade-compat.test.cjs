const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

class MemoryStorage {
  constructor(values = {}) { this.map = new Map(Object.entries(values)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

async function main() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src/services/legacyBrowserState.js')).href;
  const { migrateLegacyScopeStorage, migrateLegacyAdminStorage } = await import(moduleUrl);
  const local = new MemoryStorage({
    'backforge.organizationId': 'org-old',
    'backforge.projectId': 'proj-old',
    'backforge.environmentId': 'env-old',
    'backforge.admin.user': '{"id":"user-old"}',
    'brisabase.projectId': 'proj-current',
  });
  const session = new MemoryStorage({
    'backforge.admin.access_token': 'access-old',
    'backforge.admin.refresh_token': 'refresh-old',
    'backforge.admin.expires_at': '999999',
  });

  assert.equal(migrateLegacyScopeStorage(local), 2);
  assert.equal(migrateLegacyAdminStorage(session, local), 4);
  assert.equal(local.getItem('brisabase.projectId'), 'proj-current', 'current BrisaBase scope must win');
  assert.equal(local.getItem('brisabase.organizationId'), 'org-old');
  assert.equal(local.getItem('brisabase.environmentId'), 'env-old');
  assert.equal(local.getItem('brisabase.admin.user'), '{"id":"user-old"}');
  assert.equal(session.getItem('brisabase.admin.access_token'), 'access-old');
  assert.equal(session.getItem('brisabase.admin.refresh_token'), 'refresh-old');
  assert.equal(session.getItem('brisabase.admin.expires_at'), '999999');
  for (const key of [...local.map.keys(), ...session.map.keys()]) assert.equal(key.startsWith('backforge.'), false, `legacy key remained: ${key}`);
  console.log('browser upgrade compatibility: PASS');
}

main().catch((error) => { console.error(error); process.exit(1); });
