import { adminAuthService } from './adminAuthService';

let installed = false;

function internalApi(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/') ? url : null;
  } catch {
    return null;
  }
}

function scopedHeaders(url: URL, source?: HeadersInit): Headers {
  const headers = new Headers(source);
  const token = adminAuthService.getAccessToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  const organizationId = window.localStorage.getItem('brisabase.organizationId');
  const projectId = window.localStorage.getItem('brisabase.projectId');
  const environmentId = window.localStorage.getItem('brisabase.environmentId');
  const isScopeDiscoveryRequest = url.pathname === '/api/projects'
    || /^\/api\/projects\/[^/]+\/environments$/.test(url.pathname);
  if (organizationId && !isScopeDiscoveryRequest && !headers.has('x-organization-id')) headers.set('x-organization-id', organizationId);
  if (projectId && !isScopeDiscoveryRequest && !headers.has('x-project-id')) headers.set('x-project-id', projectId);
  if (environmentId && !isScopeDiscoveryRequest && !headers.has('x-environment-id')) headers.set('x-environment-id', environmentId);
  return headers;
}

/** Install one same-origin control-plane interceptor. External URLs and project
 * data-plane endpoints never receive the administrative credential. */
export function installControlPlaneFetch(): void {
  if (installed) return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = internalApi(input);
    if (!url || url.pathname.startsWith('/api/admin/auth/') || url.pathname.startsWith('/api/auth/')) return nativeFetch(input, init);
    const request = input instanceof Request ? input : undefined;
    const firstInit = { ...init, headers: scopedHeaders(url, init.headers || request?.headers) };
    let response = await nativeFetch(input, firstInit);
    if (response.status === 401 && await adminAuthService.refresh()) {
      response = await nativeFetch(input, { ...init, headers: scopedHeaders(url, init.headers || request?.headers) });
    }
    return response;
  };
}
