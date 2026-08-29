import { strict as assert } from 'assert';

const originalFetch = globalThis.fetch;
function mockFetchFailure(): void {
  (globalThis as any).fetch = async () => { throw new Error('Network failure'); };
}
function mockFetchSuccess(payload: any, status = 200): void {
  (globalThis as any).fetch = async () => ({ ok: status >= 200 && status < 300, status, json: async () => payload } as Response);
}
function restoreFetch(): void { (globalThis as any).fetch = originalFetch; }

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log('=== projectService mode tests ===');

  await runTest('MockProjectService returns mock projects', async () => {
    const { mockProjectService } = await import('../../src/services/projectService');
    const list = await mockProjectService.listProjects();
    assert.ok(Array.isArray(list), 'Should return array');
    assert.ok(list.length > 0, 'Should have at least one mock project');
  });

  await runTest('RealProjectService returns real data on success', async () => {
    mockFetchSuccess([{ id: 'proj_real_1', name: 'Real Project', slug: 'real-1', region: 'us-east-1', status: 'active', requests24h: 1, usersCount: 1, storageUsedMb: 0, functionsCount: 0, uptime: 99.9, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
    const { realProjectService } = await import('../../src/services/projectService');
    const list = await realProjectService.listProjects();
    assert.ok(Array.isArray(list), 'Should return array');
    assert.equal(list[0].name, 'Real Project');
    restoreFetch();
  });

  await runTest('RealProjectService propagates error when API fails', async () => {
    mockFetchFailure();
    const { realProjectService } = await import('../../src/services/projectService');
    let threw = false;
    try {
      await realProjectService.listProjects();
    } catch (err) {
      threw = true;
    }
    assert.ok(threw, 'RealProjectService should throw when API fetch fails');
    restoreFetch();
  });

  console.log('=== projectService mode tests complete ===');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
