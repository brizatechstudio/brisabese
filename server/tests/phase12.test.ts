import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DeveloperSdkCore } from '../../developer/sdk/core';
import { SdkGenerator } from '../../developer/sdk/generator';
import { TemplateRegistry } from '../../developer/templates/templateRegistry';
import { CodeGenerator } from '../../developer/generators/codeGenerator';
import { DocumentationEngine } from '../../developer/documentation/documentationEngine';
import { MarketplaceRegistry } from '../../developer/marketplace/marketplaceRegistry';
import { developerPlatform } from '../../developer/platform';
import { PluginEngine, signPlugin } from '../../developer/plugins/pluginEngine';
import { DeveloperContext, PluginManifest } from '../../developer/types';
import { ecosystemRouter } from '../routes/ecosystem';
import { db } from '../db/database';

const context: DeveloperContext = { organizationId: 'org_core_1', projectId: 'proj_ecommerce_1', environmentId: 'env_proj_ecommerce_1_production', userId: 'usr_owner_1', role: 'owner' };
function expect(value: unknown, message: string): asserts value { assert.ok(value, `TEST FAILED (Phase 12): ${message}`); }

export async function runPhase12Tests() {
  console.log('Starting Phase 12 developer platform tests...\n');
  const originalFetch = globalThis.fetch;
  let requests = 0; let interceptorSeen = false;
  globalThis.fetch = (async (_input: any, init?: RequestInit) => { requests += 1; interceptorSeen ||= Boolean((init?.headers as Record<string, string>)?.['x-client']); if (requests === 1) return new Response(JSON.stringify({ error: { message: 'expired' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }); return new Response(JSON.stringify({ ok: true, call: requests }), { headers: { 'Content-Type': 'application/json' } }); }) as typeof fetch;
  try {
    const sdk = new DeveloperSdkCore({ url: 'https://sdk.test', accessToken: 'old', cache: true, refreshToken: async () => 'fresh' });
    sdk.addInterceptor(({ init }) => ({ ...init, headers: { ...(init.headers || {}), 'x-client': 'phase12' } }));
    const first = await sdk.request<{ ok: boolean }>('/health', { method: 'GET' }, 10_000);
    const cached = await sdk.request<{ ok: boolean }>('/health', { method: 'GET' }, 10_000);
    expect(first.ok && cached.ok && requests === 2 && interceptorSeen, 'SDK core must refresh tokens, support interceptors, retry safely, and cache GET responses');
  } finally { globalThis.fetch = originalFetch; }
  const generator = new SdkGenerator();
  const generatedSdks = generator.generateAll(); expect(generatedSdks.length === 19 && generatedSdks.filter((item) => item.maturity === 'official').length === 2 && generator.official().length === 2 && generatedSdks.every((item) => item.source.length > 0), 'SDK generator must distinguish the official @brisabase/js targets from preview language generators');
  console.log('Test 1: SDK core, refresh/interceptors/cache, and multi-language generator.');

  const templates = new TemplateRegistry();
  expect(templates.list().length >= 20 && templates.get('react-starter')?.files['brisabase.json'], 'Template registry must include starter and official solution templates');
  const code = new CodeGenerator().generate({ resource: 'product', target: 'react', fields: [{ name: 'id', type: 'string', required: true }, { name: 'name', type: 'string' }] });
  expect(Boolean(code.files['Product.ts']) && Boolean(code.files['useProduct.ts']), 'Code generator must emit models, DTO/service, and React hooks');
  expect(new DocumentationEngine().search('plugin security').length === 1, 'Documentation engine must index searchable living documentation');
  const marketplace = new MarketplaceRegistry();
  expect(marketplace.publish({ name: 'Phase 12 Theme', slug: 'phase12-theme', category: 'theme', version: '1.0.0', author: 'test', description: 'test', dependencies: [], rating: 5, ratingsCount: 1, changelog: 'initial' }).signed === false, 'Marketplace must preserve signing state for independently published artifacts');
  console.log('Test 2: templates, generators, documentation, and marketplace registry.');

  const plugins = new PluginEngine();
  const unsigned: PluginManifest = { id: 'plugin-phase12', name: 'Phase 12 Plugin', version: '1.0.0', author: 'test', permissions: ['database:read', 'ui:widget'] };
  const signed = { ...unsigned, signature: signPlugin(unsigned) };
  const installed = plugins.install(context, signed);
  expect(installed.sandbox.isolated && plugins.capabilities(context, signed.id).includes('database:read'), 'Signed plugins must run in an isolated capability sandbox');
  assert.throws(() => plugins.install(context, { ...unsigned, signature: 'forged' }), /signature|permissions/i, 'Forged plugins must be rejected');
  const catalog = developerPlatform.pluginCatalog();
  const platformPlugin = developerPlatform.installPlugin(context, catalog[0]);
  expect(platformPlugin.manifest.id === catalog[0].id && db.getAuditLogs(context.organizationId, context.projectId).some((entry) => entry.action === 'plugin.installed'), 'Developer platform must audit plugin installation');
  console.log('Test 3: plugin signature verification, isolation, and audit trail.');

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'brisabase-cli-'));
  try {
    const cli = path.join(process.cwd(), 'developer', 'cli', 'brisabase.mjs');
    const init = spawnSync(process.execPath, [cli, 'init', 'react-starter', temp], { encoding: 'utf8' });
    expect(init.status === 0 && await fs.stat(path.join(temp, 'brisabase.json')), 'brisabase init must create a safe local project configuration');
    const doctor = spawnSync(process.execPath, [cli, 'doctor'], { cwd: temp, encoding: 'utf8' });
    expect(doctor.status === 0 && doctor.stdout.includes('"config": true'), 'brisabase doctor must validate a local project without requiring a running server');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
  console.log('Test 4: official CLI init and doctor workflow.');

  const app = express(); app.use(express.json()); app.use(ecosystemRouter);
  const server = await new Promise<import('node:http').Server>((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const address = server.address() as import('node:net').AddressInfo; const base = `http://127.0.0.1:${address.port}`;
    const overview = await fetch(`${base}/api/ecosystem/overview`); expect(overview.ok && (await overview.json()).sdks.length === 19, 'Ecosystem preview must expose generated SDK templates with maturity metadata');
    const sdk = await fetch(`${base}/api/ecosystem/sdks/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: 'python' }) }); expect(sdk.status === 201 && (await sdk.json()).maturity === 'preview', 'Ecosystem API must label non-JS generated SDK artifacts as preview');
    const docs = await fetch(`${base}/api/ecosystem/documentation?search=quickstart`); expect(docs.ok && (await docs.json()).length > 0, 'Ecosystem API must search documentation');
    const playground = await fetch(`${base}/api/ecosystem/playground`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'api', action: 'request', payload: { path: '/rest/v1/products' } }) }); expect(playground.ok, 'Ecosystem API must run the safe playground');
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  console.log('Test 5: /api/ecosystem endpoints and safe playground.');
  console.log('All Phase 12 developer platform tests passed.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runPhase12Tests().catch((error) => { console.error(error); process.exitCode = 1; });
