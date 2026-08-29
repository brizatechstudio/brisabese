import {
  Project,
  AuthUser,
  DatabaseCollection,
  DatabaseDocument,
  StorageFile,
  ServerlessFunction,
  ApiService,
  LogItem,
  NotificationItem,
  ApiKeyItem,
  WebhookItem,
  TeamMember,
  RealtimeConnection
} from '../types';
import { initialProjects } from '../data/mockProjects';
import { initialUsers } from '../data/mockUsers';
import { initialCollections, initialDocuments } from '../data/mockDocuments';
import { initialFunctions } from '../data/mockFunctions';
import { initialApis } from '../data/mockApis';
import { initialLogs } from '../data/mockLogs';
import { initialStorageFiles } from '../data/mockStorage';
import { initialNotifications } from '../data/mockNotifications';
import { initialApiKeys, initialWebhooks } from '../data/mockSettings';
import { initialMembers } from '../data/mockMembers';
import { initialRealtimeConnections } from '../data/mockRealtime';
import { isRealMode, mapRealProject, realProjectService, realAuthService, realFunctionsService, realApiService, realLogsService, realTeamService } from './runtime';
import type { AuthUser as RealAuthUser, ServerlessFunction as RealServerlessFunction } from '../brisabase/types';

// Helper for realistic async delays
export const delay = (ms = 400): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const STORAGE_KEYS = {
  PROJECTS: 'brisabase_projects_v1',
  ACTIVE_PROJECT: 'brisabase_active_project_id_v1',
  USERS: 'brisabase_users_v1',
  COLLECTIONS: 'brisabase_collections_v1',
  DOCUMENTS: 'brisabase_documents_v1',
  FUNCTIONS: 'brisabase_functions_v1',
  APIS: 'brisabase_apis_v1',
  LOGS: 'brisabase_logs_v1',
  STORAGE_FILES: 'brisabase_storage_files_v1',
  NOTIFICATIONS: 'brisabase_notifications_v1',
  API_KEYS: 'brisabase_api_keys_v1',
  WEBHOOKS: 'brisabase_webhooks_v1',
  MEMBERS: 'brisabase_members_v1',
  SIDEBAR_COLLAPSED: 'brisabase_sidebar_collapsed_v1',
  AUTH_CURRENT_USER: 'brisabase_current_user_v1'
};

function getStored<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Error writing to localStorage', err);
  }
}


function mapRealAuthUser(user: RealAuthUser): AuthUser {
  return {
    id: user.id,
    uid: user.id,
    name: user.name || user.email.split('@')[0],
    email: user.email,
    avatar: user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    provider: (['email', 'google', 'github', 'apple'].includes(user.provider) ? user.provider : 'email') as AuthUser['provider'],
    role: user.role === 'admin' ? 'Admin' : user.role === 'moderator' ? 'Developer' : 'Viewer',
    status: user.status === 'blocked' ? 'suspended' : user.status === 'unverified' ? 'invited' : 'active',
    createdAt: user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : '—',
    lastLogin: user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString('pt-BR') : 'Nunca',
    sessionsCount: 0,
    location: 'Runtime real'
  };
}

function mapRealFunction(fn: RealServerlessFunction): ServerlessFunction {
  return {
    id: fn.id,
    name: fn.name,
    description: `Função ${fn.slug} executada pelo runtime real do BrisaBase`,
    status: fn.status === 'failed' ? 'error' : fn.status,
    runtime: fn.runtime === 'python311' ? 'Python 3.11' : fn.runtime === 'go121' ? 'Go 1.21' : 'Node.js 20',
    region: 'Local runtime',
    memory: `${fn.memoryMb || 256} MB`,
    timeout: 60,
    executionsCount: String(fn.invocationsTotal || 0),
    executionsTotal: fn.invocationsTotal || 0,
    avgDuration: `${Math.round(fn.avgDurationMs || 0)}ms`,
    errorRate: `${Math.max(0, 100 - (fn.successRate ?? 100)).toFixed(1)}%`,
    lastExecuted: fn.lastExecutedAt || 'Nunca',
    code: fn.codeSnippet || '',
    environmentVariables: Object.entries(fn.envVars || {}).map(([key, value]) => ({ key, value }))
  };
}

// Mock API service layer
export const mockApi = {
  // Projects
  async getProjects(): Promise<Project[]> {
    if (isRealMode) return (await realProjectService.listProjects()).map(mapRealProject);
    await delay(300);
    return getStored<Project[]>(STORAGE_KEYS.PROJECTS, initialProjects);
  },

  async createProject(projectData: Partial<Project>): Promise<Project> {
    if (isRealMode) {
      const created = await realProjectService.createProject({
        name: projectData.name || 'Novo Projeto',
        description: projectData.description || 'Projeto BrisaBase',
        region: projectData.region || 'local',
        environment: projectData.category || 'development'
      });
      return mapRealProject(created);
    }
    await delay(500);
    const projects = getStored<Project[]>(STORAGE_KEYS.PROJECTS, initialProjects);
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: projectData.name || 'Novo Projeto',
      slug: (projectData.name || 'novo-projeto').toLowerCase().replace(/\s+/g, '-'),
      description: projectData.description || 'Novo projeto criado no BrisaBase',
      region: projectData.region || 'sa-east-1 (São Paulo)',
      status: 'active',
      usersCount: '0',
      databaseSize: '0 MB',
      storageSize: '0 MB',
      requestsCount: '0',
      lastActivity: 'Agora mesmo',
      category: 'development',
      iconColor: '#12D9FF',
      membersCount: 1,
      ...projectData
    };
    const updated = [newProject, ...projects];
    setStored(STORAGE_KEYS.PROJECTS, updated);
    return newProject;
  },

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    if (isRealMode) {
      const status = updates.status === 'active' ? 'online' : updates.status === 'development' ? 'deploying' : updates.status === 'maintenance' ? 'maintenance' : updates.status === 'paused' ? 'offline' : undefined;
      const updated = await realProjectService.updateProject(id, {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.region !== undefined ? { region: updates.region } : {}),
        ...(updates.category !== undefined ? { environment: updates.category } : {}),
        ...(status ? { status } : {})
      });
      return mapRealProject(updated);
    }
    await delay(400);
    const projects = getStored<Project[]>(STORAGE_KEYS.PROJECTS, initialProjects);
    const index = projects.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Projeto não encontrado');
    const updatedProject = { ...projects[index], ...updates };
    projects[index] = updatedProject;
    setStored(STORAGE_KEYS.PROJECTS, projects);
    return updatedProject;
  },

  async deleteProject(id: string): Promise<boolean> {
    if (isRealMode) { await realProjectService.deleteProject(id); return true; }
    await delay(400);
    const projects = getStored<Project[]>(STORAGE_KEYS.PROJECTS, initialProjects);
    const filtered = projects.filter((p) => p.id !== id);
    setStored(STORAGE_KEYS.PROJECTS, filtered);
    return true;
  },

  // Database Collections & Documents
  async getCollections(): Promise<DatabaseCollection[]> {
    await delay(300);
    return getStored<DatabaseCollection[]>(STORAGE_KEYS.COLLECTIONS, initialCollections);
  },

  async createCollection(name: string, description: string): Promise<DatabaseCollection> {
    await delay(500);
    const collections = getStored<DatabaseCollection[]>(STORAGE_KEYS.COLLECTIONS, initialCollections);
    const newCol: DatabaseCollection = {
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      description,
      count: 0,
      size: '0 KB',
      createdAt: new Date().toLocaleDateString('pt-BR'),
      updatedAt: 'Agora mesmo',
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'createdAt', type: 'date', required: true }
      ]
    };
    const updated = [...collections, newCol];
    setStored(STORAGE_KEYS.COLLECTIONS, updated);
    return newCol;
  },

  async getDocuments(collectionId: string): Promise<DatabaseDocument[]> {
    await delay(350);
    const allDocs = getStored<Record<string, DatabaseDocument[]>>(STORAGE_KEYS.DOCUMENTS, initialDocuments);
    return allDocs[collectionId] || [];
  },

  async createDocument(collectionId: string, data: Record<string, any>): Promise<DatabaseDocument> {
    await delay(450);
    const allDocs = getStored<Record<string, DatabaseDocument[]>>(STORAGE_KEYS.DOCUMENTS, initialDocuments);
    const colDocs = allDocs[collectionId] || [];
    const newDoc: DatabaseDocument = {
      id: `doc_${collectionId.slice(0, 3)}_${Math.random().toString(36).substring(2, 8)}`,
      collectionId,
      data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    allDocs[collectionId] = [newDoc, ...colDocs];
    setStored(STORAGE_KEYS.DOCUMENTS, allDocs);
    return newDoc;
  },

  async updateDocument(collectionId: string, docId: string, data: Record<string, any>): Promise<DatabaseDocument> {
    await delay(400);
    const allDocs = getStored<Record<string, DatabaseDocument[]>>(STORAGE_KEYS.DOCUMENTS, initialDocuments);
    const colDocs = allDocs[collectionId] || [];
    const index = colDocs.findIndex((d) => d.id === docId);
    if (index === -1) throw new Error('Documento não encontrado');
    const updatedDoc: DatabaseDocument = {
      ...colDocs[index],
      data: { ...colDocs[index].data, ...data },
      updatedAt: new Date().toISOString()
    };
    colDocs[index] = updatedDoc;
    allDocs[collectionId] = colDocs;
    setStored(STORAGE_KEYS.DOCUMENTS, allDocs);
    return updatedDoc;
  },

  async deleteDocument(collectionId: string, docId: string): Promise<boolean> {
    await delay(350);
    const allDocs = getStored<Record<string, DatabaseDocument[]>>(STORAGE_KEYS.DOCUMENTS, initialDocuments);
    const colDocs = allDocs[collectionId] || [];
    allDocs[collectionId] = colDocs.filter((d) => d.id !== docId);
    setStored(STORAGE_KEYS.DOCUMENTS, allDocs);
    return true;
  },

  // Users / Auth
  async getUsers(): Promise<AuthUser[]> {
    if (isRealMode) return (await realAuthService.listUsers()).map(mapRealAuthUser);
    await delay(300);
    return getStored<AuthUser[]>(STORAGE_KEYS.USERS, initialUsers);
  },

  async createUser(userData: Partial<AuthUser>): Promise<AuthUser> {
    if (isRealMode) {
      const created = await realAuthService.createUser({
        name: userData.name || 'Novo Usuário',
        email: userData.email || 'novo@brisabase.local',
        role: userData.role === 'Admin' ? 'admin' : userData.role === 'Developer' ? 'moderator' : 'user',
        provider: (userData.provider || 'email') as any
      });
      return mapRealAuthUser(created);
    }
    await delay(500);
    const users = getStored<AuthUser[]>(STORAGE_KEYS.USERS, initialUsers);
    const newUser: AuthUser = {
      id: `user-${Date.now()}`,
      uid: `usr_${Math.random().toString(36).substring(2, 12)}`,
      name: userData.name || 'Novo Usuário',
      email: userData.email || 'novo@brisabase.dev',
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      provider: userData.provider || 'email',
      role: userData.role || 'Developer',
      status: 'active',
      createdAt: new Date().toLocaleDateString('pt-BR'),
      lastLogin: 'Agora mesmo',
      sessionsCount: 1,
      location: 'São Paulo, Brasil'
    };
    const updated = [newUser, ...users];
    setStored(STORAGE_KEYS.USERS, updated);
    return newUser;
  },

  async updateUser(id: string, updates: Partial<AuthUser>): Promise<AuthUser> {
    if (isRealMode) {
      if (updates.status !== undefined) return mapRealAuthUser(await realAuthService.toggleUserBlockStatus(id));
      const current = (await realAuthService.listUsers()).find((user) => user.id === id);
      if (!current) throw new Error('Usuário não encontrado');
      return mapRealAuthUser(current);
    }
    await delay(400);
    const users = getStored<AuthUser[]>(STORAGE_KEYS.USERS, initialUsers);
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new Error('Usuário não encontrado');
    const updatedUser = { ...users[index], ...updates };
    users[index] = updatedUser;
    setStored(STORAGE_KEYS.USERS, users);
    return updatedUser;
  },

  async deleteUser(id: string): Promise<boolean> {
    if (isRealMode) { await realAuthService.deleteUser(id); return true; }
    await delay(350);
    const users = getStored<AuthUser[]>(STORAGE_KEYS.USERS, initialUsers);
    const filtered = users.filter((u) => u.id !== id);
    setStored(STORAGE_KEYS.USERS, filtered);
    return true;
  },

  // Storage
  async getStorageFiles(): Promise<StorageFile[]> {
    await delay(300);
    return getStored<StorageFile[]>(STORAGE_KEYS.STORAGE_FILES, initialStorageFiles);
  },

  async uploadFile(file: Partial<StorageFile>): Promise<StorageFile> {
    await delay(600);
    const files = getStored<StorageFile[]>(STORAGE_KEYS.STORAGE_FILES, initialStorageFiles);
    const newFile: StorageFile = {
      id: `file-${Date.now()}`,
      name: file.name || 'novo_arquivo.png',
      folder: file.folder || 'uploads',
      size: file.size || '1.2 MB',
      bytes: file.bytes || 1258291,
      type: file.type || 'image',
      extension: (file.name || 'png').split('.').pop() || 'png',
      mimeType: file.mimeType || 'image/png',
      url: file.url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      updatedAt: 'Agora mesmo'
    };
    const updated = [newFile, ...files];
    setStored(STORAGE_KEYS.STORAGE_FILES, updated);
    return newFile;
  },

  async deleteFile(id: string): Promise<boolean> {
    await delay(350);
    const files = getStored<StorageFile[]>(STORAGE_KEYS.STORAGE_FILES, initialStorageFiles);
    const filtered = files.filter((f) => f.id !== id);
    setStored(STORAGE_KEYS.STORAGE_FILES, filtered);
    return true;
  },

  // Functions
  async getFunctions(): Promise<ServerlessFunction[]> {
    if (isRealMode) return (await realFunctionsService.listFunctions()).map(mapRealFunction);
    await delay(300);
    return getStored<ServerlessFunction[]>(STORAGE_KEYS.FUNCTIONS, initialFunctions);
  },

  async createFunction(funcData: Partial<ServerlessFunction>): Promise<ServerlessFunction> {
    if (isRealMode) {
      const runtime = String(funcData.runtime || '').toLowerCase().includes('python') ? 'python311' : String(funcData.runtime || '').toLowerCase().includes('go') ? 'go121' : 'nodejs20';
      const created = await realFunctionsService.createFunction({
        name: funcData.name || 'myFunction',
        runtime,
        codeSnippet: funcData.code || ''
      });
      return mapRealFunction(created);
    }
    await delay(600);
    const funcs = getStored<ServerlessFunction[]>(STORAGE_KEYS.FUNCTIONS, initialFunctions);
    const newFunc: ServerlessFunction = {
      id: `fn-${Date.now()}`,
      name: funcData.name || 'myFunction',
      description: funcData.description || 'Função serverless criada no BrisaBase',
      status: 'active',
      runtime: funcData.runtime || 'Node.js 20',
      region: funcData.region || 'São Paulo (sa-east-1)',
      memory: funcData.memory || '512 MB',
      timeout: funcData.timeout || 60,
      executionsCount: '0',
      executionsTotal: 0,
      avgDuration: '120ms',
      errorRate: '0.0%',
      lastExecuted: 'Nunca',
      environmentVariables: funcData.environmentVariables || [{ key: 'NODE_ENV', value: 'production' }],
      code: funcData.code || `export default async function handler(req, res) {\n  return res.status(200).json({ message: "Hello from BrisaBase Function!" });\n}`
    };
    const updated = [newFunc, ...funcs];
    setStored(STORAGE_KEYS.FUNCTIONS, updated);
    return newFunc;
  },

  // APIs
  async getApis(): Promise<ApiService[]> {
    if (isRealMode) {
      const endpoints = await realApiService.listEndpoints();
      return [{
        id: 'real-rest-api',
        name: 'REST Data API',
        description: 'REST API gerada a partir das tabelas PostgreSQL do projeto ativo.',
        baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
        status: 'active',
        requests: `${endpoints.reduce((sum, ep) => sum + Number(ep.requests24h || 0), 0)} / 24h`,
        latency: `${Math.round(endpoints.reduce((sum, ep) => sum + Number(ep.avgLatencyMs || 0), 0) / Math.max(1, endpoints.length))}ms`,
        errorRate: `${(100 - (endpoints.reduce((sum, ep) => sum + Number(ep.successRate || 100), 0) / Math.max(1, endpoints.length))).toFixed(2)}%`,
        endpoints: endpoints.map((ep) => ({
          id: ep.id,
          method: ep.method,
          path: ep.path,
          description: ep.description || `${ep.method} ${ep.path}`,
          status: 'active' as const,
          headers: ep.authRequired ? { Authorization: 'Bearer <project-api-key>' } : {},
          mockResponse: {}
        }))
      }];
    }
    await delay(300);
    return getStored<ApiService[]>(STORAGE_KEYS.APIS, initialApis);
  },

  async createApi(apiData: Partial<ApiService>): Promise<ApiService> {
    if (isRealMode) throw new Error('A REST Data API real é gerada automaticamente a partir das tabelas PostgreSQL.');
    await delay(500);
    const apis = getStored<ApiService[]>(STORAGE_KEYS.APIS, initialApis);
    const newApi: ApiService = {
      id: `api-${Date.now()}`,
      name: apiData.name || 'Nova API',
      description: apiData.description || 'Serviço de endpoints REST gerenciado',
      baseUrl: `https://api.brisabase.dev/v1/${(apiData.name || 'service').toLowerCase().replace(/\s+/g, '-')}`,
      status: 'active',
      requests: '0 / mês',
      latency: '35ms',
      errorRate: '0.0%',
      endpoints: [
        {
          id: `ep-${Date.now()}-1`,
          method: 'GET',
          path: `/${(apiData.name || 'items').toLowerCase().replace(/\s+/g, '-')}`,
          description: 'Recupera a lista de registros',
          status: 'active',
          headers: { 'Authorization': 'Bearer brisa_pk_live_***' },
          mockResponse: { status: 200, count: 0, items: [] }
        }
      ],
      ...apiData
    };
    const updated = [newApi, ...apis];
    setStored(STORAGE_KEYS.APIS, updated);
    return newApi;
  },

  // Logs
  async getLogs(): Promise<LogItem[]> {
    if (isRealMode) {
      const logs = await realLogsService.listLogs();
      return logs.map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        level: item.level === 'warn' ? 'WARNING' : item.level.toUpperCase() as LogItem['level'],
        service: item.service,
        message: item.message,
        requestId: item.id,
        duration: `${item.durationMs || 0}ms`,
        status: item.statusCode,
        latency: `${item.durationMs || 0}ms`,
        ip: item.ip,
        details: { method: item.method, path: item.path, userAgent: item.userAgent }
      }));
    }
    await delay(250);
    return getStored<LogItem[]>(STORAGE_KEYS.LOGS, initialLogs);
  },

  // Notifications
  async getNotifications(): Promise<NotificationItem[]> {
    await delay(200);
    return getStored<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, initialNotifications);
  },

  async markAllNotificationsRead(): Promise<void> {
    const notifs = getStored<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, initialNotifications);
    const updated = notifs.map((n) => ({ ...n, read: true }));
    setStored(STORAGE_KEYS.NOTIFICATIONS, updated);
  },

  // API Keys & Webhooks
  async getApiKeys(): Promise<ApiKeyItem[]> {
    if (isRealMode) {
      const keys = await realApiService.listApiKeys();
      return keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        fullKey: key.fullKeyMock,
        role: key.type === 'service' ? 'Admin' : key.type === 'secret' ? 'Write' : 'Read',
        createdAt: key.createdAt,
        lastUsed: key.lastUsedAt
      }));
    }
    return getStored<ApiKeyItem[]>(STORAGE_KEYS.API_KEYS, initialApiKeys);
  },

  async createApiKey(name: string, role: 'Read' | 'Write' | 'Admin'): Promise<ApiKeyItem> {
    if (isRealMode) {
      const type = role === 'Admin' ? 'service' : role === 'Write' ? 'secret' : 'public';
      const key = await realApiService.createApiKey(name, type);
      return { id: key.id, name: key.name, keyPrefix: key.keyPrefix, fullKey: key.fullSecretKey || key.fullKeyMock, role, createdAt: key.createdAt, lastUsed: key.lastUsedAt };
    }
    await delay(400);
    const keys = getStored<ApiKeyItem[]>(STORAGE_KEYS.API_KEYS, initialApiKeys);
    const randomHex = Math.random().toString(36).substring(2, 10);
    const prefix = role === 'Admin' ? 'brisa_sec_live_' : 'brisa_pk_live_';
    const newKey: ApiKeyItem = {
      id: `key-${Date.now()}`,
      name,
      keyPrefix: `${prefix}${randomHex.slice(0, 4)}`,
      fullKey: `${prefix}${randomHex}${Math.random().toString(36).substring(2, 18)}`,
      role,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      lastUsed: 'Nunca'
    };
    const updated = [newKey, ...keys];
    setStored(STORAGE_KEYS.API_KEYS, updated);
    return newKey;
  },

  async revokeApiKey(id: string): Promise<boolean> {
    if (isRealMode) { await realApiService.revokeApiKey(id); return true; }
    await delay(350);
    const keys = getStored<ApiKeyItem[]>(STORAGE_KEYS.API_KEYS, initialApiKeys);
    const filtered = keys.filter((k) => k.id !== id);
    setStored(STORAGE_KEYS.API_KEYS, filtered);
    return true;
  },

  async getWebhooks(): Promise<WebhookItem[]> {
    return getStored<WebhookItem[]>(STORAGE_KEYS.WEBHOOKS, initialWebhooks);
  },

  async createWebhook(name: string, event: string, url: string): Promise<WebhookItem> {
    await delay(450);
    const hooks = getStored<WebhookItem[]>(STORAGE_KEYS.WEBHOOKS, initialWebhooks);
    const newHook: WebhookItem = {
      id: `wh-${Date.now()}`,
      name,
      event,
      url,
      status: 'active',
      lastDelivery: 'Nunca disparado',
      successRate: '100%'
    };
    const updated = [newHook, ...hooks];
    setStored(STORAGE_KEYS.WEBHOOKS, updated);
    return newHook;
  },

  // Members
  async getMembers(): Promise<TeamMember[]> {
    if (isRealMode) {
      const members = await realTeamService.listMembers();
      return members.map((member) => ({ id: member.id, name: member.name, email: member.email, avatar: member.avatarUrl, role: member.role, status: member.status === 'pending' ? 'invited' : 'active', lastAccess: member.lastActive, addedAt: member.addedAt || '—' }));
    }
    return getStored<TeamMember[]>(STORAGE_KEYS.MEMBERS, initialMembers);
  },

  async inviteMember(name: string, email: string, role: any): Promise<TeamMember> {
    if (isRealMode) {
      const member = await realTeamService.inviteMember(email, role);
      return { id: member.id, name: member.name || name, email: member.email, avatar: member.avatarUrl, role: member.role, status: member.status === 'pending' ? 'invited' : 'active', lastAccess: member.lastActive, addedAt: member.addedAt || new Date().toLocaleDateString('pt-BR') };
    }
    await delay(450);
    const members = getStored<TeamMember[]>(STORAGE_KEYS.MEMBERS, initialMembers);
    const newMem: TeamMember = {
      id: `mem-${Date.now()}`,
      name,
      email,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role,
      status: 'invited',
      lastAccess: 'Convite pendente',
      addedAt: new Date().toLocaleDateString('pt-BR')
    };
    const updated = [newMem, ...members];
    setStored(STORAGE_KEYS.MEMBERS, updated);
    return newMem;
  },

  async removeMember(id: string): Promise<boolean> {
    if (isRealMode) { await realTeamService.removeMember(id); return true; }
    const members = getStored<TeamMember[]>(STORAGE_KEYS.MEMBERS, initialMembers);
    setStored(STORAGE_KEYS.MEMBERS, members.filter((member) => member.id !== id));
    return true;
  },

  // Realtime Connections
  async getRealtimeConnections(): Promise<RealtimeConnection[]> {
    await delay(250);
    return initialRealtimeConnections;
  }
};
