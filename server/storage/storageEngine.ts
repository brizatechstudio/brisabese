import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '../logger';
import { db } from '../db/database';
import { StorageAdapter } from './storageAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import { S3StorageAdapter } from './s3StorageAdapter';
import { StoragePermissionEngine, StoragePolicyContext } from './permissionEngine';
import { StoragePathUtils } from './pathUtils';
import { StorageBucketDef, StorageImageTransformOptions, StorageListOptions, StorageListResult, StorageMultipartUploadDef, StorageObjectDef, StorageObjectVersionDef, StorageOpContext, StorageUploadOptions, StorageUsageDef, StorageProvider } from './types';
import { realtimeEngine } from '../realtime/realtimeEngine';
import { config } from '../config';
import { observability } from '../observability';

export class StorageEngine {
  private static instance: StorageEngine | null = null;
  private adapter: StorageAdapter;
  private provider: StorageProvider;

  private buckets = new Map<string, StorageBucketDef>(); // id -> bucket
  private objects = new Map<string, StorageObjectDef>(); // id -> object
  private objectVersions = new Map<string, StorageObjectVersionDef[]>(); // object id -> previous immutable versions
  private usageMap = new Map<string, Pick<StorageUsageDef, 'downloadedBytes' | 'downloadsCount' | 'uploadedBytes' | 'uploadsCount'>>();
  private multipartUploads = new Map<string, { upload: StorageMultipartUploadDef; context: StorageOpContext; bucketName: string; options: StorageUploadOptions; parts: Map<number, Buffer> }>();

  private constructor() {
    const provider = (config.storage.provider || 'minio').toLowerCase() as StorageProvider;
    if (!['s3', 'minio', 'r2', 'local'].includes(provider)) throw new Error(`[BRISABASE STORAGE ERROR] Unsupported storage provider: ${provider}`);
    if (provider === 'local' && !config.testMode) throw new Error('[BRISABASE STORAGE ERROR] Local filesystem storage is test-only. Configure MinIO/S3/R2.');
    this.provider = provider;
    this.adapter = this.provider === 'local'
      ? new LocalStorageAdapter(config.storage.localDir)
      : new S3StorageAdapter({
          endpoint: config.storage.s3Endpoint,
          region: config.storage.s3Region,
          bucket: config.storage.s3Bucket,
          accessKey: config.storage.s3AccessKey,
          secretKey: config.storage.s3SecretKey,
        });
    logger.info(`Storage Engine initialized with provider: ${provider}`);
    if (config.testMode) this.seedDefaultBuckets();
  }

  public static getInstance(): StorageEngine {
    if (!StorageEngine.instance) {
      StorageEngine.instance = new StorageEngine();
    }
    return StorageEngine.instance;
  }

  private seedDefaultBuckets(): void {
    // Seed buckets for default projects
    const projects = db.getProjects();
    for (const proj of projects) {
      const envs = db.getEnvironmentsByProject(proj.id);
      for (const env of envs) {
        this.createBucketInternal({
          name: 'private',
          projectId: proj.id,
          environmentId: env.id,
          isPublic: false,
          createdBy: 'system',
        });
      }
    }
  }

  public async getHealth(): Promise<{ status: string; provider: string; database: boolean; storage: boolean }> {
    const storageHealth = await this.adapter.getHealth();
    return {
      status: storageHealth.status === 'ok' ? 'ok' : 'degraded',
      provider: this.provider,
      database: true,
      storage: storageHealth.status === 'ok',
    };
  }

  private createBucketInternal(data: {
    name: string;
    projectId: string;
    environmentId: string;
    isPublic: boolean;
    fileSizeLimit?: number;
    allowedMimeTypes?: string[];
    versioningEnabled?: boolean;
    createdBy?: string;
  }): StorageBucketDef {
    if (!StoragePathUtils.isValidBucketName(data.name)) {
      throw new Error(`Nome de bucket inválido: '${data.name}'.`);
    }

    const existing = Array.from(this.buckets.values()).find(
      (b) => b.projectId === data.projectId && b.environmentId === data.environmentId && b.name === data.name
    );
    if (existing) return existing;

    const now = new Date().toISOString();
    const bucket: StorageBucketDef = {
      id: `bkt_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
      name: data.name.toLowerCase(),
      projectId: data.projectId,
      environmentId: data.environmentId,
      isPublic: data.isPublic,
      fileSizeLimit: data.fileSizeLimit || 100 * 1024 * 1024, // 100MB default
      allowedMimeTypes: data.allowedMimeTypes,
      versioningEnabled: data.versioningEnabled ?? false,
      fileCount: 0,
      sizeBytes: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: data.createdBy,
    };
    this.buckets.set(bucket.id, bucket);
    return bucket;
  }

  private getBucket(projectId: string, environmentId: string, bucketName: string): StorageBucketDef | null {
    const name = bucketName.toLowerCase();
    return (
      Array.from(this.buckets.values()).find(
        (b) => b.projectId === projectId && b.environmentId === environmentId && b.name === name
      ) || null
    );
  }

  private buildStorageKey(projectId: string, environmentId: string, bucketId: string, objectId: string): string {
    return `${projectId}/${environmentId}/${bucketId}/${objectId}`;
  }

  /** Serializes storage metadata and object bytes for the encrypted Backup Engine. */
  public async exportBackupState(projectId: string, environmentId: string, options: { bucketName?: string } = {}): Promise<Record<string, unknown>> {
    const buckets = Array.from(this.buckets.values()).filter((bucket) => bucket.projectId === projectId && bucket.environmentId === environmentId && (!options.bucketName || bucket.name === options.bucketName));
    const bucketIds = new Set(buckets.map((bucket) => bucket.id));
    const objects = Array.from(this.objects.values()).filter((object) => bucketIds.has(object.bucketId));
    const versions = Array.from(this.objectVersions.entries()).filter(([objectId]) => objects.some((object) => object.id === objectId));
    const contentKeys = new Map<string, string>();
    for (const object of objects) { const content = await this.adapter.getObject(object.storageKey); if (content) contentKeys.set(object.storageKey, content.toString('base64')); }
    for (const [, entries] of versions) for (const version of entries) { const content = await this.adapter.getObject(version.storageKey); if (content) contentKeys.set(version.storageKey, content.toString('base64')); }
    const policies = buckets.map((bucket) => [bucket.name, StoragePermissionEngine.getPolicies(projectId, environmentId, bucket.name)]);
    return JSON.parse(JSON.stringify({ buckets, objects, versions, contents: Array.from(contentKeys.entries()), policies }));
  }

  public async restoreBackupState(ctx: StorageOpContext, state: any, options: { bucketName?: string } = {}): Promise<void> {
    if (!state || !Array.isArray(state.buckets) || !Array.isArray(state.objects)) throw new Error('Invalid storage backup state.');
    const sourceBuckets = state.buckets.filter((bucket: StorageBucketDef) => bucket.projectId === ctx.projectId && bucket.environmentId === ctx.environmentId && (!options.bucketName || bucket.name === options.bucketName));
    if (options.bucketName && sourceBuckets.length === 0) throw new Error(`Bucket '${options.bucketName}' is not present in the backup.`);
    const sourceIds = new Set(sourceBuckets.map((bucket: StorageBucketDef) => bucket.id));
    const targetBuckets = Array.from(this.buckets.values()).filter((bucket) => bucket.projectId === ctx.projectId && bucket.environmentId === ctx.environmentId && (!options.bucketName || bucket.name === options.bucketName));
    const targetIds = new Set(targetBuckets.map((bucket) => bucket.id));
    for (const [id, object] of this.objects) if (targetIds.has(object.bucketId)) { await this.adapter.deleteObject(object.storageKey); this.objects.delete(id); this.objectVersions.delete(id); }
    for (const bucket of targetBuckets) this.buckets.delete(bucket.id);
    for (const bucket of sourceBuckets) this.buckets.set(bucket.id, JSON.parse(JSON.stringify(bucket)));
    for (const object of state.objects.filter((item: StorageObjectDef) => sourceIds.has(item.bucketId))) this.objects.set(object.id, JSON.parse(JSON.stringify(object)));
    for (const [objectId, versions] of state.versions || []) if (state.objects.some((object: StorageObjectDef) => object.id === objectId && sourceIds.has(object.bucketId))) this.objectVersions.set(objectId, JSON.parse(JSON.stringify(versions)));
    const contents = new Map<string, string>(state.contents || []);
    const stored = [...state.objects.filter((item: StorageObjectDef) => sourceIds.has(item.bucketId)), ...Array.from(this.objectVersions.values()).flat().filter((item) => sourceIds.has(item.bucketId))];
    for (const object of stored) { const data = contents.get(object.storageKey); if (data) await this.adapter.putObject(object.storageKey, Buffer.from(data, 'base64'), object.mimeType); }
    for (const [bucketName, policies] of state.policies || []) if (!options.bucketName || bucketName === options.bucketName) StoragePermissionEngine.restorePolicies(ctx.projectId, ctx.environmentId, bucketName, policies);
  }

  private buildVersionStorageKey(projectId: string, environmentId: string, bucketId: string, objectId: string, version: number): string {
    return `${this.buildStorageKey(projectId, environmentId, bucketId, objectId)}/v${version}`;
  }

  private buildThumbnailStorageKey(storageKey: string, width: number): string {
    return `${storageKey}.thumbnail-${width}.webp`;
  }

  private findObject(bucketId: string, objectPath: string): StorageObjectDef | null {
    return Array.from(this.objects.values()).find((object) => object.bucketId === bucketId && object.path === objectPath && !object.deletedAt) || null;
  }

  private findDeletedObject(bucketId: string, objectPath: string): StorageObjectDef | null {
    return Array.from(this.objects.values()).find((object) => object.bucketId === bucketId && object.path === objectPath && !!object.deletedAt) || null;
  }

  private createVersionSnapshot(object: StorageObjectDef): StorageObjectVersionDef {
    return {
      id: `objv_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      objectId: object.id,
      bucketId: object.bucketId,
      projectId: object.projectId,
      environmentId: object.environmentId,
      path: object.path,
      version: object.version,
      storageKey: object.storageKey,
      size: object.size,
      mimeType: object.mimeType,
      etag: object.etag,
      checksum: object.checksum,
      metadata: structuredClone(object.metadata),
      createdAt: object.updatedAt,
      createdBy: object.updatedBy || object.createdBy,
    };
  }

  private savePreviousVersion(object: StorageObjectDef): void {
    const versions = this.objectVersions.get(object.id) || [];
    versions.unshift(this.createVersionSnapshot(object));
    this.objectVersions.set(object.id, versions);
  }

  private async enrichMetadata(metadata: Record<string, unknown>, data: Buffer, mimeType: string): Promise<Record<string, unknown>> {
    const enriched: Record<string, unknown> = {
      ...metadata,
      contentType: mimeType,
      size: data.length,
      checksum: createHash('sha256').update(data).digest('hex'),
    };
    if (!mimeType.startsWith('image/')) return enriched;
    try {
      const image = await sharp(data, { animated: false, failOn: 'none' }).metadata();
      if (image.width) enriched.width = image.width;
      if (image.height) enriched.height = image.height;
      if (image.format) enriched.imageFormat = image.format;
      if (image.orientation) enriched.orientation = image.orientation;
    } catch {
      // MIME validation still protects the upload; metadata extraction is best effort.
    }
    return enriched;
  }

  /** Generates provider-backed derivatives while retaining only safe display metadata on the object. */
  private async generateThumbnails(storageKey: string, data: Buffer, mimeType: string): Promise<Record<string, { width?: number; height?: number; format: 'webp'; size: number }>> {
    if (!mimeType.startsWith('image/')) return {};
    const thumbnails: Record<string, { width?: number; height?: number; format: 'webp'; size: number }> = {};
    for (const width of [128, 256, 512, 1024]) {
      try {
        const output = await sharp(data, { animated: false, failOn: 'none' })
          .resize({ width, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        await this.adapter.putObject(this.buildThumbnailStorageKey(storageKey, width), output.data, 'image/webp');
        thumbnails[String(width)] = { width: output.info.width, height: output.info.height, format: 'webp', size: output.data.length };
      } catch {
        // Invalid/unsupported images still retain the original; thumbnailing is best effort.
      }
    }
    return thumbnails;
  }

  private async deleteDerivedAssets(object: Pick<StorageObjectDef, 'storageKey' | 'metadata'>): Promise<void> {
    const thumbnails = object.metadata.thumbnails;
    if (!thumbnails || typeof thumbnails !== 'object') return;
    for (const width of Object.keys(thumbnails as Record<string, unknown>)) {
      if (/^(128|256|512|1024)$/.test(width)) await this.adapter.deleteObject(this.buildThumbnailStorageKey(object.storageKey, Number(width)));
    }
  }

  private toRealtimeObject(object: StorageObjectDef): Record<string, unknown> {
    const { storageKey: _storageKey, ...safeObject } = object;
    return safeObject;
  }

  private emitStorageRealtime(ctx: StorageOpContext, bucketName: string, event: string, payload: Record<string, any>): void {
    const object = payload.object as StorageObjectDef | undefined;
    const safePayload = {
      ...payload,
      ...(object ? { object: this.toRealtimeObject(object) } : {}),
      bucket: bucketName,
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
    };
    realtimeEngine.publishChannelEvent(ctx.projectId, ctx.environmentId, 'storage', event, safePayload);
    realtimeEngine.publishChannelEvent(ctx.projectId, ctx.environmentId, `storage:${bucketName}`, event, safePayload);
  }

  private usageKey(ctx: StorageOpContext): string {
    return `${ctx.projectId}:${ctx.environmentId}`;
  }

  private incrementUsage(ctx: StorageOpContext, type: 'upload' | 'download', bytes: number): void {
    const key = this.usageKey(ctx);
    const current = this.usageMap.get(key) || { uploadedBytes: 0, uploadsCount: 0, downloadedBytes: 0, downloadsCount: 0 };
    if (type === 'upload') {
      current.uploadedBytes += bytes;
      current.uploadsCount += 1;
    } else {
      current.downloadedBytes += bytes;
      current.downloadsCount += 1;
    }
    this.usageMap.set(key, current);
    const telemetry = { organizationId: ctx.organizationId, projectId: ctx.projectId, environmentId: ctx.environmentId, userId: ctx.userId, requestId: ctx.requestId, service: 'storage' };
    observability.metric(type === 'upload' ? 'storage.uploads' : 'storage.downloads', 1, 'counter', {}, telemetry);
    observability.metric(type === 'upload' ? 'storage.upload_bytes' : 'storage.download_bytes', bytes, 'counter', {}, telemetry);
  }

  private logDenied(ctx: StorageOpContext, bucketName: string, objectPath: string, operation: string, reason?: string): void {
    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'anonymous',
      action: 'storage.access_denied',
      resource_type: 'object',
      resource_id: bucketName,
      metadata: { bucket: bucketName, path: objectPath, operation, reason, requestId: ctx.requestId },
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
    });
  }

  private validateMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata) return {};
    if (Object.getPrototypeOf(metadata) !== Object.prototype && Object.getPrototypeOf(metadata) !== null) {
      throw new Error('Metadados devem ser um objeto JSON simples.');
    }
    const serialized = JSON.stringify(metadata);
    if (serialized.length > 8 * 1024) throw new Error('Metadados excedem o limite de 8 KB.');
    if (serialized.includes('__proto__') || serialized.includes('constructor')) throw new Error('Metadados contêm chaves não permitidas.');
    return JSON.parse(serialized);
  }

  private validateContent(filePath: string, mimeType: string, data: Buffer): string | null {
    const extension = StoragePathUtils.getExtension(filePath);
    const startsWith = (bytes: number[]) => bytes.every((byte, index) => data[index] === byte);
    const expected: Array<{ extensions: string[]; mime: string; magic: number[] }> = [
      { extensions: ['png'], mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
      { extensions: ['jpg', 'jpeg'], mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
      { extensions: ['gif'], mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
      { extensions: ['pdf'], mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
    ];
    const known = expected.find((entry) => entry.extensions.includes(extension));
    if (!known || data.length < known.magic.length) return null;
    if (mimeType.toLowerCase() !== known.mime || !startsWith(known.magic)) {
      return `O conteúdo não corresponde ao tipo ${known.mime} declarado para .${extension}.`;
    }
    return null;
  }

  public createBucket(ctx: StorageOpContext, data: {
    name: string;
    isPublic?: boolean;
    fileSizeLimit?: number;
    allowedMimeTypes?: string[];
    versioningEnabled?: boolean;
  }): { success: boolean; data?: StorageBucketDef; error?: { code: string; message: string } } {
    try {
      const permCtx: StoragePolicyContext = {
        ...ctx,
        bucketName: data.name,
        path: '',
        operation: 'CREATE_BUCKET',
      };
      const perm = StoragePermissionEngine.canCreateBucket(permCtx);
      if (!perm.allowed) {
        return { success: false, error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado.' } };
      }

      const bucket = this.createBucketInternal({
        name: data.name,
        projectId: ctx.projectId,
        environmentId: ctx.environmentId,
        isPublic: data.isPublic ?? false,
        fileSizeLimit: data.fileSizeLimit,
        allowedMimeTypes: data.allowedMimeTypes,
        versioningEnabled: data.versioningEnabled,
        createdBy: ctx.userId,
      });

      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'system',
        action: 'storage.bucket_created',
        resource_type: 'bucket',
        resource_id: bucket.id,
        metadata: { name: bucket.name, isPublic: bucket.isPublic },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });

      this.emitStorageRealtime(ctx, bucket.name, 'bucket.created', { bucket });
      return { success: true, data: bucket };
    } catch (err: any) {
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  public listBuckets(ctx: StorageOpContext): StorageBucketDef[] {
    return Array.from(this.buckets.values()).filter(
      (b) => b.projectId === ctx.projectId && b.environmentId === ctx.environmentId
    );
  }

  public deleteBucket(ctx: StorageOpContext, bucketName: string): { success: boolean; error?: { code: string; message: string } } {
    const permCtx: StoragePolicyContext = {
      ...ctx,
      bucketName,
      path: '',
      operation: 'DELETE_BUCKET',
    };
    const perm = StoragePermissionEngine.canDeleteBucket(permCtx);
    if (!perm.allowed) {
      return { success: false, error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado.' } };
    }

    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) {
      return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    }

    // Check if bucket has files
    const bucketObjects = Array.from(this.objects.values()).filter((o) => o.bucketId === bucket.id);
    if (bucketObjects.length > 0) {
      return {
        success: false,
        error: { code: 'BUCKET_NOT_EMPTY', message: `Bucket '${bucketName}' possui ${bucketObjects.length} arquivos. Exclua-os primeiro.` },
      };
    }

    this.buckets.delete(bucket.id);

    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'system',
      action: 'storage.bucket_deleted',
      resource_type: 'bucket',
      resource_id: bucket.id,
      metadata: { name: bucket.name },
    });

    this.emitStorageRealtime(ctx, bucket.name, 'bucket.deleted', { bucket });
    return { success: true };
  }

  public async uploadObject(
    ctx: StorageOpContext,
    bucketName: string,
    filePath: string,
    data: Buffer,
    mimeType: string,
    options: StorageUploadOptions = {},
  ): Promise<{ success: boolean; data?: StorageObjectDef; error?: { code: string; message: string } }> {
    try {
      const normalizedPath = StoragePathUtils.normalizePath(filePath);
      if (!normalizedPath) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido para upload.' } };
      }

      const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
      if (!bucket) {
        return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
      }

      // Permission check
      const permCtx: StoragePolicyContext = {
        ...ctx,
        bucketName,
        path: normalizedPath,
        operation: 'INSERT',
      };
      const perm = StoragePermissionEngine.can(permCtx);
      if (!perm.allowed) {
        this.logDenied(ctx, bucketName, normalizedPath, 'INSERT', perm.reason);
        return { success: false, error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado.' } };
      }

      // MIME validation
      const mimeCheck = StoragePermissionEngine.validateMimeType(bucket.allowedMimeTypes, mimeType);
      if (!mimeCheck.allowed) {
        return { success: false, error: { code: 'INVALID_MIME', message: mimeCheck.reason || 'Tipo MIME não permitido.' } };
      }

      // Size validation
      const sizeCheck = StoragePermissionEngine.validateFileSize(bucket.fileSizeLimit, data.length);
      if (!sizeCheck.allowed) {
        return { success: false, error: { code: 'FILE_TOO_LARGE', message: sizeCheck.reason || 'Arquivo excede o limite permitido.' } };
      }

      const contentError = this.validateContent(normalizedPath, mimeType, data);
      if (contentError) {
        return { success: false, error: { code: 'INVALID_FILE_CONTENT', message: contentError } };
      }

      const sanitizedMetadata = this.validateMetadata(options.metadata);

      // Check for existing object at path
      const existingObj = this.findObject(bucket.id, normalizedPath);

      const objectId = existingObj ? existingObj.id : `obj_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
      const version = existingObj ? existingObj.version + 1 : 1;
      if (existingObj && bucket.versioningEnabled) this.savePreviousVersion(existingObj);
      const storageKey = bucket.versioningEnabled
        ? this.buildVersionStorageKey(ctx.projectId, ctx.environmentId, bucket.id, objectId, version)
        : this.buildStorageKey(ctx.projectId, ctx.environmentId, bucket.id, objectId);

      // Upload physical object first (atomicity: metadata only after physical success)
      const putResult = await this.adapter.putObject(storageKey, data, mimeType);

      const now = new Date().toISOString();
      const object: StorageObjectDef = {
        id: objectId,
        bucketId: bucket.id,
        projectId: ctx.projectId,
        environmentId: ctx.environmentId,
        path: normalizedPath,
        name: StoragePathUtils.getFileName(normalizedPath),
        extension: StoragePathUtils.getExtension(normalizedPath),
        mimeType,
        size: data.length,
        etag: putResult.etag,
        checksum: createHash('sha256').update(data).digest('hex'),
        storageKey,
        metadata: await this.enrichMetadata({
          ...sanitizedMetadata,
          ...(options.contentEncoding ? { contentEncoding: options.contentEncoding } : {}),
          ...(options.contentLanguage ? { contentLanguage: options.contentLanguage } : {}),
        }, data, mimeType),
        cacheControl: options.cacheControl || existingObj?.cacheControl || 'public,max-age=3600',
        contentDisposition: options.contentDisposition || existingObj?.contentDisposition || 'inline',
        createdAt: existingObj ? existingObj.createdAt : now,
        updatedAt: now,
        createdBy: existingObj ? existingObj.createdBy || ctx.userId : ctx.userId || 'system',
        updatedBy: ctx.userId || 'system',
        version,
      };
      const thumbnails = await this.generateThumbnails(storageKey, data, mimeType);
      if (Object.keys(thumbnails).length > 0) object.metadata.thumbnails = thumbnails;

      this.objects.set(object.id, object);

      // Update bucket stats
      if (existingObj) {
        bucket.sizeBytes = Math.max(0, bucket.sizeBytes - existingObj.size + data.length);
      } else {
        bucket.fileCount += 1;
        bucket.sizeBytes += data.length;
      }
      bucket.updatedAt = now;
      this.buckets.set(bucket.id, bucket);
      this.incrementUsage(ctx, 'upload', data.length);

      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'system',
        action: existingObj ? 'storage.file_updated' : 'storage.file_uploaded',
        resource_type: 'object',
        resource_id: object.id,
        metadata: { bucket: bucket.name, path: normalizedPath, size: data.length, checksum: object.checksum, requestId: ctx.requestId },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });

      // Emit realtime event
      realtimeEngine.ingestCdcEvent({
        eventId: `stg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        environmentId: ctx.environmentId,
        schema: 'storage',
        table: bucket.name,
        operation: existingObj ? 'UPDATE' : 'INSERT',
        new: this.toRealtimeObject(object),
        old: existingObj ? this.toRealtimeObject(existingObj) : null,
      });
      this.emitStorageRealtime(ctx, bucket.name, existingObj ? 'file.updated' : 'file.uploaded', { object });

      return { success: true, data: object };
    } catch (err: any) {
      logger.error('Storage upload error:', err);
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  public async getObject(ctx: StorageOpContext, bucketName: string, filePath: string): Promise<{ success: boolean; data?: { object: StorageObjectDef; content: Buffer }; error?: { code: string; message: string } }> {
    try {
      const normalizedPath = StoragePathUtils.normalizePath(filePath);
      if (!normalizedPath) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
      }

      const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
      if (!bucket) {
        return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
      }

      // Public buckets allow anonymous read
      const permCtx: StoragePolicyContext = {
        ...ctx,
        bucketName,
        path: normalizedPath,
        operation: 'READ',
      };

      const perm = bucket.isPublic ? StoragePermissionEngine.canRls(permCtx) : StoragePermissionEngine.can(permCtx);
      if (!perm.allowed) {
        this.logDenied(ctx, bucketName, normalizedPath, 'READ', perm.reason);
        return { success: false, error: { code: 'FORBIDDEN', message: bucket.isPublic ? 'A política RLS negou o acesso.' : 'Acesso negado. Bucket privado.' } };
      }

      const object = this.findObject(bucket.id, normalizedPath);
      if (!object) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
      }

      const content = await this.adapter.getObject(object.storageKey);
      if (!content) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: 'Conteúdo do arquivo não encontrado.' } };
      }

      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'anonymous',
        action: 'storage.file_downloaded',
        resource_type: 'object',
        resource_id: object.id,
        metadata: { bucket: bucket.name, path: normalizedPath, requestId: ctx.requestId },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });

      this.incrementUsage(ctx, 'download', object.size);

      return { success: true, data: { object, content } };
    } catch (err: any) {
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  /** Resolves access and returns a stream without materialising the object in server memory. */
  public async getObjectStream(
    ctx: StorageOpContext,
    bucketName: string,
    filePath: string,
    range?: { start: number; end?: number },
  ): Promise<{ success: boolean; data?: { object: StorageObjectDef; stream: import('node:stream').Readable }; error?: { code: string; message: string } }> {
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    if (!normalizedPath) return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    const object = this.findObject(bucket.id, normalizedPath);
    if (!object) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
    const permission = bucket.isPublic ? StoragePermissionEngine.canRls({ ...ctx, bucketName, path: normalizedPath, operation: 'READ' }) : StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'READ' });
    if (!permission.allowed) {
      this.logDenied(ctx, bucketName, normalizedPath, 'READ', permission.reason);
      return { success: false, error: { code: 'FORBIDDEN', message: bucket.isPublic ? 'A política RLS negou o acesso.' : 'Acesso negado. Bucket privado.' } };
    }
    const stream = await this.adapter.getObjectStream(object.storageKey, range);
    if (!stream) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: 'Conteúdo do arquivo não encontrado.' } };
    this.incrementUsage(ctx, 'download', range ? (range.end ?? object.size - 1) - range.start + 1 : object.size);
    db.logAudit({
      organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId,
      user_id: ctx.userId || 'anonymous', action: 'storage.file_downloaded', resource_type: 'object', resource_id: object.id,
      metadata: { bucket: bucket.name, path: normalizedPath, ranged: Boolean(range), requestId: ctx.requestId }, ip_address: ctx.ip, user_agent: ctx.userAgent,
    });
    return { success: true, data: { object, stream } };
  }

  /** Produces a derived image in memory. The source object is never modified. */
  public async transformImage(
    ctx: StorageOpContext,
    bucketName: string,
    filePath: string,
    options: StorageImageTransformOptions = {},
  ): Promise<{ success: boolean; data?: { content: Buffer; mimeType: string }; error?: { code: string; message: string } }> {
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    if (!normalizedPath) return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    const object = this.findObject(bucket.id, normalizedPath);
    if (!object) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
    if (!object.mimeType.startsWith('image/')) return { success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Transformações exigem um arquivo de imagem.' } };
    const permission = bucket.isPublic ? StoragePermissionEngine.canRls({ ...ctx, bucketName, path: normalizedPath, operation: 'READ' }) : StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'READ' });
    if (!permission.allowed) return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Acesso negado.' } };

    const validDimension = (value: number | undefined) => value === undefined || (Number.isInteger(value) && value >= 1 && value <= 4096);
    if (!validDimension(options.width) || !validDimension(options.height)) {
      return { success: false, error: { code: 'INVALID_TRANSFORM', message: 'Largura e altura devem estar entre 1 e 4096 pixels.' } };
    }
    if (options.quality !== undefined && (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100)) {
      return { success: false, error: { code: 'INVALID_TRANSFORM', message: 'A qualidade deve estar entre 1 e 100.' } };
    }
    if (options.rotate !== undefined && (!Number.isFinite(options.rotate) || options.rotate < -360 || options.rotate > 360)) {
      return { success: false, error: { code: 'INVALID_TRANSFORM', message: 'A rotação deve estar entre -360 e 360 graus.' } };
    }

    const requestedThumbnail = options.format === 'webp' && options.width && [128, 256, 512, 1024].includes(options.width)
      && !options.height && !options.resize && !options.crop && !options.rotate;
    if (requestedThumbnail) {
      const thumbnail = await this.adapter.getObject(this.buildThumbnailStorageKey(object.storageKey, options.width!));
      if (thumbnail) return { success: true, data: { content: thumbnail, mimeType: 'image/webp' } };
    }
    const content = await this.adapter.getObject(object.storageKey);
    if (!content) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: 'Conteúdo do arquivo não encontrado.' } };
    try {
      let pipeline = sharp(content, { animated: false, failOn: 'none' });
      if (options.width || options.height) {
        pipeline = pipeline.resize({
          width: options.width,
          height: options.height,
          fit: options.resize || (options.crop ? 'cover' : 'inside'),
          position: options.crop || 'center',
          withoutEnlargement: true,
        });
      }
      if (options.rotate) pipeline = pipeline.rotate(options.rotate);
      const quality = options.quality || 80;
      let mimeType = object.mimeType;
      if (options.format === 'webp') { pipeline = pipeline.webp({ quality }); mimeType = 'image/webp'; }
      else if (options.format === 'avif') { pipeline = pipeline.avif({ quality }); mimeType = 'image/avif'; }
      else if (options.format === 'jpeg') { pipeline = pipeline.jpeg({ quality }); mimeType = 'image/jpeg'; }
      else if (options.format === 'png') { pipeline = pipeline.png({ quality }); mimeType = 'image/png'; }
      const output = await pipeline.toBuffer();
      return { success: true, data: { content: output, mimeType } };
    } catch {
      return { success: false, error: { code: 'INVALID_IMAGE', message: 'Não foi possível transformar a imagem.' } };
    }
  }

  public async deleteObject(ctx: StorageOpContext, bucketName: string, filePath: string, options: { softDelete?: boolean } = {}): Promise<{ success: boolean; error?: { code: string; message: string } }> {
    try {
      const normalizedPath = StoragePathUtils.normalizePath(filePath);
      if (!normalizedPath) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
      }

      const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
      if (!bucket) {
        return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
      }

      const permCtx: StoragePolicyContext = {
        ...ctx,
        bucketName,
        path: normalizedPath,
        operation: 'DELETE',
      };
      const perm = StoragePermissionEngine.can(permCtx);
      if (!perm.allowed) {
        this.logDenied(ctx, bucketName, normalizedPath, 'DELETE', perm.reason);
        return { success: false, error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado.' } };
      }

      const object = this.findObject(bucket.id, normalizedPath) || (options.softDelete === false ? this.findDeletedObject(bucket.id, normalizedPath) : null);
      if (!object) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
      }

      const wasDeleted = Boolean(object.deletedAt);
      const softDelete = !wasDeleted && (options.softDelete ?? bucket.versioningEnabled);
      const now = new Date().toISOString();
      if (softDelete) {
        object.deletedAt = now;
        object.deletedBy = ctx.userId || 'system';
        object.updatedAt = now;
        object.updatedBy = ctx.userId || 'system';
        this.objects.set(object.id, object);
      } else {
        const historicalVersions = this.objectVersions.get(object.id) || [];
        await this.adapter.deleteObject(object.storageKey);
        await this.deleteDerivedAssets(object);
        for (const historical of historicalVersions) {
          await this.adapter.deleteObject(historical.storageKey);
          await this.deleteDerivedAssets(historical);
        }
        this.objects.delete(object.id);
        this.objectVersions.delete(object.id);
      }

      // Update bucket stats
      if (!wasDeleted) {
        bucket.fileCount = Math.max(0, bucket.fileCount - 1);
        bucket.sizeBytes = Math.max(0, bucket.sizeBytes - object.size);
      }
      bucket.updatedAt = now;
      this.buckets.set(bucket.id, bucket);

      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'system',
        action: softDelete ? 'storage.file_soft_deleted' : wasDeleted ? 'storage.file_purged' : 'storage.file_deleted',
        resource_type: 'object',
        resource_id: object.id,
        metadata: { bucket: bucket.name, path: normalizedPath, requestId: ctx.requestId },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });

      realtimeEngine.ingestCdcEvent({
        eventId: `stg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        environmentId: ctx.environmentId,
        schema: 'storage',
        table: bucket.name,
        operation: 'DELETE',
        new: null,
        old: this.toRealtimeObject(object),
      });
      this.emitStorageRealtime(ctx, bucket.name, 'file.deleted', { object, softDelete, purged: wasDeleted });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  public restoreObject(ctx: StorageOpContext, bucketName: string, filePath: string): { success: boolean; data?: StorageObjectDef; error?: { code: string; message: string } } {
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    if (!normalizedPath) return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    const permission = StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'UPDATE' });
    if (!permission.allowed) return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Acesso negado.' } };
    if (this.findObject(bucket.id, normalizedPath)) return { success: false, error: { code: 'OBJECT_EXISTS', message: `Já existe um arquivo em '${normalizedPath}'.` } };
    const object = this.findDeletedObject(bucket.id, normalizedPath);
    if (!object) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Não há arquivo excluído em '${normalizedPath}'.` } };

    const now = new Date().toISOString();
    delete object.deletedAt;
    delete object.deletedBy;
    object.updatedAt = now;
    object.updatedBy = ctx.userId || 'system';
    this.objects.set(object.id, object);
    bucket.fileCount += 1;
    bucket.sizeBytes += object.size;
    bucket.updatedAt = now;
    this.buckets.set(bucket.id, bucket);
    db.logAudit({
      organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId,
      user_id: ctx.userId || 'system', action: 'storage.file_restored', resource_type: 'object', resource_id: object.id,
      metadata: { bucket: bucket.name, path: normalizedPath, requestId: ctx.requestId }, ip_address: ctx.ip, user_agent: ctx.userAgent,
    });
    this.emitStorageRealtime(ctx, bucket.name, 'file.restored', { object });
    return { success: true, data: object };
  }

  public listObjectVersions(ctx: StorageOpContext, bucketName: string, filePath: string): { success: boolean; data?: StorageObjectVersionDef[]; error?: { code: string; message: string } } {
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    if (!normalizedPath) return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    const permission = StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'READ' });
    if (!permission.allowed) return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Acesso negado.' } };
    const object = this.findObject(bucket.id, normalizedPath) || this.findDeletedObject(bucket.id, normalizedPath);
    if (!object) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
    const current = { ...this.createVersionSnapshot(object), id: `objv_current_${object.id}_${object.version}` };
    const previous = this.objectVersions.get(object.id) || [];
    return { success: true, data: [current, ...previous].sort((left, right) => right.version - left.version) };
  }

  public async restoreObjectVersion(ctx: StorageOpContext, bucketName: string, filePath: string, version: number): Promise<{ success: boolean; data?: StorageObjectDef; error?: { code: string; message: string } }> {
    if (!Number.isInteger(version) || version < 1) return { success: false, error: { code: 'INVALID_VERSION', message: 'Versão inválida.' } };
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    if (!normalizedPath) return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    const permission = StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'UPDATE' });
    if (!permission.allowed) return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Acesso negado.' } };
    const object = this.findObject(bucket.id, normalizedPath);
    if (!object) return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
    if (object.version === version) return { success: true, data: object };
    const snapshot = (this.objectVersions.get(object.id) || []).find((entry) => entry.version === version);
    if (!snapshot) return { success: false, error: { code: 'VERSION_NOT_FOUND', message: `Versão ${version} não encontrada.` } };
    const content = await this.adapter.getObject(snapshot.storageKey);
    if (!content) return { success: false, error: { code: 'VERSION_NOT_FOUND', message: 'O conteúdo da versão não está disponível.' } };
    const restored = await this.uploadObject(ctx, bucketName, normalizedPath, content, snapshot.mimeType, { metadata: snapshot.metadata });
    if (restored.success && restored.data) {
      db.logAudit({
        organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId,
        user_id: ctx.userId || 'system', action: 'storage.version_restored', resource_type: 'object', resource_id: restored.data.id,
        metadata: { bucket: bucket.name, path: normalizedPath, restoredVersion: version, requestId: ctx.requestId }, ip_address: ctx.ip, user_agent: ctx.userAgent,
      });
    }
    return restored;
  }

  public async moveObject(ctx: StorageOpContext, bucketName: string, sourcePath: string, destPath: string): Promise<{ success: boolean; data?: StorageObjectDef; error?: { code: string; message: string } }> {
    try {
      const srcNormalized = StoragePathUtils.normalizePath(sourcePath);
      const destNormalized = StoragePathUtils.normalizePath(destPath);
      if (!srcNormalized || !destNormalized) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho de origem ou destino inválido.' } };
      }

      const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
      if (!bucket) {
        return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
      }

      const sourcePermission = StoragePermissionEngine.can({ ...ctx, bucketName, path: srcNormalized, operation: 'MOVE' });
      const destinationPermission = StoragePermissionEngine.can({ ...ctx, bucketName, path: destNormalized, operation: 'INSERT' });
      if (!sourcePermission.allowed || !destinationPermission.allowed) {
        this.logDenied(ctx, bucketName, srcNormalized, 'MOVE', sourcePermission.reason || destinationPermission.reason);
        return { success: false, error: { code: 'FORBIDDEN', message: sourcePermission.reason || destinationPermission.reason || 'Acesso negado.' } };
      }
      if (this.findObject(bucket.id, destNormalized)) {
        return { success: false, error: { code: 'OBJECT_EXISTS', message: `Já existe um arquivo em '${destNormalized}'.` } };
      }

      const object = this.findObject(bucket.id, srcNormalized);
      if (!object) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${srcNormalized}' não encontrado.` } };
      }

      object.path = destNormalized;
      object.name = StoragePathUtils.getFileName(destNormalized);
      object.extension = StoragePathUtils.getExtension(destNormalized);
      object.updatedAt = new Date().toISOString();
      object.updatedBy = ctx.userId;
      this.objects.set(object.id, object);

      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'system',
        action: 'storage.file_moved',
        resource_type: 'object',
        resource_id: object.id,
        metadata: { bucket: bucket.name, from: srcNormalized, to: destNormalized, requestId: ctx.requestId },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });

      realtimeEngine.ingestCdcEvent({
        eventId: `stg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: object.updatedAt,
        organizationId: ctx.organizationId,
        projectId: ctx.projectId,
        environmentId: ctx.environmentId,
        schema: 'storage',
        table: bucket.name,
        operation: 'UPDATE',
        new: this.toRealtimeObject(object),
        old: { ...this.toRealtimeObject(object), path: srcNormalized },
      });

      return { success: true, data: object };
    } catch (err: any) {
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  public async copyObject(ctx: StorageOpContext, bucketName: string, sourcePath: string, destPath: string): Promise<{ success: boolean; data?: StorageObjectDef; error?: { code: string; message: string } }> {
    try {
      const srcNormalized = StoragePathUtils.normalizePath(sourcePath);
      const destNormalized = StoragePathUtils.normalizePath(destPath);
      if (!srcNormalized || !destNormalized) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho de origem ou destino inválido.' } };
      }

      const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
      if (!bucket) {
        return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
      }

      const sourcePermission = StoragePermissionEngine.can({ ...ctx, bucketName, path: srcNormalized, operation: 'COPY' });
      const destinationPermission = StoragePermissionEngine.can({ ...ctx, bucketName, path: destNormalized, operation: 'INSERT' });
      if (!sourcePermission.allowed || !destinationPermission.allowed) {
        this.logDenied(ctx, bucketName, srcNormalized, 'COPY', sourcePermission.reason || destinationPermission.reason);
        return { success: false, error: { code: 'FORBIDDEN', message: sourcePermission.reason || destinationPermission.reason || 'Access denied.' } };
      }
      if (this.findObject(bucket.id, destNormalized)) {
        return { success: false, error: { code: 'OBJECT_EXISTS', message: 'An object already exists at the destination path.' } };
      }
      const sourceObj = this.findObject(bucket.id, srcNormalized);
      if (!sourceObj) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${srcNormalized}' não encontrado.` } };
      }

      // Copy via upload flow using source content
      const content = await this.adapter.getObject(sourceObj.storageKey);
      if (!content) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: 'Conteúdo do arquivo de origem não encontrado.' } };
      }

      const result = await this.uploadObject(ctx, bucketName, destNormalized, content, sourceObj.mimeType, {
        metadata: sourceObj.metadata,
        cacheControl: sourceObj.cacheControl,
        contentDisposition: sourceObj.contentDisposition,
      });
      if (result.success && result.data) {
        db.logAudit({
          organization_id: ctx.organizationId,
          project_id: ctx.projectId,
          environment_id: ctx.environmentId,
          user_id: ctx.userId || 'system',
          action: 'storage.file_copied',
          resource_type: 'object',
          resource_id: result.data.id,
          metadata: { bucket: bucket.name, from: srcNormalized, to: destNormalized },
        });
      }
      return result;
    } catch (err: any) {
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  public listObjectsPage(ctx: StorageOpContext, bucketName: string, options: StorageListOptions = {}): { success: boolean; data?: StorageListResult; error?: { code: string; message: string } } {
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' not found.` } };
    const permission = StoragePermissionEngine.can({ ...ctx, bucketName, path: options.prefix || '', operation: 'LIST' });
    if (!permission.allowed) {
      this.logDenied(ctx, bucketName, options.prefix || '', 'LIST', permission.reason);
      return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Access denied.' } };
    }
    const prefix = options.prefix ? StoragePathUtils.normalizePrefix(options.prefix) : '';
    if (options.prefix && prefix === null) return { success: false, error: { code: 'INVALID_PATH', message: 'Invalid object prefix.' } };
    let objects = Array.from(this.objects.values()).filter((object) => object.bucketId === bucket.id && !object.deletedAt && (!prefix || object.path.startsWith(prefix)));
    if (options.search) {
      const search = options.search.toLowerCase();
      objects = objects.filter((object) => object.name.toLowerCase().includes(search) || object.path.toLowerCase().includes(search) || object.mimeType.toLowerCase().includes(search) || JSON.stringify(object.metadata).toLowerCase().includes(search));
    }
    const sort = options.sort || 'path';
    const direction = options.order === 'desc' ? -1 : 1;
    objects.sort((a, b) => {
      const left = sort === 'size' ? a.size : sort === 'createdAt' ? a.createdAt : sort === 'updatedAt' ? a.updatedAt : a.path;
      const right = sort === 'size' ? b.size : sort === 'createdAt' ? b.createdAt : sort === 'updatedAt' ? b.updatedAt : b.path;
      return typeof left === 'number' && typeof right === 'number' ? direction * (left - right) : direction * String(left).localeCompare(String(right));
    });
    const requestedOffset = options.cursor ? Number(Buffer.from(options.cursor, 'base64url').toString('utf8')) : options.offset || 0;
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const limit = Math.min(Math.max(options.limit || 100, 1), 1000);
    const page = objects.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return { success: true, data: { objects: page, total: objects.length, nextCursor: nextOffset < objects.length ? Buffer.from(String(nextOffset)).toString('base64url') : undefined } };
  }

  public listObjects(ctx: StorageOpContext, bucketName: string, options?: { prefix?: string; limit?: number; offset?: number }): { success: boolean; data?: StorageObjectDef[]; error?: { code: string; message: string } } {
    const page = this.listObjectsPage(ctx, bucketName, options);
    return page.success
      ? { success: true, data: page.data!.objects }
      : { success: false, error: page.error };
  }

  private createAccessToken(ctx: StorageOpContext, bucketName: string, objectPath: string, operation: 'read' | 'upload', expiresAt: string): string {
    const payload = Buffer.from(JSON.stringify({ o: ctx.organizationId, p: ctx.projectId, e: ctx.environmentId, b: bucketName, k: objectPath, op: operation, exp: expiresAt })).toString('base64url');
    const signature = createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  public resolveAccessToken(token: string, operation: 'read' | 'upload'): { context: StorageOpContext; bucketName: string; path: string } | null {
    try {
      const [payload, signature] = token.split('.');
      if (!payload || !signature) return null;
      const expected = createHmac('sha256', config.jwtSecret).update(payload).digest('base64url');
      if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { o: string; p: string; e: string; b: string; k: string; op: string; exp: string };
      if (decoded.op !== operation || !decoded.o || !decoded.p || !decoded.e || !decoded.b || !StoragePathUtils.normalizePath(decoded.k)) return null;
      if (!Number.isFinite(Date.parse(decoded.exp)) || Date.parse(decoded.exp) <= Date.now()) return null;
      return { context: { organizationId: decoded.o, projectId: decoded.p, environmentId: decoded.e, role: 'service', userId: 'signed-url' }, bucketName: decoded.b, path: decoded.k };
    } catch {
      return null;
    }
  }

  public createSignedUrl(ctx: StorageOpContext, bucketName: string, filePath: string, expiresInSeconds: number): { success: boolean; data?: { signedUrl: string; expiresAt: string }; error?: { code: string; message: string } } {
    try {
      const normalizedPath = StoragePathUtils.normalizePath(filePath);
      if (!normalizedPath) {
        return { success: false, error: { code: 'INVALID_PATH', message: 'Caminho inválido.' } };
      }

      const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
      if (!bucket) {
        return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
      }

      const permCtx: StoragePolicyContext = {
        ...ctx,
        bucketName,
        path: normalizedPath,
        operation: 'SIGNED_URL',
      };
      const perm = StoragePermissionEngine.can(permCtx);
      if (!perm.allowed) {
        return { success: false, error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado.' } };
      }

      const object = this.findObject(bucket.id, normalizedPath);
      if (!object) {
        return { success: false, error: { code: 'OBJECT_NOT_FOUND', message: `Arquivo '${normalizedPath}' não encontrado.` } };
      }

      const safeExpiresIn = Math.min(Math.max(Number(expiresInSeconds) || 0, 1), 7 * 24 * 60 * 60);
      const expiresAt = new Date(Date.now() + safeExpiresIn * 1000);
      const token = this.createAccessToken(ctx, bucketName, normalizedPath, 'read', expiresAt.toISOString());

      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'system',
        action: 'storage.signed_url_created',
        resource_type: 'object',
        resource_id: object.id,
        metadata: { bucket: bucket.name, path: normalizedPath, expiresIn: safeExpiresIn, requestId: ctx.requestId },
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
      });

      const signedUrl = `/storage/v1/object/sign/${encodeURIComponent(bucketName)}/${normalizedPath.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(token)}`;

      return { success: true, data: { signedUrl, expiresAt: expiresAt.toISOString() } };
    } catch (err: any) {
      return { success: false, error: { code: 'STORAGE_ERROR', message: err.message } };
    }
  }

  public verifySignedUrl(ctx: StorageOpContext, bucketName: string, filePath: string, expires: string, signature: string): boolean {
    try {
      if (!expires || !signature) return false;
      const expiresAt = new Date(expires);
      if (expiresAt.getTime() < Date.now()) return false;

      const expected = this.generateSignature(ctx, bucketName, filePath, expires);
      return Buffer.byteLength(expected) === Buffer.byteLength(signature) && timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  private generateSignature(ctx: StorageOpContext, bucketName: string, path: string, expires: string): string {
    const secret = config.jwtSecret;
    const payload = `${ctx.projectId}:${ctx.environmentId}:${bucketName}:${path}:${expires}`;
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  public createSignedUploadUrl(ctx: StorageOpContext, bucketName: string, filePath: string, expiresInSeconds: number): { success: boolean; data?: { signedUrl: string; expiresAt: string }; error?: { code: string; message: string } } {
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    if (!normalizedPath) return { success: false, error: { code: 'INVALID_PATH', message: 'Invalid object path.' } };
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' not found.` } };
    const permission = StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'INSERT' });
    if (!permission.allowed) {
      this.logDenied(ctx, bucketName, normalizedPath, 'SIGNED_UPLOAD', permission.reason);
      return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Access denied.' } };
    }
    const safeExpiresIn = Math.min(Math.max(Number(expiresInSeconds) || 0, 1), 60 * 60);
    const expiresAt = new Date(Date.now() + safeExpiresIn * 1000).toISOString();
    const token = this.createAccessToken(ctx, bucketName, normalizedPath, 'upload', expiresAt);
    return { success: true, data: { signedUrl: `/storage/v1/object/upload/${encodeURIComponent(bucketName)}/${normalizedPath.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(token)}`, expiresAt } };
  }

  public createMultipartUpload(ctx: StorageOpContext, bucketName: string, filePath: string, mimeType: string, options: StorageUploadOptions = {}): { success: boolean; data?: StorageMultipartUploadDef; error?: { code: string; message: string } } {
    this.cleanupExpiredMultipartUploads();
    const normalizedPath = StoragePathUtils.normalizePath(filePath);
    const bucket = normalizedPath ? this.getBucket(ctx.projectId, ctx.environmentId, bucketName) : null;
    if (!normalizedPath || !bucket) return { success: false, error: { code: normalizedPath ? 'BUCKET_NOT_FOUND' : 'INVALID_PATH', message: 'Invalid bucket or object path.' } };
    const permission = StoragePermissionEngine.can({ ...ctx, bucketName, path: normalizedPath, operation: 'INSERT' });
    if (!permission.allowed) return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Access denied.' } };
    const mime = StoragePermissionEngine.validateMimeType(bucket.allowedMimeTypes, mimeType);
    if (!mime.allowed) return { success: false, error: { code: 'INVALID_MIME', message: mime.reason || 'Invalid MIME type.' } };
    const now = new Date().toISOString();
    const upload: StorageMultipartUploadDef = { id: `mpu_${randomUUID().replace(/-/g, '').slice(0, 20)}`, bucketId: bucket.id, projectId: ctx.projectId, environmentId: ctx.environmentId, path: normalizedPath, mimeType, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), createdAt: now, createdBy: ctx.userId };
    this.multipartUploads.set(upload.id, { upload, context: ctx, bucketName, options, parts: new Map() });
    return { success: true, data: upload };
  }

  public uploadMultipartPart(ctx: StorageOpContext, uploadId: string, partNumber: number, data: Buffer): { success: boolean; error?: { code: string; message: string } } {
    const session = this.multipartUploads.get(uploadId);
    if (!session || Date.parse(session.upload.expiresAt) <= Date.now()) return { success: false, error: { code: 'MULTIPART_NOT_FOUND', message: 'Multipart upload not found or expired.' } };
    if (session.upload.projectId !== ctx.projectId || session.upload.environmentId !== ctx.environmentId || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) return { success: false, error: { code: 'FORBIDDEN', message: 'Invalid multipart upload context or part number.' } };
    session.parts.set(partNumber, Buffer.from(data));
    return { success: true };
  }

  public async completeMultipartUpload(ctx: StorageOpContext, uploadId: string): Promise<{ success: boolean; data?: StorageObjectDef; error?: { code: string; message: string } }> {
    const session = this.multipartUploads.get(uploadId);
    if (!session || Date.parse(session.upload.expiresAt) <= Date.now()) return { success: false, error: { code: 'MULTIPART_NOT_FOUND', message: 'Multipart upload not found or expired.' } };
    if (session.upload.projectId !== ctx.projectId || session.upload.environmentId !== ctx.environmentId) return { success: false, error: { code: 'FORBIDDEN', message: 'Multipart upload belongs to another storage context.' } };
    const parts = [...session.parts.entries()].sort(([left], [right]) => left - right);
    if (!parts.length) return { success: false, error: { code: 'MULTIPART_EMPTY', message: 'Multipart upload has no parts.' } };
    const object = await this.uploadObject(session.context, session.bucketName, session.upload.path, Buffer.concat(parts.map(([, part]) => part)), session.upload.mimeType, session.options);
    if (object.success) this.multipartUploads.delete(uploadId);
    return object;
  }

  public abortMultipartUpload(ctx: StorageOpContext, uploadId: string): boolean {
    const session = this.multipartUploads.get(uploadId);
    if (!session || session.upload.projectId !== ctx.projectId || session.upload.environmentId !== ctx.environmentId) return false;
    this.multipartUploads.delete(uploadId);
    return true;
  }

  public cleanupExpiredMultipartUploads(): number {
    let removed = 0;
    for (const [id, session] of this.multipartUploads) {
      if (Date.parse(session.upload.expiresAt) <= Date.now()) { this.multipartUploads.delete(id); removed += 1; }
    }
    return removed;
  }

  public getActiveMultipartUploads(): number { this.cleanupExpiredMultipartUploads(); return this.multipartUploads.size; }

  public getUsage(ctx: StorageOpContext, bucketName?: string): StorageUsageDef {
    const buckets = this.listBuckets(ctx);
    const filteredBuckets = bucketName ? buckets.filter((b) => b.name === bucketName) : buckets;

    const bucketIds = new Set(filteredBuckets.map((b) => b.id));
    const objects = Array.from(this.objects.values()).filter((o) => bucketIds.has(o.bucketId) && !o.deletedAt);

    let totalBytes = 0;
    for (const b of filteredBuckets) totalBytes += b.sizeBytes;
    const counters = this.usageMap.get(this.usageKey(ctx)) || { uploadedBytes: 0, uploadsCount: 0, downloadedBytes: 0, downloadsCount: 0 };

    return {
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
      bucketId: bucketName,
      totalFiles: objects.length,
      totalBytes,
      bucketCount: filteredBuckets.length,
      uploadedBytes: counters.uploadedBytes,
      downloadedBytes: counters.downloadedBytes,
      uploadsCount: counters.uploadsCount,
      downloadsCount: counters.downloadsCount,
    };
  }

  public getProvider(): string {
    return this.provider;
  }

  /** Exposes the underlying storage adapter for real backup/restore operations. */
  public getAdapter(): StorageAdapter {
    return this.adapter;
  }

  /** Lists all storage keys (including versions) for a project environment. */
  public listAllStorageKeys(projectId: string, environmentId: string): string[] {
    const bucketIds = new Set(
      Array.from(this.buckets.values())
        .filter((bucket) => bucket.projectId === projectId && bucket.environmentId === environmentId)
        .map((bucket) => bucket.id)
    );
    const keys = new Set<string>();
    for (const object of this.objects.values()) {
      if (bucketIds.has(object.bucketId)) keys.add(object.storageKey);
    }
    for (const versions of this.objectVersions.values()) {
      for (const version of versions) {
        if (bucketIds.has(version.bucketId)) keys.add(version.storageKey);
      }
    }
    return Array.from(keys);
  }

  /** Returns all bucket definitions for a project environment. */
  public listBucketDefinitions(projectId: string, environmentId: string): StorageBucketDef[] {
    return Array.from(this.buckets.values()).filter(
      (bucket) => bucket.projectId === projectId && bucket.environmentId === environmentId
    );
  }

  public getBucketDefinition(projectId: string, environmentId: string, bucketName: string): StorageBucketDef | null {
    return this.getBucket(projectId, environmentId, bucketName);
  }

  public getObjectDefinition(projectId: string, environmentId: string, bucketName: string, objectPath: string): StorageObjectDef | null {
    const normalizedPath = StoragePathUtils.normalizePath(objectPath);
    const bucket = normalizedPath ? this.getBucket(projectId, environmentId, bucketName) : null;
    return bucket && normalizedPath ? this.findObject(bucket.id, normalizedPath) : null;
  }

  public updateBucket(ctx: StorageOpContext, bucketName: string, updates: Partial<{ isPublic: boolean; fileSizeLimit: number; allowedMimeTypes: string[]; versioningEnabled: boolean }>): { success: boolean; data?: StorageBucketDef; error?: { code: string; message: string } } {
    const permission = StoragePermissionEngine.canCreateBucket({ ...ctx, bucketName, path: '', operation: 'CREATE_BUCKET' });
    if (!permission.allowed) {
      this.logDenied(ctx, bucketName, '', 'UPDATE_BUCKET', permission.reason);
      return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Access denied.' } };
    }
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) {
      return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: `Bucket '${bucketName}' não encontrado.` } };
    }

    const updated = { ...bucket, ...updates, updatedAt: new Date().toISOString() };
    this.buckets.set(bucket.id, updated);

    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'system',
      action: 'storage.bucket_updated',
      resource_type: 'bucket',
      resource_id: bucket.id,
      metadata: { name: bucket.name, updates },
    });
    this.emitStorageRealtime(ctx, bucket.name, 'bucket.updated', { bucket: updated });

    return { success: true, data: updated };
  }

  public listPolicies(ctx: StorageOpContext, bucketName: string): any[] {
    return StoragePermissionEngine.getPolicies(ctx.projectId, ctx.environmentId, bucketName);
  }

  public setPolicy(ctx: StorageOpContext, bucketName: string, policy: { role: string; operation: any; pathPattern: string }): { success: boolean; data?: any; error?: { code: string; message: string } } {
    const permission = StoragePermissionEngine.canCreateBucket({ ...ctx, bucketName, path: '', operation: 'CREATE_BUCKET' });
    if (!permission.allowed) {
      this.logDenied(ctx, bucketName, '', 'POLICY_CHANGE', permission.reason);
      return { success: false, error: { code: 'FORBIDDEN', message: permission.reason || 'Access denied.' } };
    }
    const bucket = this.getBucket(ctx.projectId, ctx.environmentId, bucketName);
    if (!bucket) return { success: false, error: { code: 'BUCKET_NOT_FOUND', message: 'Bucket não encontrado.' } };

    const created = StoragePermissionEngine.setPolicy(ctx.projectId, ctx.environmentId, bucketName, {
      bucketId: bucket.id,
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
      role: policy.role,
      operation: policy.operation,
      pathPattern: policy.pathPattern,
    });

    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'system',
      action: 'storage.policy_changed',
      resource_type: 'policy',
      resource_id: created.id,
      metadata: { bucket: bucketName, role: policy.role, operation: policy.operation },
    });

    return { success: true, data: created };
  }
}

export const storageEngine = StorageEngine.getInstance();
