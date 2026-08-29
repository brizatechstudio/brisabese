// Upgrade-only browser state bridge. Legacy identifiers are intentionally
// isolated here and removed after a successful copy to BrisaBase keys.

const scopePairs = [
  ['backforge.organizationId', 'brisabase.organizationId'],
  ['backforge.projectId', 'brisabase.projectId'],
  ['backforge.environmentId', 'brisabase.environmentId'],
];

const adminSessionPairs = [
  ['backforge.admin.access_token', 'brisabase.admin.access_token'],
  ['backforge.admin.refresh_token', 'brisabase.admin.refresh_token'],
  ['backforge.admin.expires_at', 'brisabase.admin.expires_at'],
];

const adminLocalPairs = [
  ['backforge.admin.user', 'brisabase.admin.user'],
];

function migratePairs(storage, pairs) {
  let migrated = 0;
  for (const [legacyKey, currentKey] of pairs) {
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue === null) continue;
    if (storage.getItem(currentKey) === null) {
      storage.setItem(currentKey, legacyValue);
      migrated += 1;
    }
    storage.removeItem(legacyKey);
  }
  return migrated;
}

export function migrateLegacyScopeStorage(local = window.localStorage) {
  return migratePairs(local, scopePairs);
}

export function migrateLegacyAdminStorage(session = window.sessionStorage, local = window.localStorage) {
  return migratePairs(session, adminSessionPairs) + migratePairs(local, adminLocalPairs);
}
