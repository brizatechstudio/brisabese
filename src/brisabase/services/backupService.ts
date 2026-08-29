import { BackupItem } from '../types';
import { INITIAL_BACKUPS } from '../mocks/mockBackups';

export interface BackupService {
  listBackups(): Promise<BackupItem[]>;
  createManualBackup(): Promise<BackupItem>;
  restoreBackup(backupId: string): Promise<{ success: boolean; message: string }>;
  deleteBackup(backupId: string): Promise<void>;
  previewRestore(backupId: string, options?: Record<string, unknown>): Promise<any>;
  verifyBackup(backupId: string): Promise<any>;
  exportBackup(backupId: string): Promise<Blob>;
  recoveryStatus(): Promise<any>;
  listSchedules(): Promise<any[]>;
  createSchedule(input: { expression: string; type?: string }): Promise<any>;
  updateSchedule(id: string, patch: { enabled?: boolean; expression?: string }): Promise<any>;
  deleteSchedule(id: string): Promise<void>;
}

export class MockBackupService implements BackupService {
  private backups: BackupItem[] = [...INITIAL_BACKUPS];

  async listBackups(): Promise<BackupItem[]> { return [...this.backups]; }

  async createManualBackup(): Promise<BackupItem> {
    const now = new Date();
    const id = `bak_${now.toISOString().replace(/[^0-9]/g, '').substring(0, 12)}`;
    const newBackup: BackupItem = {
      id,
      timestamp: now.toISOString().replace('T', ' ').substring(0, 19),
      sizeMb: 1850,
      type: 'manual',
      status: 'completed',
      downloadUrl: `https://cdn.brisabase.dev/backups/${id}.sql.gz`
    };
    this.backups.unshift(newBackup);
    return newBackup;
  }

  async restoreBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    const bak = this.backups.find((b) => b.id === backupId);
    if (!bak) throw new Error('Backup não encontrado');
    return { success: true, message: `Snapshot ${bak.id} restaurado com sucesso no ambiente atual.` };
  }

  async deleteBackup(backupId: string): Promise<void> { this.backups = this.backups.filter((b) => b.id !== backupId); }
  async previewRestore(backupId: string): Promise<any> { const backup = this.backups.find((item) => item.id === backupId); if (!backup) throw new Error('Backup não encontrado'); return { backupId, components: ['database', 'storage'], impact: { database: { tables: 'all' }, storage: { buckets: 'all' } } }; }
  async verifyBackup(backupId: string): Promise<any> { if (!this.backups.some((item) => item.id === backupId)) throw new Error('Backup não encontrado'); return { valid: true }; }
  async exportBackup(backupId: string): Promise<Blob> { if (!this.backups.some((item) => item.id === backupId)) throw new Error('Backup não encontrado'); return new Blob([`mock backup ${backupId}`], { type: 'application/octet-stream' }); }
  async recoveryStatus(): Promise<any> { return { backupEnabled: true, restoreCertified: false, pitr: { configured: false }, latestRecoveryDrill: null }; }
  async listSchedules(): Promise<any[]> { return []; }
  async createSchedule(input: any): Promise<any> { return { id: 'mock-schedule', enabled: true, ...input }; }
  async updateSchedule(id: string, patch: any): Promise<any> { return { id, ...patch }; }
  async deleteSchedule(_id: string): Promise<void> {}
}

export class ApiBackupService implements BackupService {
  private map(raw: any): BackupItem {
    return {
      id: raw.id,
      timestamp: raw.createdAt || raw.timestamp,
      sizeMb: Number(((raw.sizeBytes || 0) / (1024 * 1024)).toFixed(2)),
      type: raw.type || 'manual',
      status: raw.status || 'completed',
      integrity: raw.integrity,
      components: raw.components,
      downloadUrl: `/api/backups/${raw.id}/export`
    };
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message || `Backup request failed (${response.status}).`);
    return data as T;
  }

  async listBackups(): Promise<BackupItem[]> { const res = await this.request<any[]>('/api/backups'); return res.map((item) => this.map(item)); }
  async createManualBackup(): Promise<BackupItem> { const raw = await this.request('/api/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'full' }) }); return this.map(raw); }
  async restoreBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    const result = await this.request<any>(`/api/backups/${backupId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true })
    });
    return { success: true, message: `Backup restaurado: ${(result.components || []).join(', ') || 'componentes concluídos'}` };
  }
  async deleteBackup(backupId: string): Promise<void> { await this.request(`/api/backups/${backupId}`, { method: 'DELETE' }); }
  async previewRestore(backupId: string, _options: Record<string, unknown> = {}): Promise<any> { return this.request(`/api/backups/${backupId}/preview`, { method: 'GET' }); }
  async verifyBackup(backupId: string): Promise<any> { return this.request(`/api/backups/${backupId}/verify`); }
  async recoveryStatus(): Promise<any> { return this.request('/api/backups/recovery/status'); }
  async listSchedules(): Promise<any[]> { return this.request('/api/backups/schedules'); }
  async createSchedule(input: { expression: string; type?: string }): Promise<any> { return this.request('/api/backups/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  async updateSchedule(id: string, patch: { enabled?: boolean; expression?: string }): Promise<any> { return this.request(`/api/backups/schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }); }
  async deleteSchedule(id: string): Promise<void> { await this.request(`/api/backups/schedules/${id}`, { method: 'DELETE' }); }
  async exportBackup(backupId: string): Promise<Blob> {
    const response = await fetch(`/api/backups/${backupId}/export`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || `Backup export failed (${response.status}).`);
    }
    return response.blob();
  }
}

export const mockBackupService = new MockBackupService();
export const realBackupService = new ApiBackupService();
