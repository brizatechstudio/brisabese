import crypto from 'node:crypto';
import { Router } from 'express';
import { runtimeRpcRegistry } from '../functions/runtimeRpcRegistry';

export const functionExecutorRpcRouter = Router();

const ALLOWED_ACTIONS = new Set([
  'database.select',
  'database.insert',
  'database.update',
  'database.delete',
  'storage.upload',
  'storage.download',
  'storage.signedUrl',
  'storage.publicUrl',
  'auth.getUser',
  'realtime.broadcast',
  'queue.enqueue',
]);

function equalSecret(left: string, right: string): boolean {
  const a = crypto.createHash('sha256').update(left).digest();
  const b = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(a, b);
}

function executorAuthorized(req: any): boolean {
  const configured = process.env.FUNCTIONS_EXECUTOR_TOKEN || '';
  if (Buffer.byteLength(configured, 'utf8') < 32) return false;
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  return equalSecret(authorization.slice(7).trim(), configured);
}

function error(res: any, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

functionExecutorRpcRouter.post('/internal/functions/rpc/:sessionId', async (req, res) => {
  if (!executorAuthorized(req)) return error(res, 401, 'FUNCTION_EXECUTOR_UNAUTHORIZED', 'Executor authentication failed.');
  const capability = String(req.headers['x-function-rpc-token'] || '');
  const action = String(req.body?.action || '');
  if (!capability) return error(res, 401, 'FUNCTION_RPC_CAPABILITY_REQUIRED', 'Function RPC capability is required.');
  if (!ALLOWED_ACTIONS.has(action)) return error(res, 403, 'FUNCTION_RPC_ACTION_FORBIDDEN', 'Function RPC action is not allowed.');
  try {
    const data = await runtimeRpcRegistry.invoke(req.params.sessionId, capability, action, req.body?.args);
    return res.json({ data });
  } catch (cause: any) {
    const code = cause?.code || 'FUNCTION_RPC_FAILED';
    const status = code === 'FUNCTION_RPC_FORBIDDEN' ? 403 : code === 'FUNCTION_RPC_EXPIRED' ? 410 : code === 'FUNCTION_RPC_LIMIT' ? 429 : 400;
    return error(res, status, code, cause?.message || 'Function RPC failed.');
  }
});
