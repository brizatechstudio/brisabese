import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fork, ChildProcess } from 'node:child_process';
import { transform } from 'esbuild';

const PORT = Number(process.env.PORT || process.env.FUNCTIONS_EXECUTOR_PORT || 3100);
const EXECUTOR_TOKEN = process.env.FUNCTIONS_EXECUTOR_TOKEN || '';
const API_ORIGIN = process.env.FUNCTIONS_API_ORIGIN || '';
const MAX_CONCURRENCY = Math.min(Math.max(Number(process.env.FUNCTIONS_EXECUTOR_MAX_CONCURRENCY || 10), 1), 100);
const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_LOG_ENTRIES = 200;
let active = 0;

type ExecutorLog = { level: 'info' | 'warn' | 'error'; args: unknown[] };
type ExecutorEnvelope = { response: any; logs: ExecutorLog[] };

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function equalSecret(left: string, right: string): boolean {
  return crypto.timingSafeEqual(digest(left), digest(right));
}

function configured(): void {
  if (process.env.NODE_ENV === 'production') {
    if (Buffer.byteLength(EXECUTOR_TOKEN, 'utf8') < 32) throw new Error('FUNCTIONS_EXECUTOR_TOKEN must contain at least 32 bytes.');
    const origin = new URL(API_ORIGIN);
    const privateNetwork = process.env.FUNCTIONS_EXECUTOR_PRIVATE_NETWORK === 'true';
    const internal = privateNetwork && origin.protocol === 'http:' && origin.hostname === 'brisabase';
    const publicHttps = origin.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname);
    if ((!internal && !publicHttps) || !origin.hostname || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('FUNCTIONS_API_ORIGIN must be a public HTTPS origin or the private BrisaBase service origin when FUNCTIONS_EXECUTOR_PRIVATE_NETWORK=true.');
  }
}

function authorize(req: express.Request): boolean {
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') && Buffer.byteLength(EXECUTOR_TOKEN, 'utf8') >= 32 && equalSecret(auth.slice(7).trim(), EXECUTOR_TOKEN);
}

function validCallback(raw: string): URL {
  const callback = new URL(raw);
  const expected = new URL(API_ORIGIN);
  if (callback.origin !== expected.origin || !callback.pathname.startsWith('/internal/functions/rpc/') || callback.search || callback.hash || callback.username || callback.password) {
    throw new Error('Function RPC callback is outside the configured API origin.');
  }
  return callback;
}

function childPath(): string {
  return process.env.FUNCTIONS_EXECUTOR_CHILD_PATH || path.join(process.cwd(), 'dist', 'server', 'functions-executor-child.cjs');
}

async function rpc(callback: URL, capability: string, action: string, args: unknown): Promise<unknown> {
  const response = await fetch(callback, {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${EXECUTOR_TOKEN}`,
      'X-Function-RPC-Token': capability,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(payload?.error?.message || `Function RPC failed (${response.status}).`);
  return payload?.data;
}

async function execute(body: any): Promise<ExecutorEnvelope> {
  const source = String(body?.code || '');
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) throw Object.assign(new Error('Function source is empty or exceeds the 256 KB limit.'), { status: 400 });
  const timeoutMs = Math.min(Math.max(Number(body?.limits?.timeoutMs || 30_000), 1_000), 60_000);
  const memoryMb = Math.min(Math.max(Number(body?.limits?.memoryMb || 256), 128), 1024);
  const callback = validCallback(String(body?.rpc?.url || ''));
  const capability = String(body?.rpc?.token || '');
  if (Buffer.byteLength(capability, 'utf8') < 32) throw Object.assign(new Error('Function RPC capability is invalid.'), { status: 400 });

  const compiled = await transform(source, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2022',
    platform: 'neutral',
    sourcemap: false,
    legalComments: 'none',
  });

  return new Promise<ExecutorEnvelope>((resolve, reject) => {
    const logs: ExecutorLog[] = [];
    const child: ChildProcess = fork(childPath(), [], {
      execArgv: [`--max-old-space-size=${memoryMb}`],
      env: {
        NODE_ENV: 'production',
        BRISABASE_FUNCTION_CHILD: 'true',
        LANG: 'C.UTF-8',
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      detached: false,
    });
    let settled = false;
    const finish = (callbackFn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!child.killed) child.kill('SIGKILL');
      callbackFn();
    };
    const timer = setTimeout(() => finish(() => reject(Object.assign(new Error('Function execution timed out.'), { status: 504, code: 'FUNCTION_TIMEOUT' }))), timeoutMs + 500);

    child.on('message', (message: any) => {
      if (message?.type === 'rpc') {
        void rpc(callback, capability, String(message.action || ''), message.args)
          .then((data) => child.connected && child.send({ type: 'rpc_result', id: message.id, data }))
          .catch((error) => child.connected && child.send({ type: 'rpc_result', id: message.id, error: error instanceof Error ? error.message : String(error) }));
        return;
      }
      if (message?.type === 'log') {
        if (logs.length < MAX_LOG_ENTRIES) {
          const level = message.level === 'warn' || message.level === 'error' ? message.level : 'info';
          logs.push({ level, args: Array.isArray(message.args) ? message.args : [message.args] });
        }
        return;
      }
      if (message?.type === 'result') finish(() => resolve({ response: message.response, logs }));
      if (message?.type === 'error') finish(() => reject(Object.assign(new Error(String(message.error || 'Function execution failed.')), { status: 400 })));
    });
    child.once('error', (error) => finish(() => reject(error)));
    child.once('exit', (code, signal) => {
      if (!settled) finish(() => reject(new Error(`Function child exited unexpectedly (${code ?? signal ?? 'unknown'}).`)));
    });
    child.send?.({
      type: 'execute',
      code: compiled.code,
      timeoutMs,
      request: body?.request || {},
      env: body?.env || {},
      secrets: body?.secrets || {},
      project: body?.project || {},
      organization: body?.organization || {},
    });
  });
}

configured();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY_BYTES }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'brisabase-functions-executor', active, maxConcurrency: MAX_CONCURRENCY });
});

app.post('/invoke', async (req, res) => {
  if (!authorize(req)) return res.status(401).json({ error: { code: 'EXECUTOR_UNAUTHORIZED', message: 'Executor authentication failed.' } });
  if (active >= MAX_CONCURRENCY) return res.status(429).json({ error: { code: 'EXECUTOR_BUSY', message: 'Function executor concurrency limit reached.' } });
  active += 1;
  try {
    return res.json(await execute(req.body));
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = status >= 500 && status !== 504 ? 'Function executor failed.' : error?.message || 'Function executor failed.';
    return res.status(status).json({ error: { code: error?.code || 'EXECUTOR_FAILED', message } });
  } finally {
    active -= 1;
  }
});

app.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`${JSON.stringify({ level: 'info', service: 'functions-executor', port: PORT })}\n`);
});
