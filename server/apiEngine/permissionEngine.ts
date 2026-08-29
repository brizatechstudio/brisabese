export interface TableApiPermissions {
  apiEnabled: boolean;
  publicRead: boolean;
  publicInsert: boolean;
  authenticatedRead: boolean;
  authenticatedInsert: boolean;
  authenticatedUpdate: boolean;
  authenticatedDelete: boolean;
}

export type CallerRole = 'anonymous' | 'authenticated' | 'service' | 'admin';
export type ApiAction = 'READ' | 'INSERT' | 'UPDATE' | 'DELETE';

export class ApiPermissionEngine {
  private static permissionsMap = new Map<string, TableApiPermissions>();

  private static getStoreKey(projId: string, envId: string, tableName: string): string {
    return `${projId}:${envId}:${tableName.toLowerCase()}`;
  }

  public static getPermissions(projId: string, envId: string, tableName: string): TableApiPermissions {
    const key = this.getStoreKey(projId, envId, tableName);
    if (this.permissionsMap.has(key)) {
      return this.permissionsMap.get(key)!;
    }

    // Default permissions: API enabled, Public read allowed, Authenticated read/insert/update/delete allowed
    const defaultPerms: TableApiPermissions = {
      apiEnabled: true,
      publicRead: true,
      publicInsert: false,
      authenticatedRead: true,
      authenticatedInsert: true,
      authenticatedUpdate: true,
      authenticatedDelete: true,
    };

    this.permissionsMap.set(key, defaultPerms);
    return defaultPerms;
  }

  public static setPermissions(projId: string, envId: string, tableName: string, perms: Partial<TableApiPermissions>): TableApiPermissions {
    const current = this.getPermissions(projId, envId, tableName);
    const updated = { ...current, ...perms };
    const key = this.getStoreKey(projId, envId, tableName);
    this.permissionsMap.set(key, updated);
    return updated;
  }

  public static canExecute(
    projId: string,
    envId: string,
    tableName: string,
    role: CallerRole,
    action: ApiAction
  ): { allowed: boolean; reason?: string } {
    const perms = this.getPermissions(projId, envId, tableName);

    if (!perms.apiEnabled) {
      return { allowed: false, reason: `API desativada para a tabela '${tableName}'.` };
    }

    // Service & Admin roles always have full permissions
    if (role === 'service' || role === 'admin') {
      return { allowed: true };
    }

    if (role === 'anonymous') {
      if (action === 'READ' && perms.publicRead) return { allowed: true };
      if (action === 'INSERT' && perms.publicInsert) return { allowed: true };
      return { allowed: false, reason: `Operação '${action}' não permitida para acessos anônimos/públicos.` };
    }

    if (role === 'authenticated') {
      if (action === 'READ' && perms.authenticatedRead) return { allowed: true };
      if (action === 'INSERT' && perms.authenticatedInsert) return { allowed: true };
      if (action === 'UPDATE' && perms.authenticatedUpdate) return { allowed: true };
      if (action === 'DELETE' && perms.authenticatedDelete) return { allowed: true };
      return { allowed: false, reason: `Operação '${action}' restrita para usuários autenticados.` };
    }

    return { allowed: false, reason: 'Acesso não autorizado.' };
  }
}
