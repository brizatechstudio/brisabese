export type PreviewEnvironment = {
  id: string;
  organizationId: string;
  projectId: string;
  sourceEnvironmentId: string;
  previewEnvironmentId: string;
  branchName: string;
  includeData: boolean;
  status: string;
  expiresAt?: string;
  createdAt: string;
  errorMessage?: string;
};

export type HostingSite = {
  id: string;
  name: string;
  slug: string;
  status: string;
  activeDeploymentId?: string;
  builtInUrl: string;
  customDomain?: string;
  config?: { redirects: Array<{ from: string; to: string; status?: number }>; rewrites: Array<{ from: string; to: string }>; publicEnv: Record<string,string> };
  createdAt: string;
};

export type HostingDomain = { id: string; site_id?: string; hostname: string; status: string; tls_status: string; verified_at?: string; created_at?: string; dnsRecord?: { type: string; name: string; value: string } };

export type HostingDeployment = {
  id: string;
  siteId: string;
  version: number;
  status: string;
  fileCount: number;
  sizeBytes: number;
  createdAt: string;
  activatedAt?: string;
};

export type MessagingStatus = { provider: 'fcm'; configured: boolean };
export type MessagingDevice = {
  id: string;
  userId?: string;
  provider: string;
  platform: 'web' | 'android' | 'ios';
  status: string;
  lastSeenAt: string;
  createdAt: string;
};
export type MessagingMessage = {
  id: string;
  title?: string;
  body: string;
  status: string;
  provider?: string;
  attemptedCount: number;
  deliveredCount: number;
  failedCount: number;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
};

type JsonInit = Omit<RequestInit, 'body'> & { body?: unknown };

async function request<T>(url: string, init: JsonInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.body);
  }
  const response = await fetch(url, { ...init, headers, body });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `BrisaBase request failed (${response.status}).`);
  }
  return payload as T;
}

export const previewDatabaseService = {
  list: () => request<PreviewEnvironment[]>('/api/previews'),
  create: (input: { branchName: string; includeData?: boolean; ttlHours?: number }) => request<PreviewEnvironment>('/api/previews', { method: 'POST', body: input }),
  remove: (id: string) => request<void>(`/api/previews/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  cleanupExpired: () => request<{ expired: number }>('/api/previews/cleanup/expired', { method: 'POST' }),
};

export const hostingService = {
  listSites: () => request<HostingSite[]>('/api/hosting/sites'),
  createSite: (input: { name: string; slug?: string }) => request<HostingSite>('/api/hosting/sites', { method: 'POST', body: input }),
  disableSite: (siteId: string) => request<void>(`/api/hosting/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' }),
  listDeployments: (siteId: string) => request<HostingDeployment[]>(`/api/hosting/sites/${encodeURIComponent(siteId)}/deployments`),
  deployFiles: (siteId: string, files: Array<{ path: string; contentBase64: string; mimeType?: string; cacheControl?: string }>) => request<HostingDeployment>(`/api/hosting/sites/${encodeURIComponent(siteId)}/deployments`, { method: 'POST', body: { files } }),
  activate: (siteId: string, deploymentId: string) => request<HostingDeployment>(`/api/hosting/sites/${encodeURIComponent(siteId)}/deployments/${encodeURIComponent(deploymentId)}/activate`, { method: 'POST' }),
  updateConfig: (siteId: string, config: HostingSite['config']) => request<HostingSite>(`/api/hosting/sites/${encodeURIComponent(siteId)}/config`, { method: 'PATCH', body: config }),
  listDomains: (siteId: string) => request<HostingDomain[]>(`/api/hosting/sites/${encodeURIComponent(siteId)}/domains`),
  addDomain: (siteId: string, hostname: string) => request<HostingDomain>(`/api/hosting/sites/${encodeURIComponent(siteId)}/domains`, { method: 'POST', body: { hostname } }),
  verifyDomain: (siteId: string, domainId: string) => request<HostingDomain>(`/api/hosting/sites/${encodeURIComponent(siteId)}/domains/${encodeURIComponent(domainId)}/verify`, { method: 'POST' }),
  removeDomain: (siteId: string, domainId: string) => request<void>(`/api/hosting/sites/${encodeURIComponent(siteId)}/domains/${encodeURIComponent(domainId)}`, { method: 'DELETE' }),
};

export const messagingService = {
  status: () => request<MessagingStatus>('/api/messaging/status'),
  listDevices: () => request<MessagingDevice[]>('/api/messaging/devices'),
  listMessages: () => request<MessagingMessage[]>('/api/messaging/messages'),
  createMessage: (input: { title?: string; body: string; data?: Record<string, unknown>; audience?: Record<string, unknown>; scheduledAt?: string }) => request<MessagingMessage>('/api/messaging/messages', { method: 'POST', body: input }),
  send: (messageId: string) => request<MessagingMessage>(`/api/messaging/messages/${encodeURIComponent(messageId)}/send`, { method: 'POST' }),
  cancel: (messageId: string) => request<void>(`/api/messaging/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
};

export const graphqlManagementService = {
  endpoint(): string {
    return `${window.location.origin}/graphql/v1`;
  },
  schemaEndpoint(): string {
    return `${window.location.origin}/graphql/v1/schema`;
  },
};
