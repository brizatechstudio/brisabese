import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_API_URL = process.env.ADMIN_UI_URL || 'http://localhost:3000';
const RUN_ID = String(process.env.GITHUB_RUN_ID || process.env.ADMIN_SMOKE_RUN_ID || 'local').replace(/[^a-zA-Z0-9_-]/g, '-');
const SESSION_FILE = process.env.BRISABASE_E2E_SESSION_FILE || path.join(os.tmpdir(), `brisabase-release-session-${RUN_ID}.json`);

export const RELEASE_ADMIN_EMAIL = process.env.ADMIN_SMOKE_EMAIL || `release-admin-${RUN_ID}@brisabase.local`;
export const RELEASE_ADMIN_PASSWORD = process.env.ADMIN_SMOKE_PASSWORD || 'SuperSecretSmokePassword123!';
const ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN || 'local-bootstrap-token-for-isolated-e2e-only-2026';

export interface ReleaseAdminSession {
  access_token: string;
  user: Record<string, unknown>;
}

export interface ReleaseScope {
  organizationId: string;
  projectId: string;
  environmentId: string;
}

interface ReleaseCache {
  apiUrl: string;
  session: ReleaseAdminSession;
  scope?: ReleaseScope;
}

let memoryCache: ReleaseCache | null = null;

async function payload(response: Response): Promise<any> {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function login(apiUrl: string): Promise<Response> {
  return fetch(`${apiUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: RELEASE_ADMIN_EMAIL, password: RELEASE_ADMIN_PASSWORD }),
  });
}

async function readCache(apiUrl: string): Promise<ReleaseCache | null> {
  if (memoryCache?.apiUrl === apiUrl) return memoryCache;
  try {
    const cached = JSON.parse(await readFile(SESSION_FILE, 'utf8')) as ReleaseCache;
    if (cached.apiUrl !== apiUrl || !cached.session?.access_token || !cached.session?.user) return null;
    memoryCache = cached;
    return cached;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    return null;
  }
}

async function writeCache(cache: ReleaseCache): Promise<void> {
  await mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await writeFile(SESSION_FILE, `${JSON.stringify(cache)}\n`, { encoding: 'utf8', mode: 0o600 });
  memoryCache = cache;
}

export async function resetReleaseAdminCache(): Promise<void> {
  memoryCache = null;
  await rm(SESSION_FILE, { force: true });
}

export async function ensureReleaseAdmin(apiUrl = DEFAULT_API_URL): Promise<ReleaseAdminSession> {
  const cached = await readCache(apiUrl);
  if (cached) return cached.session;

  let response = await login(apiUrl);
  if (response.status === 401) {
    const signup = await fetch(`${apiUrl}/api/admin/auth/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-bootstrap-token': ADMIN_BOOTSTRAP_TOKEN,
      },
      body: JSON.stringify({
        email: RELEASE_ADMIN_EMAIL,
        password: RELEASE_ADMIN_PASSWORD,
        name: 'BrisaBase Release Owner',
      }),
    });
    const signupBody = await payload(signup);
    if (![201, 409].includes(signup.status)) {
      throw new Error(`Release admin initialization failed with HTTP ${signup.status}: ${JSON.stringify(signupBody)}`);
    }
    response = await login(apiUrl);
  }
  const body = await payload(response);
  if (response.status !== 200 || !body?.access_token) {
    throw new Error(`Release admin login failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  await firstReleaseOrganization(body.access_token, apiUrl);
  await writeCache({ apiUrl, session: body as ReleaseAdminSession });
  return body as ReleaseAdminSession;
}

export async function firstReleaseOrganization(accessToken: string, apiUrl = DEFAULT_API_URL): Promise<string> {
  const cached = await readCache(apiUrl);
  if (cached?.session.access_token === accessToken && cached.scope?.organizationId) return cached.scope.organizationId;

  const response = await fetch(`${apiUrl}/api/organizations`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await payload(response);
  if (response.status !== 200 || !Array.isArray(body)) {
    throw new Error(`Release organization lookup failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  if (body[0]?.id) return String(body[0].id);
  const created = await fetch(`${apiUrl}/api/organizations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: `Release Organization ${RUN_ID}`, slug: `release-organization-${RUN_ID}` }),
  });
  const createdBody = await payload(created);
  if (created.status !== 201 || !createdBody?.id) {
    throw new Error(`Release organization initialization failed with HTTP ${created.status}: ${JSON.stringify(createdBody)}`);
  }
  return String(createdBody.id);
}

export async function ensureReleaseScope(apiUrl = DEFAULT_API_URL): Promise<{ session: ReleaseAdminSession; scope: ReleaseScope }> {
  const cached = await readCache(apiUrl);
  if (cached?.scope) return { session: cached.session, scope: cached.scope };

  const session = cached?.session || await ensureReleaseAdmin(apiUrl);
  const organizationId = await firstReleaseOrganization(session.access_token, apiUrl);
  const headers = { authorization: `Bearer ${session.access_token}`, 'x-organization-id': organizationId };
  const projectsResponse = await fetch(`${apiUrl}/api/projects?organization_id=${encodeURIComponent(organizationId)}`, { headers });
  const projects = await payload(projectsResponse);
  if (projectsResponse.status !== 200 || !Array.isArray(projects)) {
    throw new Error(`Release project lookup failed with HTTP ${projectsResponse.status}: ${JSON.stringify(projects)}`);
  }

  const projectName = `Release Scope ${RUN_ID}`;
  let projectId = String(projects.find((project: any) => project?.name === projectName)?.id || '');
  if (!projectId) {
    const projectResponse = await fetch(`${apiUrl}/api/projects`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId, name: projectName, region: 'us-east-1' }),
    });
    const project = await payload(projectResponse);
    if (projectResponse.status !== 201 || !project?.id) {
      throw new Error(`Release project initialization failed with HTTP ${projectResponse.status}: ${JSON.stringify(project)}`);
    }
    projectId = String(project.id);
  }

  const environmentsResponse = await fetch(`${apiUrl}/api/projects/${encodeURIComponent(projectId)}/environments`, {
    headers: { ...headers, 'x-project-id': projectId },
  });
  const environments = await payload(environmentsResponse);
  const environmentId = String(Array.isArray(environments)
    ? environments.find((environment: any) => environment?.type === 'production')?.id || environments[0]?.id || ''
    : '');
  if (environmentsResponse.status !== 200 || !environmentId) {
    throw new Error(`Release environment lookup failed with HTTP ${environmentsResponse.status}: ${JSON.stringify(environments)}`);
  }

  const scope = { organizationId, projectId, environmentId };
  await writeCache({ apiUrl, session, scope });
  return { session, scope };
}
