/**
 * Execution-plane worker. It is intentionally self-contained so the production
 * server bundle can create it with `eval: true` without relying on source files.
 */
export const functionRuntimeWorkerSource = String.raw`
const { parentPort } = require('node:worker_threads');
const vm = require('node:vm');
let rpcSequence = 0;
const pending = new Map();

function rpc(action, args) {
  const id = ++rpcSequence;
  parentPort.postMessage({ type: 'rpc', id, action, args });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function serialise(value) {
  if (value instanceof Uint8Array) return { __binary: Array.from(value) };
  return value;
}

function createDatabase() {
  return {
    from(table) {
      const state = { table, filters: [], limit: undefined, order: undefined };
      const builder = {
        eq(field, value) { state.filters.push({ field, operator: 'eq', value }); return builder; },
        neq(field, value) { state.filters.push({ field, operator: 'neq', value }); return builder; },
        gt(field, value) { state.filters.push({ field, operator: 'gt', value }); return builder; },
        gte(field, value) { state.filters.push({ field, operator: 'gte', value }); return builder; },
        lt(field, value) { state.filters.push({ field, operator: 'lt', value }); return builder; },
        lte(field, value) { state.filters.push({ field, operator: 'lte', value }); return builder; },
        limit(value) { state.limit = value; return builder; },
        order(field, options) { state.order = { field, ascending: options?.ascending !== false }; return builder; },
        select(columns = '*') { return rpc('database.select', { ...state, columns }); },
        insert(values) { return rpc('database.insert', { table, values: serialise(values) }); },
        update(id, values) { return rpc('database.update', { table, id, values: serialise(values) }); },
        delete(id) { return rpc('database.delete', { table, id }); },
      };
      return builder;
    },
  };
}

function createStorage() {
  return {
    from(bucket) {
      return {
        upload(path, data, options) { return rpc('storage.upload', { bucket, path, data: serialise(data), options }); },
        download(path) { return rpc('storage.download', { bucket, path }); },
        createSignedUrl(path, expiresIn) { return rpc('storage.signedUrl', { bucket, path, expiresIn }); },
        getPublicUrl(path) { return rpc('storage.publicUrl', { bucket, path }); },
      };
    },
  };
}

function createRequest(raw) {
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

function createContext(message) {
  const emitLog = (level, args) => parentPort.postMessage({ type: 'log', level, args: args.map(serialise) });
  return {
    database: createDatabase(),
    auth: { getUser: () => rpc('auth.getUser', {}) },
    storage: createStorage(),
    realtime: { broadcast: (channel, event, payload) => rpc('realtime.broadcast', { channel, event, payload: serialise(payload) }) },
    queue: { enqueue: (queue, payload, options) => rpc('queue.enqueue', { queue, payload: serialise(payload), options }) },
    env: Object.freeze({ ...(message.env || {}) }),
    secrets: Object.freeze({ ...(message.secrets || {}) }),
    project: Object.freeze(message.project),
    organization: Object.freeze(message.organization),
    request: createRequest(message.request),
    response: { json: (body, status = 200, headers) => ({ status, headers, body }) },
    logger: { info: (...args) => emitLog('info', args), warn: (...args) => emitLog('warn', args), error: (...args) => emitLog('error', args) },
  };
}

function safeConsole(ctx) {
  return {
    log: (...args) => ctx.logger.info(...args),
    info: (...args) => ctx.logger.info(...args),
    warn: (...args) => ctx.logger.warn(...args),
    error: (...args) => ctx.logger.error(...args),
  };
}

parentPort.on('message', async (message) => {
  if (message.type === 'rpc_result') {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    message.error ? item.reject(new Error(message.error)) : item.resolve(message.data);
    return;
  }
  if (message.type !== 'execute') return;
  try {
    const prohibited = /\b(?:require|process|child_process|worker_threads|node:|fs|net|http|https|eval|WebAssembly)\b/;
    if (prohibited.test(message.code)) throw new Error('Function source contains a prohibited runtime capability.');
    const context = createContext(message);
    const module = { exports: {} };
    const sandbox = {
      module,
      exports: module.exports,
      console: safeConsole(context),
      setTimeout,
      clearTimeout,
      TextEncoder,
      TextDecoder,
      URL,
    };
    vm.createContext(sandbox, { name: 'brisabase-function', codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script('"use strict";\n' + message.code, { filename: 'function.js' });
    script.runInContext(sandbox, { timeout: Math.min(message.timeoutMs, 1_000) });
    const handler = module.exports.default || module.exports;
    if (typeof handler !== 'function') throw new Error('Function must export a default async handler.');
    const result = await (handler.length >= 2 ? handler(createRequest(message.request), context) : handler(context));
    const response = result && typeof result === 'object' && ('status' in result || 'body' in result)
      ? { status: Number(result.status) || 200, headers: result.headers, body: result.body }
      : { status: 200, body: result };
    parentPort.postMessage({ type: 'result', response });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
});
`;
