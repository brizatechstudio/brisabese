export type StorageProvider = 'local' | 's3' | 'minio' | 'r2';

export interface StorageBucketDef {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  isPublic: boolean;
  fileSizeLimit?: number;
  allowedMimeTypes?: string[];
  versioningEnabled: boolean;
  fileCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  corsConfig?: StorageCorsRule[];
  lifecycleRules?: StorageLifecycleRule[];
}


export interface StorageCorsRule {
  allowedOrigins: string[];
  allowedMethods: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE'>;
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAgeSeconds?: number;
}

export interface StorageLifecycleRule {
  id: string;
  enabled: boolean;
  prefix?: string;
  expireAfterDays?: number;
  abortIncompleteMultipartAfterDays?: number;
}

export interface StorageObjectDef {
  id: string;
  bucketId: string;
  projectId: string;
  environmentId: string;
  path: string;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  etag?: string;
  checksum?: string;
  storageKey: string;
  metadata: Record<string, any>;
  cacheControl?: string;
  contentDisposition: 'inline' | 'attachment';
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  version: number;
  deletedAt?: string;
  deletedBy?: string;
}

/** Immutable snapshot retained when a versioned object is replaced. */
export interface StorageObjectVersionDef {
  id: string;
  objectId: string;
  bucketId: string;
  projectId: string;
  environmentId: string;
  path: string;
  version: number;
  storageKey: string;
  size: number;
  mimeType: string;
  etag?: string;
  checksum?: string;
  metadata: Record<string, any>;
  createdAt: string;
  createdBy?: string;
}

export interface StorageSignedUrlDef {
  id: string;
  objectId: string;
  bucketId: string;
  projectId: string;
  environmentId: string;
  path: string;
  expiresAt: string;
  signature: string;
  createdAt: string;
}

export interface StorageUsageDef {
  projectId: string;
  environmentId: string;
  bucketId?: string;
  totalFiles: number;
  totalBytes: number;
  bucketCount: number;
  uploadedBytes: number;
  downloadedBytes: number;
  uploadsCount: number;
  downloadsCount: number;
}

export interface StoragePolicyDef {
  id: string;
  bucketId: string;
  projectId: string;
  environmentId: string;
  role: string;
  operation: 'READ' | 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  pathPattern: string;
  createdAt: string;
}

export interface StorageOpContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  apiKeyType?: 'public' | 'secret' | 'service';
  claims?: Record<string, unknown>;
  /** Valid only for trusted service executions, never derived from a browser request. */
  bypassRls?: boolean;
}

export interface StorageMultipartUploadDef {
  id: string;
  bucketId: string;
  projectId: string;
  environmentId: string;
  path: string;
  mimeType: string;
  expiresAt: string;
  createdAt: string;
  createdBy?: string;
}

export interface StorageListOptions {
  prefix?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  sort?: 'path' | 'createdAt' | 'updatedAt' | 'size';
  order?: 'asc' | 'desc';
  search?: string;
}

export interface StorageListResult {
  objects: StorageObjectDef[];
  nextCursor?: string;
  total: number;
}

export interface StorageUploadOptions {
  metadata?: Record<string, unknown>;
  cacheControl?: string;
  contentDisposition?: 'inline' | 'attachment';
  contentEncoding?: string;
  contentLanguage?: string;
}

export interface StorageImageTransformOptions {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  crop?: 'center' | 'north' | 'south' | 'east' | 'west';
  rotate?: number;
  quality?: number;
  format?: 'original' | 'webp' | 'avif' | 'jpeg' | 'png';
}

export interface StorageOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
