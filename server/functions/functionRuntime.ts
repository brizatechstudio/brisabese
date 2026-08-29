import { Worker } from 'node:worker_threads';
import { transform } from 'esbuild';
import { functionRuntimeWorkerSource } from './runtimeWorkerSource';
import { FunctionExecutionRequest, FunctionExecutionResponse, FunctionLimits } from './types';
import { config } from '../config';
import { runtimeRpcRegistry } from './runtimeRpcRegistry';

export interface RuntimeInvocation {
  code: string;
  request: FunctionExecutionRequest;
  limits: FunctionLimits;
  env: Record<string, string>;
  secrets: Record<string, string>;
  project: { id: string; environmentId: string };
  organization: { id: string };
}

export interface RuntimeHost {
  handleRpc(action: string, args: any): Promise<any>;
  onLog(level: 'info' | 'warn' | 'error', args: any[]): void;
}

type ExecutorEnvelope = {
  response?: FunctionExecutionResponse;
  logs?: Array<{ level?: string; args?: any[] }>;
};

const railwayPrivateHostname = (hostname: string) => hostname.endsWith('.railway.internal');

function executorConfig(): { url: string; token: string } | null {
  const url = (process.env.FUNCTIONS_EXECUTOR_URL || '').replace(/\/$/, '');
  const token = process.env.FUNCTIONS_EXECUTOR_TOKEN || '';
  if (!url || Buffer.byteLength(token, 'utf8') < 32) return null;
  try {
    const parsed = new URL(url);
    const selfHostedInternal = config.production && config.deploymentMode === 'self-hosted' && parsed.protocol === 'http:' && parsed.hostname === 'functions-executor';
    const railwayInternal = config.production && config.deploymentMode === 'railway' && parsed.protocol === 'http:' && railwayPrivateHostname(parsed.hostname);
    const publicHttps = parsed.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname);
    const developmentHttp = !config.production && parsed.protocol === 'http:';
    if ((!selfHostedInternal && !railwayInternal && !publicHttps && !developmentHttp) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return { url: parsed.toString().replace(/\/$/, ''), token };
  } catch {
    return null;
  }
}

function rpcCallbackUrl(sessionId: string): string {
  const internalOrigin = String(process.env.FUNCTIONS_RPC_CALLBACK_ORIGIN || '').trim();
  if (!internalOrigin) return config.publicUrl(`/internal/functions/rpc/${encodeURIComponent(sessionId)}`);
  try {
    const origin = new URL(internalOrigin);
    const internal = config.production && config.deploymentMode === 'self-hosted' && origin.protocol === 'http:' && origin.hostname === 'brisabase';
    const railwayInternal = config.production && config.deploymentMode === 'railway' && origin.protocol === 'http:' && railwayPrivateHostname(origin.hostname);
    const publicHttps = origin.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname);
    const developmentHttp = !config.production && origin.protocol === 'http:';
    if ((!internal && !railwayInternal && !publicHttps && !developmentHttp) || !origin.hostname || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
      throw new Error('invalid');
    }
    return new URL(`/internal/functions/rpc/${encodeURIComponent(sessionId)}`, origin).toString();
  } catch {
    throw Object.assign(new Error('FUNCTIONS_RPC_CALLBACK_ORIGIN is invalid.'), { code: 'FUNCTION_RPC_CALLBACK_INVALID' });
  }
}

export class FunctionRuntime {
  public async healthCheck(): Promise<{ status: 'ok' | 'degraded'; mode: 'embedded' | 'remote'; reason?: string; details?: Record<string, unknown> }> {
    const executor = executorConfig();
    if (!config.production && !executor) return { status: 'ok', mode: 'embedded' };
    if (!executor) return { status: 'degraded', mode: 'remote', reason: 'Function executor is not configured.' };
    try {
      const response = await fetch(`${executor.url}/healthz`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(3_000) });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || payload?.status !== 'ok') return { status: 'degraded', mode: 'remote', reason: `Function executor health check failed (${response.status}).` };
      return { status: 'ok', mode: 'remote', details: { active: Number(payload.active || 0), maxConcurrency: Number(payload.maxConcurrency || 0) } };
    } catch {
      return { status: 'degraded', mode: 'remote', reason: 'Function executor is unreachable.' };
    }
  }
  /**
   * Development/test execution uses the embedded worker. Production execution
   * is always delegated to a separately deployed, credential-free executor.
   */
  public async execute(invocation: RuntimeInvocation, host: RuntimeHost): Promise<FunctionExecutionResponse> {
    if (!config.functions.enabled) {
      throw Object.assign(new Error('Function execution is disabled by configuration.'), { code: 'FUNCTION_EXECUTION_DISABLED' });
    }
    if (Buffer.byteLength(invocation.code, 'utf8') > 256 * 1024) throw new Error('Function source exceeds the 256 KB deployment limit.');
    if (config.production || executorConfig()) return this.executeRemote(invocation, host);
    return this.executeEmbedded(invocation, host);
  }

  private async executeRemote(invocation: RuntimeInvocation, host: RuntimeHost): Promise<FunctionExecutionResponse> {
    const executor = executorConfig();
    if (!executor) {
      throw Object.assign(new Error('Function execution requires FUNCTIONS_EXECUTOR_URL and a strong FUNCTIONS_EXECUTOR_TOKEN.'), { code: 'FUNCTION_EXECUTOR_NOT_CONFIGURED' });
    }

    const capability = runtimeRpcRegistry.register(host, invocation.limits.timeoutMs + 10_000);
    const callback = rpcCallbackUrl(capability.sessionId);
    try {
      const response = await fetch(`${executor.url}/invoke`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${executor.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: invocation.code,
          request: invocation.request,
          limits: invocation.limits,
          env: invocation.env,
          secrets: invocation.secrets,
          project: invocation.project,
          organization: invocation.organization,
          rpc: { url: callback, token: capability.token },
        }),
        signal: AbortSignal.timeout(invocation.limits.timeoutMs + 5_000),
      });
      const payload = await response.json().catch(() => null) as ExecutorEnvelope & { error?: { code?: string; message?: string } };
      if (!response.ok) {
        const code = payload?.error?.code || (response.status === 504 ? 'FUNCTION_TIMEOUT' : 'FUNCTION_EXECUTOR_FAILED');
        throw Object.assign(new Error(payload?.error?.message || `Function executor failed (${response.status}).`), { code });
      }
      if (!payload?.response || typeof payload.response.status !== 'number') {
        throw Object.assign(new Error('Function executor returned an invalid response.'), { code: 'FUNCTION_EXECUTOR_PROTOCOL_ERROR' });
      }
      for (const entry of payload.logs || []) {
        const level = entry.level === 'warn' || entry.level === 'error' ? entry.level : 'info';
        host.onLog(level, Array.isArray(entry.args) ? entry.args : []);
      }
      return payload.response;
    } catch (error: any) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw Object.assign(new Error('Function execution timed out.'), { code: 'FUNCTION_TIMEOUT' });
      }
      if (error?.code) throw error;
      throw Object.assign(new Error('Function executor is unavailable.'), { code: 'FUNCTION_EXECUTOR_UNAVAILABLE' });
    } finally {
      runtimeRpcRegistry.release(capability.sessionId);
    }
  }

  private async executeEmbedded(invocation: RuntimeInvocation, host: RuntimeHost): Promise<FunctionExecutionResponse> {
    const compiled = await transform(invocation.code, {
      loader: 'ts',
      format: 'cjs',
      target: 'es2022',
      platform: 'neutral',
      sourcemap: false,
      legalComments: 'none',
    });

    return new Promise<FunctionExecutionResponse>((resolve, reject) => {
      const worker = new Worker(functionRuntimeWorkerSource, {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: invocation.limits.memoryMb },
      });
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void worker.terminate();
        callback();
      };
      const timeout = setTimeout(() => finish(() => reject(Object.assign(new Error('Function execution timed out.'), { code: 'FUNCTION_TIMEOUT' }))), invocation.limits.timeoutMs);

      worker.on('message', async (message: any) => {
        if (message.type === 'rpc') {
          try {
            const data = await host.handleRpc(message.action, message.args);
            worker.postMessage({ type: 'rpc_result', id: message.id, data });
          } catch (error: any) {
            worker.postMessage({ type: 'rpc_result', id: message.id, error: error?.message || 'Runtime context request failed.' });
          }
          return;
        }
        if (message.type === 'log') {
          host.onLog(message.level, message.args || []);
          return;
        }
        if (message.type === 'result') finish(() => resolve(message.response));
        if (message.type === 'error') finish(() => reject(new Error(message.error || 'Function execution failed.')));
      });
      worker.once('error', (error) => finish(() => reject(error)));
      worker.once('exit', (code) => {
        if (code !== 0 && !settled) finish(() => reject(new Error(`Function runtime exited unexpectedly (${code}).`)));
      });
      worker.postMessage({
        type: 'execute',
        code: compiled.code,
        timeoutMs: invocation.limits.timeoutMs,
        request: invocation.request,
        env: invocation.env,
        secrets: invocation.secrets,
        project: invocation.project,
        organization: invocation.organization,
      });
    });
  }
}

export const functionRuntime = new FunctionRuntime();
