/**
 * BRISABASE V2.0 — ADMIN UI API MODE CONTRACT TEST
 *
 * Verifies that when VITE_DATA_SOURCE=api:
 * 1. No mock data is returned when the real API fails
 * 2. Errors propagate to the UI layer
 * 3. No automatic fallback to mock/fake/sample data occurs
 *
 * Run: npx tsx server/tests/admin-ui-api-mode-contract.test.ts
 */
import { strict as assert } from 'assert';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Mock global fetch to simulate API failures ---
const originalFetch = globalThis.fetch;

function mockFetchFailure(): void {
  (globalThis as any).fetch = async (url: string | URL | Request) => {
    const urlStr = String(url);
    // Simulate network failure for all /api/ paths
    throw new Error(`Network error: Failed to fetch ${urlStr}`);
  };
}

function mockFetchSuccess(payload: any, status = 200): void {
  (globalThis as any).fetch = async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as Response;
  };
}

function restoreFetch(): void {
  (globalThis as any).fetch = originalFetch;
}

// --- Set up test environment ---
console.log('=== BRISABASE ADMIN UI API MODE CONTRACT TEST ===\n');

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  // =============================================
  // TEST 1: DatabaseService must NOT fall back to mock in API mode
  // =============================================
  await runTest('DatabaseService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { databaseService } = await import('../../src/services/databaseService');

    let threw = false;
    try {
      await databaseService.getOverview();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock data');
  });

  // =============================================
  // TEST 2: RealtimeService must NOT fall back to mock in API mode
  // =============================================
  await runTest('RealtimeService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { realtimeService } = await import('../../src/services/realtimeService');

    let threw = false;
    try {
      await realtimeService.getMetrics();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock metrics');
  });

  // =============================================
  // TEST 3: ApiService must NOT fall back to mock in API mode
  // =============================================
  await runTest('ApiService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { realApiService } = await import('../../src/services/apiService');

    let threw = false;
    try {
      await realApiService.listEndpoints();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock endpoints');
  });

  // =============================================
  // TEST 4: AuthService: API failure must propagate error (NO mock fallback)
  // =============================================
  await runTest('AuthService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { realAuthService } = await import('../../src/services/authService');

    let threw = false;
    try {
      await realAuthService.listUsers();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock users');
  });

  // =============================================
  // TEST 5: FunctionService: API failure must propagate error (NO mock fallback)
  // =============================================
  await runTest('FunctionsService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { realFunctionsService } = await import('../../src/services/functionsService');

    let threw = false;
    try {
      await realFunctionsService.listFunctions();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock functions');
  });

  // =============================================
  // TEST 6: StorageService: API failure must propagate error (NO mock fallback)
  // =============================================
  await runTest('StorageService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { realStorageService } = await import('../../src/services/storageService');

    let threw = false;
    try {
      await realStorageService.listBuckets();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock buckets');
  });

  // =============================================
  // TEST 7: BackupService: API failure must propagate error (NO mock fallback)
  // =============================================
  await runTest('BackupService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    const { realBackupService } = await import('../../src/services/backupService');

    let threw = false;
    try {
      await realBackupService.listBackups();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock backups');
  });

  // =============================================
  // TEST 8: TeamService: API failure must propagate error (NO mock fallback)
  // =============================================
  await runTest('TeamService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    // Mock localStorage for teamService
    (globalThis as any).window = {
      localStorage: {
        getItem: () => 'org_test_1',
      },
    };
    const { realTeamService } = await import('../../src/services/teamService');

    let threw = false;
    try {
      await realTeamService.listMembers();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock team members');
  });

  // =============================================
  // TEST 9: MonitoringService: API failure must propagate error (NO mock fallback)
  // =============================================
  await runTest('MonitoringService: API failure must propagate error (NO mock fallback)', async () => {
    mockFetchFailure();
    (globalThis as any).import = { meta: { env: { VITE_DATA_SOURCE: 'api' } } };
    const { realMonitoringService } = await import('../../src/services/monitoringService');

    let threw = false;
    try {
      await realMonitoringService.getCurrentMetrics();
    } catch (err) {
      threw = true;
      assert.ok(err instanceof Error, 'Error should be thrown');
    }
    assert.ok(threw, 'API failure must throw an error, not return mock metrics');
  });

  // =============================================
  // TEST 10: No fallback pattern exists in service layer source
  // =============================================
  await runTest('Source audit: No "falling back to mock" patterns remain', async () => {
    const servicesDir = path.resolve(__dirname, '../../src/services');
    const files = readdirSync(servicesDir).filter((f: string) => f.endsWith('.ts') && f !== 'sqlMock.ts');

    for (const file of files) {
      const content = readFileSync(path.join(servicesDir, file), 'utf-8');
      // Check for prohibited fallback patterns
      const forbiddenPatterns = [
        /catch\s*\([^)]*\)\s*\{[^}]*mock/i,
        /falling back to mock/i,
      ];
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          throw new Error(`Forbidden fallback pattern found in ${file}: ${pattern}`);
        }
      }
    }
    console.log(`     (Scanned ${files.length} service files)`);
  });

  // =============================================
  // TEST 11: UI must use scoped, current API contracts and local avatars
  // =============================================
  await runTest('Source audit: API explorer avoids the removed tables route and avatars stay CSP-safe', async () => {
    const apiService = readFileSync(path.resolve(__dirname, '../../src/brisabase/services/apiService.ts'), 'utf-8');
    assert.match(apiService, /fetch\('\/api\/database\/tables'\)/, 'API explorer must use the scoped database endpoint.');
    assert.doesNotMatch(apiService, /\/api\/projects\/\$\{projectId\}\/environments\/\$\{environmentId\}\/tables/, 'The removed tables endpoint must not be called.');
    assert.doesNotMatch(apiService, /fetch\(`\/api\/projects\/\$\{projectId\}\/webhooks`\)/, 'The unimplemented legacy webhook endpoint must not be called.');
    assert.doesNotMatch(apiService, /env_\$\{projectId\}_production/, 'A missing environment must not be fabricated.');

    const projectsPage = readFileSync(path.resolve(__dirname, '../../src/brisabase/pages/ProjectsPage.tsx'), 'utf-8');
    const functionsPage = readFileSync(path.resolve(__dirname, '../../src/brisabase/pages/FunctionsPage.tsx'), 'utf-8');
    const globalStyles = readFileSync(path.resolve(__dirname, '../../src/index.css'), 'utf-8');
    assert.match(projectsPage, /isSelected[\s\S]{0,900}\? 'bg-purple-600\/30 text-white border border-purple-500\/30'/, 'The active project control must keep its text white.');
    assert.match(functionsPage, /isSelected[\s\S]{0,500}\? 'bg-purple-600\/20 text-white border border-purple-500\/30 font-bold'/, 'The selected Function control must keep its text white.');
    assert.match(globalStyles, /\[class\*="text-purple-"\]\s*\{\s*color:\s*#ffffff\s*!important;\s*\}/, 'Purple text utility classes must render as white in the admin UI.');

    const avatarSources = [
      '../../src/services/authService.ts',
      '../../src/brisabase/pages/AuthPage.tsx',
      '../../src/brisabase/components/auth/UserDetailModal.tsx',
      '../../src/brisabase/pages/TeamPage.tsx',
      '../../src/brisabase/mocks/mockAuth.ts',
      '../../src/brisabase/mocks/mockTeam.ts',
      '../../server/db/authDatabase.ts',
    ];
    for (const relative of avatarSources) {
      const source = readFileSync(path.resolve(__dirname, relative), 'utf-8');
      assert.doesNotMatch(source, /images\.unsplash\.com/i, `${relative} must not load a third-party avatar.`);
    }
  });

  // =============================================
  // TEST 12: RESTORE - Success case returns real data, not mocks
  // =============================================
  await runTest('Success path: Real API data is returned (no mocks in API mode)', async () => {
    const realProjects = [{ id: 'proj_real_1', name: 'Real Project', slug: 'real-project', description: '', environment: 'production', region: 'us-east-1', status: 'active', requests24h: 10, usersCount: 5, storageUsedMb: 100, functionsCount: 2, uptime: 99.9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
    mockFetchSuccess(realProjects);

    // Re-import with success mock
    mockFetchSuccess(realProjects);
    const { realProjectService } = await import('../../src/services/projectService');
    const list = await realProjectService.listProjects();

    assert.ok(Array.isArray(list), 'Should return an array');
    assert.equal(list.length, 1, 'Should return exactly 1 project');
    assert.equal(list[0].name, 'Real Project', 'Should return the real data');
    assert.notEqual(list[0].name, 'E-commerce SaaS', 'Should NOT return mock project');
  });

  restoreFetch();
  console.log('\n=== CONTRACT TEST COMPLETE ===');
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
