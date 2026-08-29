import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { StorageAdapter } from './storageAdapter';
import { logger } from '../logger';

export class LocalStorageAdapter implements StorageAdapter {
  private rootDir: string;

  constructor(storageDir?: string) {
    this.rootDir = storageDir || path.join(process.cwd(), 'server', 'storage', 'data');
    fs.mkdirSync(this.rootDir, { recursive: true });
    logger.info(`Local Storage Adapter initialized at ${this.rootDir}`);
  }

  private resolveKey(storageKey: string): string {
    const safeKey = storageKey.replace(/[^a-zA-Z0-9/_\-.]/g, '_');
    const fullPath = path.join(this.rootDir, safeKey);
    const resolved = path.resolve(fullPath);
    const root = path.resolve(this.rootDir);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('Invalid storage key: path traversal detected.');
    }
    return resolved;
  }

  public async putObject(storageKey: string, data: Buffer, _mimeType: string): Promise<{ etag?: string }> {
    const fullPath = this.resolveKey(storageKey);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, data);
    const etag = crypto.createHash('md5').update(data).digest('hex');
    return { etag };
  }

  public async getObject(storageKey: string): Promise<Buffer | null> {
    const fullPath = this.resolveKey(storageKey);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath);
  }

  public async getObjectStream(storageKey: string, range?: { start: number; end?: number }): Promise<Readable | null> {
    const fullPath = this.resolveKey(storageKey);
    if (!fs.existsSync(fullPath)) return null;
    return fs.createReadStream(fullPath, range ? { start: range.start, end: range.end } : undefined);
  }

  public async deleteObject(storageKey: string): Promise<boolean> {
    const fullPath = this.resolveKey(storageKey);
    if (!fs.existsSync(fullPath)) return false;
    fs.unlinkSync(fullPath);
    return true;
  }

  public async copyObject(sourceKey: string, destKey: string): Promise<boolean> {
    const src = this.resolveKey(sourceKey);
    const dest = this.resolveKey(destKey);
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return true;
  }

  public async moveObject(sourceKey: string, destKey: string): Promise<boolean> {
    const src = this.resolveKey(sourceKey);
    const dest = this.resolveKey(destKey);
    if (!fs.existsSync(src)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
    return true;
  }

  public async headObject(storageKey: string): Promise<{ size: number; etag?: string } | null> {
    const fullPath = this.resolveKey(storageKey);
    if (!fs.existsSync(fullPath)) return null;
    const stats = fs.statSync(fullPath);
    const data = fs.readFileSync(fullPath);
    return {
      size: stats.size,
      etag: crypto.createHash('md5').update(data).digest('hex'),
    };
  }

  public async listObjects(prefix: string): Promise<string[]> {
    const prefixPath = this.resolveKey(prefix || '.');
    const results: string[] = [];
    if (!fs.existsSync(prefixPath)) return results;

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          results.push(path.relative(this.rootDir, fullPath).replace(/\\/g, '/'));
        }
      }
    };

    walk(prefixPath);
    return results;
  }

  public async createSignedUrl(_storageKey: string, _expiresInSeconds: number): Promise<string> {
    // For local adapter, signed URL is a direct link (development only)
    return '/storage/v1/object/local/';
  }

  public async createSignedUploadUrl(_storageKey: string, _expiresInSeconds: number): Promise<string> {
    return '/storage/v1/object/upload-local/';
  }

  public async getHealth(): Promise<{ status: string }> {
    try {
      fs.accessSync(this.rootDir, fs.constants.W_OK);
      return { status: 'ok' };
    } catch {
      return { status: 'degraded' };
    }
  }
}
