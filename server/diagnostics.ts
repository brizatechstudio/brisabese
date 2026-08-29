const CONNECTION_URL = /\b(?:postgres(?:ql)?|redis|rediss|https?|s3):\/\/[^\s'"\])}]+/gi;
const ASSIGNMENT = /\b([A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)=([^\s,;]+)/gi;

/** Removes credentials from errors before they are written to production logs. */
export function redactDiagnosticText(value: string): string {
  return value
    .replace(CONNECTION_URL, (raw) => {
      try {
        const url = new URL(raw);
        return `${url.protocol}//${url.host}${url.pathname}`;
      } catch {
        return '[REDACTED_URL]';
      }
    })
    .replace(ASSIGNMENT, '$1=[REDACTED]');
}

export function safeErrorMetadata(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: redactDiagnosticText(String(error)) };
  const details: Record<string, unknown> = {
    name: error.name,
    message: redactDiagnosticText(error.message),
  };
  if (error.stack) details.stack = redactDiagnosticText(error.stack);
  const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined;
  if (cause !== undefined && depth < 2) details.cause = safeErrorMetadata(cause, depth + 1);
  return details;
}
