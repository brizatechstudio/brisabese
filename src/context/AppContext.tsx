import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Project, NotificationItem, AuthUser } from '../types';
import { mockApi } from '../services/mockApi';
import {
  adminAuthService,
  clearRealScope,
  configureRealProjectScope,
  isRealMode,
  mapRealProject,
  realProjectService,
} from '../services/runtime';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface AppContextType {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (project: Project) => void;
  /** BrisaBase compatibility aliases used by migrated real views. */
  selectProject: (projectId: string) => void;
  createProject: (project: { name: string; description?: string; region?: string; environment?: 'production' | 'development' | 'staging' }) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
  language: 'pt-BR' | 'en-US';
  setLanguage: (language: 'pt-BR' | 'en-US') => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  currentUser: AuthUser;
  isAuthenticated: boolean;
  authReady: boolean;
  refreshSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  runtimeMode: 'real' | 'mock';
  runtimeError: string | null;
  activeOrganizationId: string;
  activeProjectId: string | null;
  activeEnvironmentId: string;
  currentProject: Project | null;
  environment: Project['category'];
  setEnvironment: (environment: Project['category']) => Promise<void>;
  isLoadingProjects: boolean;
  addToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  markAllNotificationsAsRead: () => void;
  toasts: ToastItem[];
  showToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isGlobalSearchOpen: boolean;
  setGlobalSearchOpen: (open: boolean) => void;
  isMobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
}

const defaultUser: AuthUser = {
  id: 'user-admin',
  uid: 'usr_local_admin',
  name: 'Administrador BrisaBase',
  email: 'admin@brisabase.local',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  provider: 'email',
  role: 'Admin',
  status: 'active',
  createdAt: '27/08/2026',
  lastLogin: 'Agora mesmo',
  sessionsCount: 1,
  location: 'Ambiente local'
};

const AppContext = createContext<AppContextType | undefined>(undefined);

function mapAdminUser(user: ReturnType<typeof adminAuthService.getUser>): AuthUser {
  if (!user) return defaultUser;
  const role: AuthUser['role'] = user.role === 'owner'
    ? 'Owner'
    : user.role === 'admin'
      ? 'Admin'
      : user.role === 'developer'
        ? 'Developer'
        : 'Viewer';
  return {
    id: user.id,
    uid: user.id,
    name: user.name || user.email.split('@')[0],
    email: user.email,
    avatar: user.avatar_url || defaultUser.avatar,
    provider: 'email',
    role,
    status: user.status === 'blocked' ? 'blocked' : user.status === 'inactive' ? 'inactive' : 'active',
    createdAt: user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—',
    lastLogin: user.last_login_at ? new Date(user.last_login_at).toLocaleString('pt-BR') : 'Agora mesmo',
    sessionsCount: 1,
    location: 'Runtime local'
  };
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [language, setLanguageState] = useState<'pt-BR' | 'en-US'>('pt-BR');
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser>(defaultUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  const showToast = useCallback((
    title: string,
    description?: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'success'
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, description, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  const applyProjectSelection = useCallback(async (projs: Project[], requestedId?: string | null) => {
    const matched = projs.find((p) => p.id === requestedId) || projs[0] || null;
    if (matched && isRealMode) {
      try {
        await configureRealProjectScope(matched);
      } catch (error) {
        setRuntimeError(error instanceof Error ? error.message : 'Falha ao selecionar o ambiente real do projeto.');
      }
    }
    setActiveProjectState(matched);
    if (matched) localStorage.setItem('brisabase_active_project_id', matched.id);
    return matched;
  }, []);

  const refreshProjects = useCallback(async () => {
    if (isRealMode) {
      if (!adminAuthService.isAuthenticated()) {
        setProjects([]);
        setActiveProjectState(null);
        return;
      }
      const realProjects = await realProjectService.listProjects();
      const mapped = realProjects.map(mapRealProject);
      setProjects(mapped);
      const savedId = activeProject?.id || localStorage.getItem('brisabase_active_project_id');
      await applyProjectSelection(mapped, savedId);
      return;
    }

    const projs = await mockApi.getProjects();
    setProjects(projs);
    const savedId = activeProject?.id || localStorage.getItem('brisabase_active_project_id');
    await applyProjectSelection(projs, savedId);
  }, [activeProject?.id, applyProjectSelection]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    setRuntimeError(null);
    if (isRealMode) {
      const user = await adminAuthService.me();
      const authenticated = Boolean(user);
      setIsAuthenticated(authenticated);
      setCurrentUser(mapAdminUser(user));
      if (authenticated) {
        try {
          const realProjects = await realProjectService.listProjects();
          const mapped = realProjects.map(mapRealProject);
          setProjects(mapped);
          await applyProjectSelection(mapped, localStorage.getItem('brisabase_active_project_id'));
        } catch (error) {
          setRuntimeError(error instanceof Error ? error.message : 'Falha ao carregar projetos do runtime real.');
        }
      } else {
        setProjects([]);
        setActiveProjectState(null);
        clearRealScope();
      }
      return authenticated;
    }

    const authenticated = Boolean(localStorage.getItem('brisabase_mock_session'));
    setIsAuthenticated(authenticated);
    return authenticated;
  }, [applyProjectSelection]);

  const loadData = useCallback(async () => {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
    localStorage.removeItem('brisabase_theme');
    localStorage.removeItem('brisabase_theme_v1');

    const savedLanguage = (localStorage.getItem('brisabase_language') as 'pt-BR' | 'en-US') || 'pt-BR';
    setLanguageState(savedLanguage);
    document.documentElement.lang = savedLanguage === 'en-US' ? 'en' : 'pt-BR';

    const savedSidebar = localStorage.getItem('brisabase_sidebar_collapsed') === 'true';
    setSidebarCollapsedState(savedSidebar);

    try {
      const notifs = await mockApi.getNotifications();
      setNotifications(notifs);
      await refreshSession();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Runtime BrisaBase indisponível.');
      setIsAuthenticated(!isRealMode && Boolean(localStorage.getItem('brisabase_mock_session')));
    } finally {
      setAuthReady(true);
    }
  }, [refreshSession]);

  useEffect(() => {
    void loadData();

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadData]);

  const setActiveProject = (proj: Project) => {
    setActiveProjectState(proj);
    localStorage.setItem('brisabase_active_project_id', proj.id);
    if (isRealMode) {
      void configureRealProjectScope(proj).catch((error) => {
        setRuntimeError(error instanceof Error ? error.message : 'Falha ao alterar escopo do projeto.');
        showToast('Falha ao trocar projeto', error instanceof Error ? error.message : undefined, 'error');
      });
    }
    showToast('Projeto Ativo Alterado', `Agora você está gerenciando ${proj.name}`, 'info');
  };


  const selectProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (project) setActiveProject(project);
  };

  const setEnvironment = async (nextEnvironment: Project['category']): Promise<void> => {
    if (!activeProject || activeProject.category === nextEnvironment) return;
    try {
      const updated = await mockApi.updateProject(activeProject.id, {
        category: nextEnvironment,
        environment: nextEnvironment
      });
      setProjects((prev) => prev.map((project) => project.id === updated.id ? updated : project));
      setActiveProjectState(updated);
      localStorage.setItem('brisabase_active_project_id', updated.id);
      if (isRealMode) await configureRealProjectScope(updated);
      showToast('Ambiente alterado', `Ambiente ativo: ${nextEnvironment}`, 'info');
    } catch (error) {
      const description = error instanceof Error ? error.message : 'Não foi possível alterar o ambiente.';
      setRuntimeError(description);
      showToast('Falha ao alterar ambiente', description, 'error');
    }
  };

  const createProject = async (project: { name: string; description?: string; region?: string; environment?: 'production' | 'development' | 'staging' }): Promise<Project> => {
    const created = await mockApi.createProject({
      name: project.name,
      description: project.description,
      region: project.region,
      category: project.environment || 'development'
    });
    await refreshProjects();
    return created;
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    await mockApi.deleteProject(projectId);
    await refreshProjects();
  };

  const logout = useCallback(async () => {
    if (isRealMode) {
      await adminAuthService.logout();
      clearRealScope();
    } else {
      localStorage.removeItem('brisabase_mock_session');
    }
    setIsAuthenticated(false);
    setProjects([]);
    setActiveProjectState(null);
    setCurrentUser(defaultUser);
  }, []);

  const setLanguage = (nextLanguage: 'pt-BR' | 'en-US') => {
    setLanguageState(nextLanguage);
    localStorage.setItem('brisabase_language', nextLanguage);
    document.documentElement.lang = nextLanguage === 'en-US' ? 'en' : 'pt-BR';
    showToast(
      nextLanguage === 'en-US' ? 'Language updated' : 'Idioma atualizado',
      nextLanguage === 'en-US' ? 'Interface language set to English.' : 'Idioma da interface definido como Português.',
      'success'
    );
  };

  const setSidebarCollapsed = (value: boolean | ((prev: boolean) => boolean)) => {
    setSidebarCollapsedState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      localStorage.setItem('brisabase_sidebar_collapsed', String(next));
      return next;
    });
  };

  const markNotificationAsRead = (notificationId: string) => {
    setNotifications((prev) => prev.map((notification) =>
      notification.id === notificationId ? { ...notification, read: true } : notification
    ));
  };

  const markAllNotificationsRead = async () => {
    await mockApi.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast('Notificações', 'Todas as notificações foram marcadas como lidas', 'success');
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  return (
    <AppContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject,
        selectProject,
        createProject,
        deleteProject,
        refreshProjects,
        language,
        setLanguage,
        sidebarCollapsed,
        setSidebarCollapsed,
        currentUser,
        isAuthenticated,
        authReady,
        refreshSession,
        logout,
        runtimeMode: isRealMode ? 'real' : 'mock',
        runtimeError,
        activeOrganizationId: isRealMode ? (localStorage.getItem('brisabase.organizationId') || activeProject?.organizationId || '') : 'org_mock',
        activeProjectId: activeProject?.id || null,
        activeEnvironmentId: isRealMode ? (localStorage.getItem('brisabase.environmentId') || activeProject?.environmentId || '') : 'env_mock',
        currentProject: activeProject,
        environment: activeProject?.category || 'development',
        setEnvironment,
        isLoadingProjects: !authReady,
        addToast: showToast,
        notifications,
        unreadNotificationsCount,
        markNotificationAsRead,
        markAllNotificationsRead,
        markAllNotificationsAsRead: markAllNotificationsRead,
        toasts,
        showToast,
        removeToast,
        isSearchOpen,
        setIsSearchOpen,
        isGlobalSearchOpen: isSearchOpen,
        setGlobalSearchOpen: setIsSearchOpen,
        isMobileSidebarOpen,
        setMobileSidebarOpen
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
