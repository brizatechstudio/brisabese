import { ensureReleaseScope, resetReleaseAdminCache } from './helpers/releaseAdmin';

export default async function globalSetup(): Promise<void> {
  // Every Playwright invocation receives one real administrative session and
  // one isolated project scope. Worker processes reuse the short-lived cache
  // instead of competing with the production brute-force limits.
  await resetReleaseAdminCache();
  await ensureReleaseScope();
}
