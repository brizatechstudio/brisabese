import vm from 'node:vm';

let rpcSequence = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

function send(message: any): void {
  if (process.send) process.send(message);
}

function serialise(value: any): any {
  if (value instanceof Uint8Array) return { __binary: Array.from(value) };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialise(item)]));
  return value;
}

function rpc(action: string, args: any): Promise<any> {
  const id = ++rpcSequence;
  send({ type: 'rpc', id, action, args: serialise(args) });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function database() {
  return {
    from(table: string) {
      const state: any = { table, filters: [], limit: undefined, order: undefined };
      const builder: any = {
        eq(field: string, value: unknown) { state.filters.push({ field, operator: 'eq', value }); return builder; },
        neq(field: string, value: unknown) { state.filters.push({ field, operator: 'neq', value }); return builder; },
        gt(field: string, value: unknown) { state.filters.push({ field, operator: 'gt', value }); return builder; },
        gte(field: string, value: unknown) { state.filters.push({ field, operator: 'gte', value }); return builder; },
        lt(field: string, value: unknown) { state.filters.push({ field, operator: 'lt', value }); return builder; },
        lte(field: string, value: unknown) { state.filters.push({ field, operator: 'lte', value }); return builder; },
        limit(value: number) { state.limit = value; return builder; },
        order(field: string, options?: { ascending?: boolean }) { state.order = { field, ascending: options?.ascending !== false }; return builder; },
        select(columns = '*') { return rpc('database.select', { ...state, columns }); },
        insert(values: unknown) { return rpc('database.insert', { table, values: serialise(values) }); },
        update(id: unknown, values: unknown) { return rpc('database.update', { table, id, values: serialise(values) }); },
        delete(id: unknown) { return rpc('database.delete', { table, id }); },
      };
      return builder;
    },
  };
}

function storage() {
  return {
    from(bucket: string) {
      return {
        upload(path: string, data: unknown, options?: unknown) { return rpc('storage.upload', { bucket, path, data: serialise(data), options }); },
        download(path: string) { return rpc('storage.download', { bucket, path }); },
        createSignedUrl(path: string, expiresIn?: number) { return rpc('storage.signedUrl', { bucket, path, expiresIn }); },
        getPublicUrl(path: string) { return rpc('storage.publicUrl', { bucket, path }); },
      };
    },
  };
}

function request(raw: any) {
  return {
    method: raw.method,
    path: raw.path,
    headers: raw.headers || {},
    query: raw.query || {},
    body: raw.body,
    json: async () => raw.body,
    text: async () => typeof raw.body === 'string' ? raw.body : JSON.stringify(raw.body ?? ''),
  };
}

function executionContext(message: any) {
  const emit = (level: string, args: unknown[]) => send({ type: 'log', level, args: args.map(serialise) });
  return {
    database: database(),
    auth: { getUser: () => rpc('auth.getUser', {}) },
    storage: storage(),
    realtime: { broadcast: (channel: string, event: string, payload: unknown) => rpc('realtime.broadcast', { channel, event, payload: serialise(payload) }) },
    queue: { enqueue: (queue: string, payload: unknown, options?: unknown) => rpc('queue.enqueue', { queue, payload: serialise(payload), options }) },
    env: Object.freeze({ ...(message.env || {}) }),
    secrets: Object.freeze({ ...(message.secrets || {}) }),
    project: Object.freeze({ ...(message.project || {}) }),
    organization: Object.freeze({ ...(message.organization || {}) }),
    request: request(message.request || {}),
    response: { json: (body: unknown, status = 200, headers?: Record<string, string>) => ({ status, headers, body }) },
    logger: { info: (...args: unknown[]) => emit('info', args), warn: (...args: unknown[]) => emit('warn', args), error: (...args: unknown[]) => emit('error', args) },
  };
}

function consoleFor(ctx: any) {
  return {
    log: (...args: unknown[]) => ctx.logger.info(...args),
    info: (...args: unknown[]) => ctx.logger.info(...args),
    warn: (...args: unknown[]) => ctx.logger.warn(...args),
    error: (...args: unknown[]) => ctx.logger.error(...args),
  };
}

async function execute(message: any): Promise<void> {
  try {
    const prohibited = /\b(?:require|process|child_process|worker_threads|node:|fs|net|http|https|eval|WebAssembly)\b/;
    if (prohibited.test(String(message.code || ''))) throw new Error('Function source contains a prohibited runtime capability.');
    const ctx = executionContext(message);
    const module = { exports: {} as any };
    const sandbox = {
      module,
      exports: module.exports,
      console: consoleFor(ctx),
      setTimeout,
      clearTimeout,
      TextEncoder,
      TextDecoder,
      URL,
    };
    vm.createContext(sandbox, { name: 'brisabase-function', codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script(`"use strict";\n${String(message.code || '')}`, { filename: 'function.js' });
    script.runInContext(sandbox, { timeout: Math.min(Number(message.timeoutMs) || 1000, 1_000) });
    const handler = module.exports.default || module.exports;
    if (typeof handler !== 'function') throw new Error('Function must export a default async handler.');
    const result = await (handler.length >= 2 ? handler(request(message.request || {}), ctx) : handler(ctx));
    const response = result && typeof result === 'object' && ('status' in result || 'body' in result)
      ? { status: Number(result.status) || 200, headers: result.headers, body: serialise(result.body) }
      : { status: 200, body: serialise(result) };
    send({ type: 'result', response });
  } catch (error) {
    send({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}

process.on('message', (message: any) => {
  if (message?.type === 'rpc_result') {
    const item = pending.get(Number(message.id));
    if (!item) return;
    pending.delete(Number(message.id));
    if (message.error) item.reject(new Error(String(message.error)));
    else item.resolve(message.data);
    return;
  }
  if (message?.type === 'execute') void execute(message);
});

process.on('uncaughtException', (error) => {
  send({ type: 'error', error: error.message });
  process.exitCode = 1;
});

process.on('unhandledRejection', (error) => {
  send({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
