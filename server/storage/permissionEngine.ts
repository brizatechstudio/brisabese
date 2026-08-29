import { db } from '../db/database';
import { StoragePolicyDef } from './types';
import { StoragePathUtils } from './pathUtils';
import { securityEngine } from '../security/securityEngine';

export interface StoragePermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface StoragePolicyContext {
  organizationId: string;
  projectId: string;
  environmentId: string;
  userId?: string;
  role: string;
  bucketName: string;
  path: string;
  operation: 'LIST' | 'READ' | 'INSERT' | 'UPDATE' | 'DELETE' | 'MOVE' | 'COPY' | 'CREATE_BUCKET' | 'DELETE_BUCKET' | 'SIGNED_URL';
  claims?: Record<string, unknown>;
  bypassRls?: boolean;
}

export class StoragePermissionEngine {
  private static policies = new Map<string, StoragePolicyDef[]>();

  private static getKey(projectId: string, environmentId: string, bucketName: string): string {
    return `${projectId}:${environmentId}:${bucketName.toLowerCase()}`;
  }

  public static getPolicies(projectId: string, environmentId: string, bucketName: string): StoragePolicyDef[] {
    const key = this.getKey(projectId, environmentId, bucketName);
    return this.policies.get(key) || [];
  }

  public static setPolicy(projectId: string, environmentId: string, bucketName: string, policy: Omit<StoragePolicyDef, 'id' | 'createdAt'>): StoragePolicyDef {
    const key = this.getKey(projectId, environmentId, bucketName);
    const list = this.policies.get(key) || [];
    const newPolicy: StoragePolicyDef = {
      id: `pol_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      ...policy,
      createdAt: new Date().toISOString(),
    };
    list.push(newPolicy);
    this.policies.set(key, list);
    return newPolicy;
  }

  public static getDefaultPolicies(bucketName: string): StoragePolicyDef[] {
    return [
      {
        id: `pol_default_read_${bucketName}`,
        bucketId: bucketName,
        projectId: '',
        environmentId: '',
        role: 'authenticated',
        operation: 'READ',
        pathPattern: '*',
        createdAt: new Date().toISOString(),
      },
      {
        id: `pol_default_insert_${bucketName}`,
        bucketId: bucketName,
        projectId: '',
        environmentId: '',
        role: 'authenticated',
        operation: 'INSERT',
        pathPattern: '*',
        createdAt: new Date().toISOString(),
      },
      {
        id: `pol_default_update_${bucketName}`,
        bucketId: bucketName,
        projectId: '',
        environmentId: '',
        role: 'authenticated',
        operation: 'UPDATE',
        pathPattern: '*',
        createdAt: new Date().toISOString(),
      },
      {
        id: `pol_default_delete_${bucketName}`,
        bucketId: bucketName,
        projectId: '',
        environmentId: '',
        role: 'authenticated',
        operation: 'DELETE',
        pathPattern: '*',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  public static can(ctx: StoragePolicyContext): StoragePermissionResult {
    let legacy: StoragePermissionResult;
    // Service and admin roles have elevated access
    if (ctx.role === 'service' || ctx.role === 'admin' || ctx.role === 'service_role') {
      legacy = { allowed: true };
    } else if (ctx.role === 'anon' || ctx.role === 'anonymous') {
      legacy = { allowed: false, reason: 'Anonymous users cannot access private storage.' };
    } else {
      const policies = this.getPolicies(ctx.projectId, ctx.environmentId, ctx.bucketName);
      const relevantPolicies = policies.length > 0 ? policies : this.getDefaultPolicies(ctx.bucketName);
      legacy = { allowed: false, reason: `Storage policy denied: ${ctx.operation} on ${ctx.bucketName}/${ctx.path}` };
      for (const policy of relevantPolicies) {
        if (policy.role !== '*' && policy.role !== ctx.role) continue;
        const opMatch = policy.operation === '*' || policy.operation === ctx.operation ||
          (ctx.operation === 'SIGNED_URL' && policy.operation === 'READ') ||
          (ctx.operation === 'LIST' && policy.operation === 'READ');
        if (!opMatch || !this.matchesPathPattern(ctx.path, policy.pathPattern, ctx.userId)) continue;
        legacy = { allowed: true };
        break;
      }
    }
    if (!legacy.allowed) return legacy;
    return this.canRls(ctx);
  }

  public static restorePolicies(projectId: string, environmentId: string, bucketName: string, policies: StoragePolicyDef[]): void {
    this.policies.set(this.getKey(projectId, environmentId, bucketName), JSON.parse(JSON.stringify(policies || [])));
  }

  /** Evaluates the central RLS layer; public buckets use this without inheriting private-bucket defaults. */
  public static canRls(ctx: StoragePolicyContext): StoragePermissionResult {
    const operation = ctx.operation === 'INSERT' ? 'INSERT' : ctx.operation === 'DELETE' || ctx.operation === 'DELETE_BUCKET' ? 'DELETE' : ctx.operation === 'UPDATE' || ctx.operation === 'MOVE' || ctx.operation === 'COPY' ? 'UPDATE' : 'SELECT';
    const resource = ctx.path ? `${ctx.bucketName}/${ctx.path}` : ctx.bucketName;
    const decision = securityEngine.evaluate({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      environmentId: ctx.environmentId,
      userId: ctx.userId,
      role: ctx.role === 'anon' ? 'anonymous' : ctx.role,
      claims: ctx.claims,
      bypassRls: ctx.bypassRls,
    }, 'storage', resource, operation, { path: ctx.path, owner_id: ctx.userId }, undefined, ctx.path);
    return decision.allowed ? { allowed: true } : { allowed: false, reason: decision.reason || 'Central RLS policy denied storage access.' };
  }

  public static canCreateBucket(ctx: StoragePolicyContext): StoragePermissionResult {
    if (ctx.role === 'service' || ctx.role === 'admin' || ctx.role === 'service_role') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Only service/admin roles can create buckets.' };
  }

  public static canDeleteBucket(ctx: StoragePolicyContext): StoragePermissionResult {
    if (ctx.role === 'service' || ctx.role === 'admin' || ctx.role === 'service_role') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Only service/admin roles can delete buckets.' };
  }

  public static validateMimeType(allowedMimeTypes: string[] | undefined, mimeType: string): { allowed: boolean; reason?: string } {
    if (!allowedMimeTypes || allowedMimeTypes.length === 0) return { allowed: true };
    const mimeLower = mimeType.toLowerCase();

    for (const allowed of allowedMimeTypes) {
      const allowedLower = allowed.toLowerCase();
      if (allowedLower === mimeLower) return { allowed: true };
      if (allowedLower.endsWith('/*')) {
        const prefix = allowedLower.replace('/*', '/');
        if (mimeLower.startsWith(prefix)) return { allowed: true };
      }
    }

    return { allowed: false, reason: `MIME type '${mimeType}' não permitido para este bucket.` };
  }

  public static validateFileSize(fileSizeLimit: number | undefined, sizeBytes: number): { allowed: boolean; reason?: string } {
    if (!fileSizeLimit) return { allowed: true };
    if (sizeBytes > fileSizeLimit) {
      return { allowed: false, reason: `Arquivo excede o limite de ${Math.round(fileSizeLimit / (1024 * 1024))} MB deste bucket.` };
    }
    return { allowed: true };
  }

  private static matchesPathPattern(path: string, pattern: string, userId?: string): boolean {
    if (pattern === '*' || pattern === '**') return true;
    if (!path) return false;

    // Support {userId} placeholder
    const userPattern = userId ? userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[^/]+';
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\{userId\}/g, userPattern)
      .replace(/\*/g, '.*');

    return new RegExp(`^${regexPattern}$`).test(path);
  }
}
