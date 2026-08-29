import { observability } from './observability';
import { sanitizeTelemetry } from './observability/sanitizer';

function emit(level: 'info' | 'warning' | 'error', message: string, metadata?: any): void {
  const event = level === 'error' ? 'application.error' : level === 'warning' ? 'application.warning' : 'application.log';
  const log = observability.log(level, event, message, metadata && typeof metadata === 'object' ? metadata : { detail: metadata });
  // JSON output is intentionally the final sink; the in-memory engine receives the same sanitized object.
  const line = JSON.stringify(sanitizeTelemetry(log));
  if (level === 'error') console.error(line); else if (level === 'warning') console.warn(line); else console.log(line);
}

export const logger = {
  info: (message: string, meta?: any) => emit('info', message, meta),
  warn: (message: string, meta?: any) => emit('warning', message, meta),
  error: (message: string, error?: any) => emit('error', message, error),
};
