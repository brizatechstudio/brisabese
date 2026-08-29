import { logger } from '../logger';

export interface RealtimeTableSettings {
  realtimeEnabled: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
}

export class RealtimePublicationManager {
  private tableSettings = new Map<string, RealtimeTableSettings>();

  private getKey(projectId: string, environmentId: string, tableName: string): string {
    return `${projectId}:${environmentId}:${tableName.toLowerCase()}`;
  }

  public getTableSettings(projectId: string, environmentId: string, tableName: string): RealtimeTableSettings {
    const key = this.getKey(projectId, environmentId, tableName);
    if (this.tableSettings.has(key)) {
      return this.tableSettings.get(key)!;
    }

    // Default: realtime enabled for all public tables
    const defaults: RealtimeTableSettings = {
      realtimeEnabled: true,
      insert: true,
      update: true,
      delete: true,
    };
    this.tableSettings.set(key, defaults);
    return defaults;
  }

  public setTableSettings(
    projectId: string,
    environmentId: string,
    tableName: string,
    settings: Partial<RealtimeTableSettings>
  ): RealtimeTableSettings {
    const current = this.getTableSettings(projectId, environmentId, tableName);
    const updated = { ...current, ...settings };
    this.tableSettings.set(this.getKey(projectId, environmentId, tableName), updated);
    return updated;
  }

  public isRealtimeEnabled(projectId: string, environmentId: string, tableName: string, operation: 'INSERT' | 'UPDATE' | 'DELETE'): boolean {
    const settings = this.getTableSettings(projectId, environmentId, tableName);
    if (!settings.realtimeEnabled) return false;
    if (operation === 'INSERT' && !settings.insert) return false;
    if (operation === 'UPDATE' && !settings.update) return false;
    if (operation === 'DELETE' && !settings.delete) return false;
    return true;
  }

  public listEnabledTables(projectId: string, environmentId: string): { tableName: string; settings: RealtimeTableSettings }[] {
    const result: { tableName: string; settings: RealtimeTableSettings }[] = [];
    for (const [key, settings] of this.tableSettings.entries()) {
      const [pId, eId, ...rest] = key.split(':');
      if (pId === projectId && eId === environmentId) {
        result.push({ tableName: rest.join(':'), settings });
      }
    }
    return result;
  }
}