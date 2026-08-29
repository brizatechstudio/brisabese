import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { StorageAdapter } from './storageAdapter';

export interface S3StorageOptions {
  endpoint?: string;
  region: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
}

/**
 * Small dependency-free S3-compatible adapter. It works with S3, MinIO and R2
 * through their S3 API, keeping provider credentials exclusively on the server.
 */
export class S3StorageAdapter implements StorageAdapter {
  constructor(private readonly options: S3StorageOptions) {}

  private configured(): boolean {
    return Boolean(this.options.endpoint && this.options.bucket && this.options.accessKey && this.options.secretKey);
  }

  private endpointFor(key = ''): URL {
    if (!this.options.endpoint || !this.options.bucket) throw new Error('S3 storage is not configured.');
    const endpoint = this.options.endpoint.replace(/\/$/, '');
    const [rawPath, rawQuery] = key.split('?', 2);
    const url = new URL(`${endpoint}/${encodeURIComponent(this.options.bucket)}/${rawPath.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`);
    if (rawQuery) url.search = rawQuery;
    return url;
  }

  private hmac(key: Buffer | string, value: string): Buffer {
    return crypto.createHmac('sha256', key).update(value).digest();
  }

  private async request(method: string, key = '', body?: Buffer, headers: Record<string, string> = {}): Promise<Response> {
    if (!this.configured()) throw new Error('S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY.');
    const url = this.endpointFor(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(body || Buffer.alloc(0)).digest('hex');
    const host = url.host;
    const merged = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    };
    const signedHeaderNames = Object.keys(merged).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${merged[name as keyof typeof merged].trim()}\n`).join('');
    const canonicalRequest = [method, url.pathname, url.searchParams.toString(), canonicalHeaders, signedHeaderNames.join(';'), payloadHash].join('\n');
    const scope = `${dateStamp}/${this.options.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const dateKey = this.hmac(`AWS4${this.options.secretKey}`, dateStamp);
    const regionKey = this.hmac(dateKey, this.options.region);
    const serviceKey = this.hmac(regionKey, 's3');
    const signingKey = this.hmac(serviceKey, 'aws4_request');
    const signature = this.hmac(signingKey, stringToSign).toString('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.options.accessKey}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`;
    return fetch(url, { method, headers: { ...merged, Authorization: authorization }, body: body as BodyInit | undefined });
  }

  private async expect(response: Response): Promise<void> {
    if (response.ok) return;
    const details = await response.text().catch(() => '');
    throw new Error(`S3 request failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ''}`);
  }

  public async putObject(storageKey: string, data: Buffer, mimeType: string): Promise<{ etag?: string }> {
    const response = await this.request('PUT', storageKey, data, { 'content-type': mimeType });
    await this.expect(response);
    return { etag: response.headers.get('etag')?.replaceAll('"', '') || undefined };
  }

  public async getObject(storageKey: string): Promise<Buffer | null> {
    const response = await this.request('GET', storageKey);
    if (response.status === 404) return null;
    await this.expect(response);
    return Buffer.from(await response.arrayBuffer());
  }

  public async getObjectStream(storageKey: string, range?: { start: number; end?: number }): Promise<Readable | null> {
    const rangeValue = range ? `bytes=${range.start}-${range.end ?? ''}` : undefined;
    const response = await this.request('GET', storageKey, undefined, rangeValue ? { range: rangeValue } : {});
    if (response.status === 404) return null;
    await this.expect(response);
    if (!response.body) return Readable.from([]);
    return Readable.fromWeb(response.body as any);
  }

  public async deleteObject(storageKey: string): Promise<boolean> {
    const response = await this.request('DELETE', storageKey);
    if (response.status === 404) return false;
    await this.expect(response);
    return true;
  }

  public async copyObject(sourceKey: string, destKey: string): Promise<boolean> {
    const response = await this.request('PUT', destKey, undefined, { 'x-amz-copy-source': `/${this.options.bucket}/${sourceKey}` });
    await this.expect(response);
    return true;
  }

  public async moveObject(sourceKey: string, destKey: string): Promise<boolean> {
    const copied = await this.copyObject(sourceKey, destKey);
    if (copied) await this.deleteObject(sourceKey);
    return copied;
  }

  public async headObject(storageKey: string): Promise<{ size: number; etag?: string } | null> {
    const response = await this.request('HEAD', storageKey);
    if (response.status === 404) return null;
    await this.expect(response);
    return { size: Number(response.headers.get('content-length') || 0), etag: response.headers.get('etag')?.replaceAll('"', '') || undefined };
  }

  public async listObjects(prefix: string): Promise<string[]> {
    const response = await this.request('GET', `?list-type=2&prefix=${encodeURIComponent(prefix)}`);
    await this.expect(response);
    const xml = await response.text();
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]);
  }

  public async createSignedUrl(storageKey: string, _expiresInSeconds: number): Promise<string> {
    return this.presign('GET', storageKey, _expiresInSeconds);
  }

  public async createSignedUploadUrl(storageKey: string, expiresInSeconds: number): Promise<string> {
    return this.presign('PUT', storageKey, expiresInSeconds);
  }

  private presign(method: 'GET' | 'PUT', storageKey: string, expiresInSeconds: number): string {
    if (!this.configured()) throw new Error('S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY.');
    const url = this.endpointFor(storageKey); const now = new Date(); const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const dateStamp = amzDate.slice(0, 8);
    const expires = Math.min(Math.max(Math.floor(expiresInSeconds), 1), 7 * 24 * 60 * 60); const scope = `${dateStamp}/${this.options.region}/s3/aws4_request`;
    const params = new URLSearchParams({ 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${this.options.accessKey}/${scope}`, 'X-Amz-Date': amzDate, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' });
    const canonicalQuery = [...params.entries()].sort(([left],[right]) => left.localeCompare(right)).map(([key,value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    const canonicalRequest = [method, url.pathname, canonicalQuery, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const dateKey = this.hmac(`AWS4${this.options.secretKey}`, dateStamp); const regionKey = this.hmac(dateKey, this.options.region); const serviceKey = this.hmac(regionKey, 's3'); const signingKey = this.hmac(serviceKey, 'aws4_request');
    params.set('X-Amz-Signature', this.hmac(signingKey, stringToSign).toString('hex')); url.search = params.toString(); return url.toString();
  }

  public async getHealth(): Promise<{ status: string }> {
    if (!this.configured()) return { status: 'degraded' };
    try {
      const response = await this.request('HEAD');
      return { status: response.ok || response.status === 403 ? 'ok' : 'degraded' };
    } catch {
      return { status: 'degraded' };
    }
  }
}
