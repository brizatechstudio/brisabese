export class StoragePathUtils {
  /**
   * Normalizes a storage path ensuring no path traversal.
   * Returns null if the path is invalid.
   */
  public static normalizePath(path: string): string | null {
    if (!path || typeof path !== 'string') return null;

    // Replace backslashes and normalize separators
    let normalized = path.replace(/\\/g, '/').trim();

    // Storage object paths are always relative to the selected bucket.
    if (normalized.startsWith('/')) return null;

    // Strip leading slashes
    normalized = normalized.replace(/^\/+/, '');

    // Reject empty path
    if (normalized.length === 0) return null;

    // Check for path traversal
    const segments = normalized.split('/');
    for (const segment of segments) {
      if (segment === '..' || segment === '.') {
        return null;
      }
      if (segment === '') {
        return null;
      }
    }

    // Block control/system paths
    if (
      normalized.startsWith('control/') ||
      normalized.startsWith('system/') ||
      normalized.startsWith('internal/') ||
      normalized.startsWith('auth/') ||
      normalized.startsWith('realtime/')
    ) {
      return null;
    }

    return normalized;
  }

  public static normalizePrefix(prefix: string): string | null {
    if (typeof prefix !== 'string') return null;
    const trimmed = prefix.replace(/\\/g, '/').trim().replace(/^\/+/, '');
    if (!trimmed) return '';
    const normalized = this.normalizePath(trimmed.endsWith('/') ? `${trimmed}__prefix__` : trimmed);
    return normalized ? (trimmed.endsWith('/') ? `${trimmed.replace(/\/+$/, '')}/` : trimmed) : null;
  }

  public static getFolderPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (!normalized) return '';
    const idx = normalized.lastIndexOf('/');
    if (idx === -1) return '';
    return normalized.substring(0, idx);
  }

  public static getFileName(path: string): string {
    const normalized = this.normalizePath(path);
    if (!normalized) return '';
    const idx = normalized.lastIndexOf('/');
    if (idx === -1) return normalized;
    return normalized.substring(idx + 1);
  }

  public static getExtension(fileName: string): string {
    const idx = fileName.lastIndexOf('.');
    if (idx === -1) return '';
    return fileName.substring(idx + 1).toLowerCase();
  }

  public static isValidBucketName(name: string): boolean {
    if (!name || typeof name !== 'string') return false;
    // Bucket names: lowercase, letters, numbers, hyphens, underscores (3-63 chars)
    return /^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/.test(name);
  }

  public static join(...parts: string[]): string {
    return parts.filter(Boolean).join('/');
  }
}
