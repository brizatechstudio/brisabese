import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { corsAndSecurityMiddleware } from '../middleware/cors';

function responseRecorder() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;
  const res = {
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), String(value)); return res; },
    status(code: number) { statusCode = code; return res; },
    json(value: unknown) { body = value; return res; },
    end() { return res; },
  } as unknown as Response;
  return { res, headers, status: () => statusCode, body: () => body };
}

function request(input: { method?: string; path?: string; headers?: Record<string, string> }): Request {
  return {
    method: input.method || 'POST',
    path: input.path || '/api/admin/auth/refresh',
    headers: input.headers || {},
    secure: false,
  } as unknown as Request;
}

{
  const recorder = responseRecorder();
  let nextCalled = false;
  corsAndSecurityMiddleware(
    request({ headers: { 'sec-fetch-site': 'cross-site' } }),
    recorder.res,
    (() => { nextCalled = true; }) as NextFunction,
  );
  assert.equal(recorder.status(), 403);
  assert.equal(nextCalled, false);
  assert.deepEqual(recorder.body(), {
    error: {
      code: 'CROSS_SITE_REQUEST_DENIED',
      message: 'Cross-site administrative refresh is not allowed.',
    },
  });
}

{
  const recorder = responseRecorder();
  let nextCalled = false;
  corsAndSecurityMiddleware(
    request({ headers: { 'sec-fetch-site': 'same-origin' } }),
    recorder.res,
    (() => { nextCalled = true; }) as NextFunction,
  );
  assert.equal(recorder.status(), 200);
  assert.equal(nextCalled, true);
}

{
  const recorder = responseRecorder();
  let nextCalled = false;
  corsAndSecurityMiddleware(
    request({ headers: {} }),
    recorder.res,
    (() => { nextCalled = true; }) as NextFunction,
  );
  assert.equal(recorder.status(), 200);
  assert.equal(nextCalled, true, 'non-browser clients without Fetch Metadata must remain compatible');
}

{
  const recorder = responseRecorder();
  let nextCalled = false;
  corsAndSecurityMiddleware(
    request({ path: '/api/admin/auth/login', headers: { 'sec-fetch-site': 'cross-site' } }),
    recorder.res,
    (() => { nextCalled = true; }) as NextFunction,
  );
  assert.equal(recorder.status(), 200);
  assert.equal(nextCalled, true, 'the Fetch Metadata rule must remain scoped to ambient refresh credentials');
}

console.log('Fetch Metadata security boundary passed.');
