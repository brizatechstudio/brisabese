import { StorageObjectDef } from './types';
import { Readable } from 'node:stream';

export interface StorageAdapter {
  putObject(storageKey: string, data: Buffer, mimeType: string): Promise<{ etag?: string }>;
  getObject(storageKey: string): Promise<Buffer | null>;
  getObjectStream(storageKey: string, range?: { start: number; end?: number }): Promise<Readable | null>;
  deleteObject(storageKey: string): Promise<boolean>;
  copyObject(sourceKey: string, destKey: string): Promise<boolean>;
  moveObject(sourceKey: string, destKey: string): Promise<boolean>;
  headObject(storageKey: string): Promise<{ size: number; etag?: string } | null>;
  listObjects(prefix: string): Promise<string[]>;
  createSignedUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
  createSignedUploadUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
  getHealth(): Promise<{ status: string }>;
}
