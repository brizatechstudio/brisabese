import crypto from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import express from 'express';
import { verifyJwt } from '../auth/jwt';
import { db } from '../db/database';
import { storageEngine } from '../storage/storageEngine';
import { StorageImageTransformOptions, StorageListOptions, StorageOpContext } from '../storage/types';

export const storageRouter = Router();

interface StorageRequest extends Request {
  storageContext?: StorageOpContext;
}

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_STORAGE_REQUESTS_PER_MINUTE = 120;

function sendError(res: Response, code: string, message: string, status = 400) {
  return res.status(status).json({ error: { code, message } });
}

function statusFor(code?: string): number {
  if (code === 'FORBIDDEN') return 403;
  if (code === 'BUCKET_NOT_FOUND' || code === 'OBJECT_NOT_FOUND' || code === 'VERSION_NOT_FOUND') return 404;
  if (code === 'INVALID_API_KEY' || code === 'INVALID_JWT') return 401;
  if (code === 'OBJECT_EXISTS' || code === 'BUCKET_NOT_EMPTY') return 409;
  if (code === 'FILE_TOO_LARGE') return 413;
  return 400;
}

function fail(res: Response, result: { error?: { code: string; message: string } }, fallback: string) {
  return sendError(res, result.error?.code || 'STORAGE_ERROR', result.error?.message || fallback, statusFor(result.error?.code));
}

function getRawApiKey(req: Request): string | undefined {
  const headerKey = (req.headers.apikey as string) || (req.headers['x-apikey'] as string);
  if (headerKey) return headerKey;
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return undefined;
  const value = authorization.slice(7).trim();
  return /^(bb_pub_|bb_sec_|bb_srv_)/.test(value) ? value : undefined;
}

function validateContext(organizationId: string, projectId: string, environmentId: string): boolean {
  const project = db.getProjectById(projectId);
  if (!project || project.organization_id !== organizationId) return false;
  return db.getEnvironmentsByProject(project.id).some((environment) => environment.id === environmentId);
}

/** Resolves identity first; header context is only a development-dashboard fallback and is always verified against the control database. */
function storageGateway(req: StorageRequest, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || `stg_${crypto.randomBytes(8).toString('hex')}`;
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const applyRateLimit = (key: string): boolean => {
    const now = Date.now();
    const rate = rateLimits.get(key) || { count: 0, resetAt: now + 60_000 };
    if (now >= rate.resetAt) { rate.count = 0; rate.resetAt = now + 60_000; }
    rate.count += 1;
    rateLimits.set(key, rate);
    res.setHeader('X-RateLimit-Limit', MAX_STORAGE_REQUESTS_PER_MINUTE);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_STORAGE_REQUESTS_PER_MINUTE - rate.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(rate.resetAt / 1000));
    if (rate.count > MAX_STORAGE_REQUESTS_PER_MINUTE) {
      sendError(res, 'RATE_LIMITED', 'Storage request limit exceeded. Try again shortly.', 429);
      return false;
    }
    return true;
  };
  // Layer 1 is IP-only. Tenant headers are untrusted at this point.
  if (!applyRateLimit(`preauth:${req.ip || req.socket?.remoteAddress || 'unknown'}`)) return;

  let organizationId = 'org_core_1';
  let projectId = 'proj_ecommerce_1';
  let environmentId = 'env_proj_ecommerce_1_production';
  let userId: string | undefined;
  let role = 'admin'; // Existing dashboard's authenticated development session.
  let apiKeyType: StorageOpContext['apiKeyType'];
  let claims: Record<string, unknown> | undefined;
  const rawApiKey = getRawApiKey(req);
  const authorization = req.headers.authorization;

  if (rawApiKey) {
    const apiKey = db.findApiKeyByRawKey(rawApiKey);
    if (!apiKey) {
      sendError(res, 'INVALID_API_KEY', 'The API key is invalid or revoked.', 401);
      return;
    }
    const project = db.getProjectById(apiKey.project_id);
    if (!project || !apiKey.environment_id || !validateContext(project.organization_id, apiKey.project_id, apiKey.environment_id)) {
      sendError(res, 'INVALID_API_KEY', 'The API key has no valid storage context.', 401);
      return;
    }
    organizationId = project.organization_id;
    projectId = apiKey.project_id;
    environmentId = apiKey.environment_id;
    apiKeyType = apiKey.type;
    role = apiKey.type === 'service' ? 'service' : apiKey.type === 'secret' ? 'authenticated' : 'anonymous';
  } else if (authorization?.startsWith('Bearer ')) {
    try {
      const token = verifyJwt(authorization.slice(7).trim());
      const project = db.getProjectById(token.project_id);
      if (!project || !validateContext(project.organization_id, token.project_id, token.environment_id)) throw new Error('JWT storage context is invalid.');
      organizationId = project.organization_id;
      projectId = token.project_id;
      environmentId = token.environment_id;
      userId = token.sub;
      claims = Object.fromEntries(Object.entries(token).filter(([key]) => !['sub', 'role', 'project_id', 'environment_id', 'session_id', 'iat', 'exp', 'iss', 'aud'].includes(key)));
      role = token.role === 'admin' || token.role === 'owner' ? 'admin' : 'authenticated';
    } catch (error: any) {
      sendError(res, 'INVALID_JWT', error.message || 'Invalid or expired JWT.', 401);
      return;
    }
  } else {
    // The dashboard's selected context is accepted only when it maps to the same control-db organisation.
    const requestedProject = (req.headers['x-project-id'] as string) || projectId;
    const requestedEnvironment = (req.headers['x-environment-id'] as string) || environmentId;
    if (validateContext(organizationId, requestedProject, requestedEnvironment)) {
      projectId = requestedProject;
      environmentId = requestedEnvironment;
    }
    userId = 'usr_owner_1';
  }

  const principal = userId || `${role}:${req.ip || 'unknown'}`;
  if (!applyRateLimit(`scope:${organizationId}:${projectId}:${environmentId}:${principal}`)) return;
  req.storageContext = { organizationId, projectId, environmentId, userId, role, apiKeyType, claims, bypassRls: role === 'service' && req.headers['x-brisabase-service-bypass'] === 'true', ip: req.ip, userAgent: req.headers['user-agent'], requestId };
  next();
}

storageRouter.use(['/api/storage', '/storage/v1'], storageGateway);

function context(req: StorageRequest): StorageOpContext {
  return req.storageContext!;
}

function wildcardPath(req: Request): string {
  return String((req.params as Record<string, string>)[0] || '');
}

function parseRange(header: string | undefined, total: number): { start: number; end: number } | null {
  if (!header?.startsWith('bytes=')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total) return null;
  return { start, end: Math.min(end, total - 1) };
}

async function streamObject(req: StorageRequest, res: Response, ctx: StorageOpContext, bucket: string, objectPath: string): Promise<void> {
  const object = storageEngine.getObjectDefinition(ctx.projectId, ctx.environmentId, bucket, objectPath);
  if (!object) return void sendError(res, 'OBJECT_NOT_FOUND', 'Object not found.', 404);
  const rangeHeader = req.headers.range;
  const range = parseRange(rangeHeader, object.size);
  if (rangeHeader && !range) {
    res.setHeader('Content-Range', `bytes */${object.size}`);
    res.status(416).end();
    return;
  }
  const result = await storageEngine.getObjectStream(ctx, bucket, objectPath, range || undefined);
  if (!result.success || !result.data) return void fail(res, result, 'Unable to download object.');
  const length = range ? range.end - range.start + 1 : object.size;
  res.status(range ? 206 : 200);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', object.mimeType);
  res.setHeader('Content-Length', length);
  res.setHeader('Content-Disposition', `${object.contentDisposition}; filename*=UTF-8''${encodeURIComponent(object.name)}`);
  res.setHeader('Cache-Control', object.cacheControl || 'private, no-store');
  if (object.etag) res.setHeader('ETag', `"${object.etag}"`);
  if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${object.size}`);
  if (req.headers['if-none-match'] && object.etag && req.headers['if-none-match'] === object.etag) {
    res.status(304).end();
    return;
  }
  result.data.stream.on('error', () => res.destroy());
  result.data.stream.pipe(res);
}

async function streamImageTransform(req: StorageRequest, res: Response, ctx: StorageOpContext, bucket: string, objectPath: string): Promise<void> {
  const query = req.query as Record<string, string | undefined>;
  const numberOption = (value: string | undefined): number | undefined => value === undefined ? undefined : Number(value);
  const transform: StorageImageTransformOptions = {
    width: numberOption(query.width), height: numberOption(query.height), rotate: numberOption(query.rotate), quality: numberOption(query.quality),
    resize: query.resize as StorageImageTransformOptions['resize'], crop: query.crop as StorageImageTransformOptions['crop'], format: query.format as StorageImageTransformOptions['format'],
  };
  const result = await storageEngine.transformImage(ctx, bucket, objectPath, transform);
  if (!result.success || !result.data) return void fail(res, result, 'Unable to transform image.');
  res.status(200);
  res.setHeader('Content-Type', result.data.mimeType);
  res.setHeader('Content-Length', result.data.content.length);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline');
  res.end(result.data.content);
}

function parseMultipart(body: Buffer, contentType: string): { path?: string; mimeType?: string; metadata?: Record<string, unknown>; data?: Buffer } {
  const boundary = /boundary=([^;]+)/i.exec(contentType)?.[1]?.replace(/^"|"$/g, '');
  if (!boundary) return {};
  const chunks = body.toString('latin1').split(`--${boundary}`);
  const fields: Record<string, string> = {};
  let data: Buffer | undefined;
  let mimeType: string | undefined;
  for (const chunk of chunks) {
    const divider = chunk.indexOf('\r\n\r\n');
    if (divider < 0) continue;
    const headers = chunk.slice(0, divider);
    const value = chunk.slice(divider + 4).replace(/\r\n$/, '');
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    if (!name) continue;
    if (/filename="/i.test(headers)) {
      data = Buffer.from(value, 'latin1');
      mimeType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim();
    } else {
      fields[name] = value;
    }
  }
  let metadata: Record<string, unknown> | undefined;
  try { metadata = fields.metadata ? JSON.parse(fields.metadata) : undefined; } catch { metadata = undefined; }
  return { path: fields.path, mimeType: fields.mimeType || mimeType, metadata, data };
}

async function uploadFromRequest(req: StorageRequest, res: Response, bucket: string, objectPath?: string): Promise<void> {
  const contentType = String(req.headers['content-type'] || 'application/octet-stream');
  let data: Buffer | undefined;
  let path: string | undefined = objectPath || (req.headers['x-storage-path'] as string | undefined);
  let mimeType = contentType.split(';')[0] || 'application/octet-stream';
  let metadata: Record<string, unknown> | undefined;
  if (Buffer.isBuffer(req.body) && contentType.toLowerCase().startsWith('multipart/form-data')) {
    const parsed = parseMultipart(req.body, contentType);
    data = parsed.data;
    path = path || parsed.path;
    mimeType = parsed.mimeType || mimeType;
    metadata = parsed.metadata;
  } else if (Buffer.isBuffer(req.body)) {
    data = req.body;
    const rawMetadata = req.headers['x-storage-metadata'];
    try { metadata = rawMetadata ? JSON.parse(String(rawMetadata)) : undefined; } catch { return void sendError(res, 'INVALID_METADATA', 'x-storage-metadata must contain JSON.'); }
  } else if (req.body && typeof req.body === 'object') {
    path = path || req.body.path;
    mimeType = req.body.mimeType || mimeType;
    metadata = req.body.metadata;
    data = req.body.base64 ? Buffer.from(req.body.base64, 'base64') : req.body.data ? Buffer.from(req.body.data) : undefined;
  }
  if (!path || !data) return void sendError(res, 'INVALID_INPUT', 'A file path and file content are required.');
  const result = await storageEngine.uploadObject(context(req), bucket, path, data, mimeType, {
    metadata,
    cacheControl: req.headers['cache-control'] as string | undefined,
    contentDisposition: req.headers['x-content-disposition'] === 'attachment' ? 'attachment' : 'inline',
    contentEncoding: req.headers['content-encoding'] as string | undefined,
    contentLanguage: req.headers['content-language'] as string | undefined,
  });
  if (!result.success) return void fail(res, result, 'Unable to upload object.');
  res.status(201).json(result.data);
}

// Dashboard/admin API
storageRouter.get('/api/storage/health', async (_req, res) => res.json(await storageEngine.getHealth()));
storageRouter.get('/api/storage/buckets', (req: StorageRequest, res) => res.json(storageEngine.listBuckets(context(req))));
storageRouter.post('/api/storage/buckets', (req: StorageRequest, res) => {
  const result = storageEngine.createBucket(context(req), req.body || {});
  return result.success ? res.status(201).json(result.data) : fail(res, result, 'Unable to create bucket.');
});
storageRouter.patch('/api/storage/buckets/:bucketName', (req: StorageRequest, res) => {
  const result = storageEngine.updateBucket(context(req), req.params.bucketName, req.body || {});
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to update bucket.');
});
storageRouter.delete('/api/storage/buckets/:bucketName', (req: StorageRequest, res) => {
  const result = storageEngine.deleteBucket(context(req), req.params.bucketName);
  return result.success ? res.json({ success: true }) : fail(res, result, 'Unable to delete bucket.');
});
storageRouter.get('/api/storage/buckets/:bucketName/objects', (req: StorageRequest, res) => {
  const query = req.query as Record<string, string | undefined>;
  const result = storageEngine.listObjectsPage(context(req), req.params.bucketName, { prefix: query.prefix, search: query.search, cursor: query.cursor, limit: query.limit ? Number(query.limit) : undefined, offset: query.offset ? Number(query.offset) : undefined, sort: query.sort as StorageListOptions['sort'], order: query.order as StorageListOptions['order'] });
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to list objects.');
});
storageRouter.get('/api/storage/buckets/:bucketName/versions', (req: StorageRequest, res) => {
  const result = storageEngine.listObjectVersions(context(req), req.params.bucketName, String(req.query.path || ''));
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to list object versions.');
});
storageRouter.post('/api/storage/buckets/:bucketName/restore', async (req: StorageRequest, res) => {
  const path = String(req.body?.path || '');
  const result = req.body?.version === undefined
    ? storageEngine.restoreObject(context(req), req.params.bucketName, path)
    : await storageEngine.restoreObjectVersion(context(req), req.params.bucketName, path, Number(req.body.version));
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to restore object.');
});
storageRouter.post('/api/storage/buckets/:bucketName/upload', express.raw({ type: () => true, limit: '100mb' }), (req: StorageRequest, res) => void uploadFromRequest(req, res, req.params.bucketName));
storageRouter.get('/api/storage/buckets/:bucketName/render/*', (req: StorageRequest, res) => void streamImageTransform(req, res, context(req), req.params.bucketName, wildcardPath(req)));
storageRouter.get('/api/storage/buckets/:bucketName/download/*', (req: StorageRequest, res) => void streamObject(req, res, context(req), req.params.bucketName, wildcardPath(req)));
storageRouter.delete('/api/storage/buckets/:bucketName/objects/*', async (req: StorageRequest, res) => {
  const soft = req.query.soft === undefined ? undefined : String(req.query.soft).toLowerCase() !== 'false';
  const result = await storageEngine.deleteObject(context(req), req.params.bucketName, wildcardPath(req), { softDelete: soft });
  return result.success ? res.json({ success: true }) : fail(res, result, 'Unable to delete object.');
});
storageRouter.post('/api/storage/buckets/:bucketName/move', async (req: StorageRequest, res) => {
  const result = await storageEngine.moveObject(context(req), req.params.bucketName, req.body?.from, req.body?.to);
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to move object.');
});
storageRouter.post('/api/storage/buckets/:bucketName/copy', async (req: StorageRequest, res) => {
  const result = await storageEngine.copyObject(context(req), req.params.bucketName, req.body?.from, req.body?.to);
  return result.success ? res.status(201).json(result.data) : fail(res, result, 'Unable to copy object.');
});
storageRouter.post('/api/storage/signed-url', (req: StorageRequest, res) => {
  const result = storageEngine.createSignedUrl(context(req), req.body?.bucket, req.body?.path, req.body?.expiresIn);
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to create signed URL.');
});
storageRouter.post('/api/storage/signed-upload-url', (req: StorageRequest, res) => {
  const result = storageEngine.createSignedUploadUrl(context(req), req.body?.bucket, req.body?.path, req.body?.expiresIn);
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to create signed upload URL.');
});
storageRouter.get('/api/storage/usage', (req: StorageRequest, res) => res.json(storageEngine.getUsage(context(req), req.query.bucket as string | undefined)));
storageRouter.get('/api/storage/policies/:bucketName', (req: StorageRequest, res) => res.json(storageEngine.listPolicies(context(req), req.params.bucketName)));
storageRouter.post('/api/storage/policies/:bucketName', (req: StorageRequest, res) => {
  const result = storageEngine.setPolicy(context(req), req.params.bucketName, req.body || {});
  return result.success ? res.status(201).json(result.data) : fail(res, result, 'Unable to set storage policy.');
});
storageRouter.post('/api/storage/multipart', (req: StorageRequest, res) => {
  const result = storageEngine.createMultipartUpload(context(req), req.body?.bucket, req.body?.path, req.body?.mimeType || 'application/octet-stream', { metadata: req.body?.metadata });
  return result.success ? res.status(201).json(result.data) : fail(res, result, 'Unable to start multipart upload.');
});
storageRouter.put('/api/storage/multipart/:uploadId/parts/:partNumber', express.raw({ type: () => true, limit: '100mb' }), (req: StorageRequest, res) => {
  const result = storageEngine.uploadMultipartPart(context(req), req.params.uploadId, Number(req.params.partNumber), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  return result.success ? res.status(204).end() : fail(res, result, 'Unable to upload multipart part.');
});
storageRouter.post('/api/storage/multipart/:uploadId/complete', async (req: StorageRequest, res) => {
  const result = await storageEngine.completeMultipartUpload(context(req), req.params.uploadId);
  return result.success ? res.status(201).json(result.data) : fail(res, result, 'Unable to complete multipart upload.');
});
storageRouter.delete('/api/storage/multipart/:uploadId', (req: StorageRequest, res) => {
  return storageEngine.abortMultipartUpload(context(req), req.params.uploadId) ? res.status(204).end() : sendError(res, 'MULTIPART_NOT_FOUND', 'Multipart upload not found.', 404);
});

// Public and signed data-plane routes. Project/environment are explicit for public URLs; they are signed into temporary URLs.
storageRouter.get('/storage/v1/object/public/:bucket/*', (req: StorageRequest, res) => {
  const projectId = String(req.query.project || '');
  const environmentId = String(req.query.environment || '');
  const project = db.getProjectById(projectId);
  if (!project || !validateContext(project.organization_id, projectId, environmentId)) return void sendError(res, 'NOT_FOUND', 'Object not found.', 404);
  return void streamObject(req, res, { ...context(req), organizationId: project.organization_id, projectId, environmentId, role: 'anonymous', userId: undefined }, req.params.bucket, wildcardPath(req));
});
storageRouter.get('/storage/v1/object/sign/:bucket/*', (req: StorageRequest, res) => {
  const access = storageEngine.resolveAccessToken(String(req.query.token || ''), 'read');
  if (!access || access.bucketName !== req.params.bucket || access.path !== wildcardPath(req)) return void sendError(res, 'INVALID_SIGNED_URL', 'The signed URL is invalid or expired.', 403);
  return void streamObject(req, res, access.context, access.bucketName, access.path);
});
storageRouter.put('/storage/v1/object/upload/:bucket/*', express.raw({ type: () => true, limit: '100mb' }), (req: StorageRequest, res) => {
  const access = storageEngine.resolveAccessToken(String(req.query.token || ''), 'upload');
  if (!access || access.bucketName !== req.params.bucket || access.path !== wildcardPath(req)) return void sendError(res, 'INVALID_SIGNED_URL', 'The signed upload URL is invalid or expired.', 403);
  req.storageContext = access.context;
  return void uploadFromRequest(req, res, access.bucketName, access.path);
});

// Authenticated client API used by the SDK.
storageRouter.get('/storage/v1/object/list/:bucket', (req: StorageRequest, res) => {
  const query = req.query as Record<string, string | undefined>;
  const result = storageEngine.listObjectsPage(context(req), req.params.bucket, { prefix: query.prefix, search: query.search, cursor: query.cursor, limit: query.limit ? Number(query.limit) : undefined, offset: query.offset ? Number(query.offset) : undefined });
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to list objects.');
});
storageRouter.post('/storage/v1/object/signed/:bucket', (req: StorageRequest, res) => {
  const result = storageEngine.createSignedUrl(context(req), req.params.bucket, req.body?.path, req.body?.expiresIn);
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to create signed URL.');
});
storageRouter.post('/storage/v1/object/move/:bucket', async (req: StorageRequest, res) => {
  const result = await storageEngine.moveObject(context(req), req.params.bucket, req.body?.from, req.body?.to);
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to move object.');
});
storageRouter.post('/storage/v1/object/copy/:bucket', async (req: StorageRequest, res) => {
  const result = await storageEngine.copyObject(context(req), req.params.bucket, req.body?.from, req.body?.to);
  return result.success ? res.status(201).json(result.data) : fail(res, result, 'Unable to copy object.');
});
storageRouter.get('/storage/v1/object/versions/:bucket', (req: StorageRequest, res) => {
  const result = storageEngine.listObjectVersions(context(req), req.params.bucket, String(req.query.path || ''));
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to list object versions.');
});
storageRouter.post('/storage/v1/object/restore/:bucket', async (req: StorageRequest, res) => {
  const path = String(req.body?.path || '');
  const result = req.body?.version === undefined
    ? storageEngine.restoreObject(context(req), req.params.bucket, path)
    : await storageEngine.restoreObjectVersion(context(req), req.params.bucket, path, Number(req.body.version));
  return result.success ? res.json(result.data) : fail(res, result, 'Unable to restore object.');
});
storageRouter.get('/storage/v1/render/:bucket/*', (req: StorageRequest, res) => void streamImageTransform(req, res, context(req), req.params.bucket, wildcardPath(req)));
storageRouter.get('/storage/v1/object/:bucket/*', (req: StorageRequest, res) => void streamObject(req, res, context(req), req.params.bucket, wildcardPath(req)));
storageRouter.post('/storage/v1/object/:bucket/*', express.raw({ type: () => true, limit: '100mb' }), (req: StorageRequest, res) => void uploadFromRequest(req, res, req.params.bucket, wildcardPath(req)));
storageRouter.delete('/storage/v1/object/:bucket/*', async (req: StorageRequest, res) => {
  const soft = req.query.soft === undefined ? undefined : String(req.query.soft).toLowerCase() !== 'false';
  const result = await storageEngine.deleteObject(context(req), req.params.bucket, wildcardPath(req), { softDelete: soft });
  return result.success ? res.json({ success: true }) : fail(res, result, 'Unable to delete object.');
});
