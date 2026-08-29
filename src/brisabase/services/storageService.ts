import { StorageBucket, StorageFile } from '../types';
import { INITIAL_BUCKETS, INITIAL_FILES } from '../mocks/mockStorage';

export interface StorageUsage {
  totalFiles: number;
  totalBytes: number;
  bucketCount: number;
  uploadedBytes: number;
  downloadedBytes: number;
  uploadsCount: number;
  downloadsCount: number;
}

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface StorageService {
  listBuckets(): Promise<StorageBucket[]>;
  createBucket(name: string, isPublic?: boolean): Promise<StorageBucket>;
  updateBucket(bucketId: string, changes: Partial<Pick<StorageBucket,'isPublic'|'versioningEnabled'|'fileSizeLimitBytes'|'allowedMimeTypes'|'corsConfig'|'lifecycleRules'>>): Promise<StorageBucket>;
  deleteBucket(bucketId: string): Promise<void>;
  listFiles(bucketId: string, prefix?: string): Promise<StorageFile[]>;
  uploadFile(bucketId: string, file: File, options?: UploadOptions): Promise<StorageFile>;
  downloadFile(bucketId: string, fileId: string): Promise<Blob>;
  deleteFile(bucketId: string, fileId: string): Promise<void>;
  moveFile(bucketId: string, from: string, to: string): Promise<StorageFile>;
  copyFile(bucketId: string, from: string, to: string): Promise<StorageFile>;
  renameFile(bucketId: string, from: string, to: string): Promise<StorageFile>;
  createSignedUrl(bucketId: string, path: string, expiresIn: number): Promise<{ signedUrl: string; expiresAt: string }>;
  getUsage(): Promise<StorageUsage>;
}

function mockFile(bucketId: string, file: File): StorageFile {
  return {
    id: `file_${Math.random().toString(36).substring(2, 9)}`,
    bucketId,
    name: file.name,
    path: file.name,
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    publicUrl: `https://cdn.brisabase.dev/${bucketId}/${encodeURIComponent(file.name)}`,
    visibility: 'private',
  };
}

export class MockStorageService implements StorageService {
  private buckets: StorageBucket[] = JSON.parse(JSON.stringify(INITIAL_BUCKETS));
  private files: Record<string, StorageFile[]> = JSON.parse(JSON.stringify(INITIAL_FILES));

  async listBuckets(): Promise<StorageBucket[]> { return [...this.buckets]; }

  async createBucket(name: string, isPublic = false): Promise<StorageBucket> {
    const bucket: StorageBucket = { id: `bkt_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`, name: name.toLowerCase(), isPublic, fileCount: 0, sizeMb: 0, createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19) };
    this.buckets.unshift(bucket);
    this.files[bucket.id] = [];
    return bucket;
  }

  async updateBucket(bucketId: string, changes: Partial<Pick<StorageBucket,'isPublic'|'versioningEnabled'|'fileSizeLimitBytes'|'allowedMimeTypes'|'corsConfig'|'lifecycleRules'>>): Promise<StorageBucket> {
    const bucket=this.buckets.find((item)=>item.id===bucketId); if(!bucket) throw new Error('Bucket não encontrado.'); Object.assign(bucket,changes); return {...bucket};
  }

  async deleteBucket(bucketId: string): Promise<void> {
    this.buckets = this.buckets.filter((bucket) => bucket.id !== bucketId);
    delete this.files[bucketId];
  }

  async listFiles(bucketId: string, prefix = ''): Promise<StorageFile[]> {
    return (this.files[bucketId] || []).filter((file) => !prefix || (file.path || file.name).startsWith(prefix));
  }

  async uploadFile(bucketId: string, file: File, options: UploadOptions = {}): Promise<StorageFile> {
    if (options.signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
    options.onProgress?.(25);
    await Promise.resolve();
    options.onProgress?.(75);
    const uploaded = mockFile(bucketId, file);
    this.files[bucketId] = [uploaded, ...(this.files[bucketId] || [])];
    const bucket = this.buckets.find((item) => item.id === bucketId);
    if (bucket) { bucket.fileCount += 1; bucket.sizeMb += file.size / (1024 * 1024); }
    options.onProgress?.(100);
    return uploaded;
  }

  async downloadFile(bucketId: string, fileId: string): Promise<Blob> {
    const file = (this.files[bucketId] || []).find((item) => item.id === fileId);
    if (!file) throw new Error('Arquivo não encontrado.');
    return new Blob([`Mock content for ${file.name}`], { type: file.mimeType });
  }

  async deleteFile(bucketId: string, fileId: string): Promise<void> {
    const existing = (this.files[bucketId] || []).find((file) => file.id === fileId);
    this.files[bucketId] = (this.files[bucketId] || []).filter((file) => file.id !== fileId);
    const bucket = this.buckets.find((item) => item.id === bucketId);
    if (bucket && existing) { bucket.fileCount = Math.max(0, bucket.fileCount - 1); bucket.sizeMb = Math.max(0, bucket.sizeMb - existing.sizeBytes / (1024 * 1024)); }
  }

  async moveFile(bucketId: string, from: string, to: string): Promise<StorageFile> {
    const file = (this.files[bucketId] || []).find((item) => (item.path || item.name) === from);
    if (!file) throw new Error('Arquivo não encontrado.');
    file.path = to; file.name = to.split('/').pop() || to; file.updatedAt = new Date().toISOString();
    return file;
  }

  async copyFile(bucketId: string, from: string, to: string): Promise<StorageFile> {
    const source = (this.files[bucketId] || []).find((item) => (item.path || item.name) === from);
    if (!source) throw new Error('Arquivo não encontrado.');
    const copy = { ...source, id: `file_${Math.random().toString(36).slice(2, 9)}`, path: to, name: to.split('/').pop() || to, updatedAt: new Date().toISOString() };
    this.files[bucketId] = [copy, ...(this.files[bucketId] || [])];
    return copy;
  }

  async renameFile(bucketId: string, from: string, to: string): Promise<StorageFile> { return this.moveFile(bucketId, from, to); }
  async createSignedUrl(bucketId: string, path: string, expiresIn: number): Promise<{ signedUrl: string; expiresAt: string }> { return { signedUrl: `https://cdn.brisabase.dev/${bucketId}/${path}?mockSigned=true`, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() }; }
  async getUsage(): Promise<StorageUsage> {
    const files = Object.values(this.files).flat();
    return { totalFiles: files.length, totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0), bucketCount: this.buckets.length, uploadedBytes: 0, downloadedBytes: 0, uploadsCount: 0, downloadsCount: 0 };
  }
}

export class ApiStorageService implements StorageService {
  private bucketNames = new Map<string, string>();

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(body?.error?.message || `Storage request failed (${response.status}).`), { code: body?.error?.code, status: response.status });
    return body as T;
  }

  private bucketName(bucketId: string): string { return this.bucketNames.get(bucketId) || bucketId; }
  private mapBucket(raw: any): StorageBucket {
    const bucket = { id: raw.id, name: raw.name, isPublic: raw.isPublic, fileCount: raw.fileCount || 0, sizeMb: (raw.sizeBytes || 0) / (1024 * 1024), allowedMimeTypes: raw.allowedMimeTypes, versioningEnabled: raw.versioningEnabled, fileSizeLimitBytes: raw.fileSizeLimit, corsConfig: raw.corsConfig || [], lifecycleRules: raw.lifecycleRules || [], createdAt: raw.createdAt };
    this.bucketNames.set(bucket.id, bucket.name);
    return bucket;
  }
  private mapFile(raw: any, bucketId: string, bucketName: string, isPublic = false): StorageFile {
    const path = raw.path || raw.name;
    const projectId = window.localStorage.getItem('brisabase.projectId') || '';
    const environmentId = window.localStorage.getItem('brisabase.environmentId') || '';
    if (!projectId || !environmentId) throw new Error('Nenhum projeto e ambiente ativos foram selecionados.');
    return { id: raw.id, bucketId, name: raw.name, path, sizeBytes: raw.size, mimeType: raw.mimeType, updatedAt: raw.updatedAt, publicUrl: isPublic ? `/storage/v1/object/public/${encodeURIComponent(bucketName)}/${path.split('/').map(encodeURIComponent).join('/')}?project=${encodeURIComponent(projectId)}&environment=${encodeURIComponent(environmentId)}` : `/api/storage/buckets/${encodeURIComponent(bucketName)}/download/${path.split('/').map(encodeURIComponent).join('/')}`, visibility: isPublic ? 'public' : 'private', etag: raw.etag, checksum: raw.checksum, metadata: raw.metadata, version: raw.version };
  }

  async listBuckets(): Promise<StorageBucket[]> {
    const res = await this.request<any[]>('/api/storage/buckets');
    return res.map((item) => this.mapBucket(item));
  }
  async createBucket(name: string, isPublic = false): Promise<StorageBucket> {
    const raw = await this.request('/api/storage/buckets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, isPublic }) });
    return this.mapBucket(raw);
  }
  async updateBucket(bucketId: string, changes: Partial<Pick<StorageBucket,'isPublic'|'versioningEnabled'|'fileSizeLimitBytes'|'allowedMimeTypes'|'corsConfig'|'lifecycleRules'>>): Promise<StorageBucket> {
    const raw=await this.request(`/api/storage/buckets/${encodeURIComponent(this.bucketName(bucketId))}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isPublic:changes.isPublic,versioningEnabled:changes.versioningEnabled,fileSizeLimit:changes.fileSizeLimitBytes,allowedMimeTypes:changes.allowedMimeTypes,corsConfig:changes.corsConfig,lifecycleRules:changes.lifecycleRules})});
    return this.mapBucket(raw);
  }
  async deleteBucket(bucketId: string): Promise<void> {
    await this.request(`/api/storage/buckets/${encodeURIComponent(this.bucketName(bucketId))}`, { method: 'DELETE' });
  }
  async listFiles(bucketId: string, prefix = ''): Promise<StorageFile[]> {
    const bucketName = this.bucketName(bucketId);
    const bucket = (await this.listBuckets()).find((item) => item.id === bucketId);
    const response = await this.request<{ objects: any[] }>(`/api/storage/buckets/${encodeURIComponent(bucketName)}/objects?${new URLSearchParams(prefix ? { prefix } : {})}`);
    return response.objects.map((item) => this.mapFile(item, bucketId, bucketName, Boolean(bucket?.isPublic)));
  }
  async uploadFile(bucketId: string, file: File, options: UploadOptions = {}): Promise<StorageFile> {
    const bucketName = this.bucketName(bucketId);
    let raw:any;
    if (file.size > 16 * 1024 * 1024) {
      const upload = await this.request<any>(`/api/storage/buckets/${encodeURIComponent(bucketName)}/multipart`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ path:file.name, mimeType:file.type || 'application/octet-stream', metadata:options.metadata }) });
      const partSize = 8 * 1024 * 1024;
      try {
        for (let offset=0,part=1; offset<file.size; offset+=partSize,part+=1) {
          if (options.signal?.aborted) throw new DOMException('Upload cancelled.','AbortError');
          const chunk=file.slice(offset,Math.min(offset+partSize,file.size));
          await this.request(`/api/storage/multipart/${encodeURIComponent(upload.id)}/parts/${part}`, { method:'PUT', headers:{'Content-Type':'application/octet-stream'}, body:chunk, signal:options.signal });
          options.onProgress?.(Math.min(95,Math.round((Math.min(offset+partSize,file.size)/file.size)*95)));
        }
        raw=await this.request(`/api/storage/multipart/${encodeURIComponent(upload.id)}/complete`,{method:'POST'});
      } catch (error) {
        await fetch(`/api/storage/multipart/${encodeURIComponent(upload.id)}`,{method:'DELETE'}).catch(()=>undefined);
        throw error;
      }
    } else {
      options.onProgress?.(5);
      raw = await this.request<any>(`/api/storage/buckets/${encodeURIComponent(bucketName)}/upload`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-storage-path': file.name, ...(options.metadata ? { 'x-storage-metadata': JSON.stringify(options.metadata) } : {}) }, body: file, signal: options.signal });
    }
    options.onProgress?.(100);
    const bucket = (await this.listBuckets()).find((item) => item.id === bucketId);
    return this.mapFile(raw, bucketId, bucketName, Boolean(bucket?.isPublic));
  }
  async downloadFile(bucketId: string, fileId: string): Promise<Blob> {
    const file = (await this.listFiles(bucketId)).find((item) => item.id === fileId);
    if (!file) throw new Error('Arquivo não encontrado.');
    const response = await fetch(file.publicUrl);
    if (!response.ok) throw new Error('Não foi possível baixar o arquivo.');
    return response.blob();
  }
  async deleteFile(bucketId: string, fileId: string): Promise<void> {
    const file = (await this.listFiles(bucketId)).find((item) => item.id === fileId);
    if (!file) throw new Error('Arquivo não encontrado.');
    const objectPath = file.path || file.name;
    await this.request(`/api/storage/buckets/${encodeURIComponent(this.bucketName(bucketId))}/objects/${objectPath.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' });
  }
  private async transform(bucketId: string, operation: 'move' | 'copy', from: string, to: string): Promise<StorageFile> {
    const bucketName = this.bucketName(bucketId);
    const raw = await this.request<any>(`/api/storage/buckets/${encodeURIComponent(bucketName)}/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to }) });
    const bucket = (await this.listBuckets()).find((item) => item.id === bucketId);
    return this.mapFile(raw, bucketId, bucketName, Boolean(bucket?.isPublic));
  }
  async moveFile(bucketId: string, from: string, to: string): Promise<StorageFile> { return this.transform(bucketId, 'move', from, to); }
  async copyFile(bucketId: string, from: string, to: string): Promise<StorageFile> { return this.transform(bucketId, 'copy', from, to); }
  async renameFile(bucketId: string, from: string, to: string): Promise<StorageFile> { return this.moveFile(bucketId, from, to); }
  async createSignedUrl(bucketId: string, path: string, expiresIn: number): Promise<{ signedUrl: string; expiresAt: string }> {
    return this.request('/api/storage/signed-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket: this.bucketName(bucketId), path, expiresIn }) });
  }
  async getUsage(): Promise<StorageUsage> {
    return await this.request('/api/storage/usage');
  }
}

export const mockStorageService = new MockStorageService();
export const realStorageService = new ApiStorageService();
