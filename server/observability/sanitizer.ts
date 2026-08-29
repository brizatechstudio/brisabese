const SENSITIVE = /password|pass_hash|token|jwt|authorization|api[_-]?key|secret|refresh|mfa|recovery|cookie|private[_-]?key/i;

/** Removes credentials recursively before any telemetry leaves the calling module. */
export function sanitizeTelemetry<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeTelemetry(item, depth + 1)) as T;
  if (typeof value !== 'object') return value;
  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    clean[key] = SENSITIVE.test(key) ? '[REDACTED]' : sanitizeTelemetry(entry, depth + 1);
  }
  return clean as T;
}
