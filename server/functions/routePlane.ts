export type FunctionRoutePlane = 'management' | 'invocation' | 'unknown';

/**
 * Express strips the matched prefix from `req.path` while a mounted middleware
 * runs. `originalUrl` retains the public route and is therefore the only input
 * used to decide whether a Function request belongs to the control plane or
 * the invocation data plane.
 */
export function classifyFunctionRoute(originalUrl: string): FunctionRoutePlane {
  const pathname = String(originalUrl || '').split('?', 1)[0];
  if (/^\/api\/functions(?:\/|$)/.test(pathname)) return 'management';
  if (/^\/functions\/v1(?:\/|$)/.test(pathname)) return 'invocation';
  return 'unknown';
}
