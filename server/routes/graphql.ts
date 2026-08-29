import crypto from 'node:crypto';
import { Router } from 'express';
import { ApiGateway, ApiGatewayRequest } from '../apiEngine/apiGateway';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { securityEngine } from '../security/securityEngine';
import { postgresCdc } from '../realtime/postgresCdc';
import { controlRepository } from '../db/controlRepository';
import { postgres } from '../db/postgres';
import { parseGraphql, resolveGraphqlValue, GraphqlField, GraphqlOperation, GraphqlParseError } from '../graphql/parser';

export const graphqlRouter = Router();
graphqlRouter.use('/graphql/v1', ApiGateway.corsAndHeadersMiddleware, ApiGateway.gatewayMiddleware);

type ApiFailure = Error & { code?: string };
type ApiFilter = { field: string; operator: string; value: unknown };
type ApiSort = { field: string; order: 'asc' | 'desc' };

const MAX_GRAPHQL_COMPLEXITY = 500;

function operationComplexity(operation: GraphqlOperation, variables: Record<string, unknown>): number {
  const fieldCost = (field: GraphqlField, depth: number): number => {
    const multiplier = Math.max(1, depth);
    const nested = field.selections.reduce((sum, child) => sum + fieldCost(child, depth + 1), 0);
    const byPk = field.name.endsWith('_by_pk') || field.name === '__typename';
    let listPenalty = byPk ? 1 : 3;
    if (depth === 1 && operation.type === 'query' && !byPk) {
      const args = argumentsOf(field, variables);
      const requested = args.limit === undefined ? 50 : Math.min(Math.max(Number(args.limit) || 1, 1), 1000);
      listPenalty *= Math.max(1, Math.ceil(requested / 25));
    }
    return multiplier * listPenalty + nested;
  };
  return operation.selections.reduce((sum, field) => sum + fieldCost(field, 1), 0);
}

async function persistedQuery(req: ApiGatewayRequest, rawQuery: string): Promise<{ query: string; hash?: string; persisted: boolean }> {
  const extension = req.body?.extensions?.persistedQuery;
  if (!extension) return { query: rawQuery, persisted: false };
  if (Number(extension.version) !== 1) fail('PERSISTED_QUERY_VERSION_UNSUPPORTED', 'Only persisted query version 1 is supported.');
  const hash = String(extension.sha256Hash || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) fail('PERSISTED_QUERY_HASH_INVALID', 'extensions.persistedQuery.sha256Hash must be a SHA-256 hex digest.');
  const ctx = req.apiContext!;
  if (rawQuery) {
    const actual = crypto.createHash('sha256').update(rawQuery).digest('hex');
    if (actual !== hash) fail('PERSISTED_QUERY_HASH_MISMATCH', 'Persisted query hash does not match the GraphQL document.');
    const existing = await postgres.query<{ id: string }>('SELECT id FROM graphql_persisted_queries WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND sha256_hash=$4', [ctx.organizationId, ctx.projectId, ctx.environmentId, hash]);
    if (!existing[0]) {
      const count = await postgres.query<{ count: string }>('SELECT count(*)::text AS count FROM graphql_persisted_queries WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3', [ctx.organizationId, ctx.projectId, ctx.environmentId]);
      if (Number(count[0]?.count || 0) >= 1000) fail('PERSISTED_QUERY_LIMIT', 'This project environment already has the maximum of 1000 persisted queries.');
    }
    await postgres.execute(
      `INSERT INTO graphql_persisted_queries(id,organization_id,project_id,environment_id,sha256_hash,query_text,operation_name,created_by,use_count,last_used_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,now())
       ON CONFLICT(organization_id,project_id,environment_id,sha256_hash) DO UPDATE SET query_text=EXCLUDED.query_text,operation_name=EXCLUDED.operation_name,last_used_at=now(),use_count=graphql_persisted_queries.use_count+1`,
      [`gpq_${hash.slice(0,24)}`, ctx.organizationId, ctx.projectId, ctx.environmentId, hash, rawQuery, req.body?.operationName ? String(req.body.operationName) : null, ctx.userId || ctx.callerRole],
    );
    return { query: rawQuery, hash, persisted: true };
  }
  const rows = await postgres.query<{ query_text: string }>('SELECT query_text FROM graphql_persisted_queries WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND sha256_hash=$4', [ctx.organizationId, ctx.projectId, ctx.environmentId, hash]);
  if (!rows[0]) fail('PERSISTED_QUERY_NOT_FOUND', 'Persisted query was not found for this project environment.');
  await postgres.execute('UPDATE graphql_persisted_queries SET last_used_at=now(),use_count=use_count+1 WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND sha256_hash=$4', [ctx.organizationId, ctx.projectId, ctx.environmentId, hash]);
  return { query: rows[0].query_text, hash, persisted: true };
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

function errorPayload(error: unknown, requestId?: string) {
  const e = error as ApiFailure;
  const code = e.code || (e instanceof GraphqlParseError ? 'GRAPHQL_PARSE_ERROR' : 'GRAPHQL_EXECUTION_ERROR');
  return { message: e.message || 'GraphQL operation failed.', extensions: { code, requestId } };
}

function pick(value: any, fields: GraphqlField[]): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => pick(item, fields));
  if (!fields.length || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name === '__typename') { output[field.alias || field.name] = 'BrisaBaseRecord'; continue; }
    if (!(field.name in value)) continue;
    const nested = value[field.name];
    output[field.alias || field.name] = field.selections.length ? pick(nested, field.selections) : nested;
  }
  return output;
}

function argumentsOf(field: GraphqlField, variables: Record<string, unknown>): Record<string, any> {
  return Object.fromEntries(Object.entries(field.arguments).map(([key, value]) => [key, resolveGraphqlValue(value, variables)]));
}

function parseWhere(input: unknown, validColumns: Set<string>): ApiFilter[] {
  if (input === undefined || input === null) return [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('GRAPHQL_BAD_USER_INPUT', 'where must be an object.');
  const filters: ApiFilter[] = [];
  for (const [field, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!validColumns.has(field)) fail('GRAPHQL_INVALID_COLUMN', `Unknown filter column '${field}'.`);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length !== 1) fail('GRAPHQL_BAD_USER_INPUT', `Filter '${field}' must contain exactly one operator.`);
      const [operator, value] = entries[0];
      if (!['eq','neq','gt','gte','lt','lte','like','ilike','contains','starts_with','ends_with','in','is','isnull'].includes(operator)) fail('GRAPHQL_BAD_USER_INPUT', `Unsupported filter operator '${operator}'.`);
      filters.push({ field, operator, value });
    } else filters.push({ field, operator: 'eq', value: raw });
  }
  return filters;
}

function parseOrderBy(input: unknown, validColumns: Set<string>): ApiSort[] {
  if (input === undefined || input === null) return [];
  const values = Array.isArray(input) ? input : [input];
  if (values.length > 10) fail('GRAPHQL_BAD_USER_INPUT', 'orderBy supports at most 10 fields.');
  return values.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('GRAPHQL_BAD_USER_INPUT', 'orderBy entries must be objects.');
    const field = String((item as any).field || '');
    const direction = String((item as any).direction || 'ASC').toUpperCase();
    if (!validColumns.has(field)) fail('GRAPHQL_INVALID_COLUMN', `Unknown orderBy column '${field}'.`);
    if (!['ASC', 'DESC'].includes(direction)) fail('GRAPHQL_BAD_USER_INPUT', 'orderBy direction must be ASC or DESC.');
    return { field, order: direction.toLowerCase() as 'asc' | 'desc' };
  });
}

function validateObject(value: unknown, validColumns: Set<string>, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('GRAPHQL_BAD_USER_INPUT', `${name} must be an object.`);
  const output = value as Record<string, unknown>;
  const invalid = Object.keys(output).find((key) => !validColumns.has(key));
  if (invalid) fail('GRAPHQL_INVALID_COLUMN', `Unknown column '${invalid}'.`);
  return output;
}

function pgType(type: string): string {
  if (type === 'boolean') return 'Boolean';
  if (type === 'integer' || type === 'bigint') return 'Int';
  if (type === 'numeric' || type === 'real') return 'Float';
  return 'String';
}

async function sdl(req: ApiGatewayRequest): Promise<string> {
  const tables = await realProjectDatabase.listTables(req.apiContext!);
  const typeDefs = tables.map((table) => `type ${table.name} {\n${table.columns.map((column) => `  ${column.name}: ${pgType(column.type)}${column.isNullable === false ? '!' : ''}`).join('\n')}\n}`).join('\n\n');
  const queryFields = tables.flatMap((table) => [
    `  ${table.name}(limit: Int, offset: Int, where: JSON, orderBy: JSON): [${table.name}!]!`,
    `  ${table.name}_by_pk(id: ID!): ${table.name}`,
  ]).join('\n');
  const mutationFields = tables.flatMap((table) => [
    `  insert_${table.name}(object: JSON!): ${table.name}!`,
    `  update_${table.name}(id: ID!, patch: JSON!): ${table.name}`,
    `  delete_${table.name}(id: ID!): ${table.name}`,
  ]).join('\n');
  return `scalar JSON\n\n${typeDefs}\n\ntype Query {\n${queryFields}\n}\n\ntype Mutation {\n${mutationFields}\n}`;
}

async function audit(req: ApiGatewayRequest, action: string, resource: string, metadata: Record<string, unknown>): Promise<void> {
  const ctx = req.apiContext!;
  await controlRepository.logAudit({
    organization_id: ctx.organizationId,
    project_id: ctx.projectId,
    environment_id: ctx.environmentId,
    user_id: ctx.userId || ctx.callerRole,
    action,
    resource_type: 'graphql',
    resource_id: resource,
    metadata,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  });
}

async function executeQueryField(req: ApiGatewayRequest, field: GraphqlField, variables: Record<string, unknown>, tables: Map<string, any>): Promise<any> {
  const ctx = req.apiContext!;
  const security = ApiGateway.toSecurityContext(ctx, req);
  if (field.name === '__typename') return 'Query';

  const byPk = field.name.endsWith('_by_pk');
  const tableName = byPk ? field.name.slice(0, -6) : field.name;
  const table = tables.get(tableName.toLowerCase());
  if (!table) fail('GRAPHQL_FIELD_NOT_FOUND', `Unknown query field '${field.name}'.`);
  const args = argumentsOf(field, variables);
  const validColumns = new Set<string>(table.columns.map((column: any) => column.name));

  if (byPk) {
    if (args.id === undefined || args.id === null) fail('GRAPHQL_BAD_USER_INPUT', `${field.name} requires id.`);
    const row = await realProjectDatabase.getRow(ctx, table.name, args.id);
    if (!row || !securityEngine.evaluate(security, 'table', table.name, 'SELECT', row).allowed) return null;
    await audit(req, 'graphql.query_by_pk', table.name, { id: String(args.id) });
    return pick(row, field.selections);
  }

  const limit = args.limit === undefined ? 50 : Math.min(Math.max(Number(args.limit) || 0, 1), 1000);
  const offset = args.offset === undefined ? 0 : Math.max(Number(args.offset) || 0, 0);
  const filters = parseWhere(args.where, validColumns);
  const sorts = parseOrderBy(args.orderBy, validColumns);
  const result = await realProjectDatabase.getRows(ctx, table.name, { limit, offset, filters, sorts });
  const rows = securityEngine.filterRows(security, table.name, result.rows);
  await audit(req, 'graphql.query', table.name, { rowCount: rows.length, totalBeforeRls: result.totalCount });
  return pick(rows, field.selections);
}

async function executeMutationField(req: ApiGatewayRequest, field: GraphqlField, variables: Record<string, unknown>, tables: Map<string, any>): Promise<any> {
  const ctx = req.apiContext!;
  const security = ApiGateway.toSecurityContext(ctx, req);
  if (field.name === '__typename') return 'Mutation';
  const match = /^(insert|update|delete)_(.+)$/.exec(field.name);
  if (!match) fail('GRAPHQL_FIELD_NOT_FOUND', `Unknown mutation field '${field.name}'.`);
  const [, action, requestedTable] = match;
  const table = tables.get(requestedTable.toLowerCase());
  if (!table) fail('GRAPHQL_FIELD_NOT_FOUND', `Unknown mutation field '${field.name}'.`);
  const args = argumentsOf(field, variables);
  const validColumns = new Set<string>(table.columns.map((column: any) => column.name));

  if (action === 'insert') {
    const object = validateObject(args.object, validColumns, 'object');
    if (!securityEngine.evaluate(security, 'table', table.name, 'INSERT', undefined, object).allowed) fail('RLS_DENIED', 'Security policy denied this GraphQL insert.');
    const row = await realProjectDatabase.insertRow(ctx, table.name, object);
    await postgresCdc.emitChange({ ...ctx, schema: 'public', table: table.name, operation: 'INSERT', new: row, requestId: ctx.requestId });
    await audit(req, 'graphql.insert', table.name, { rowId: row?.id });
    return pick(row, field.selections);
  }

  if (args.id === undefined || args.id === null) fail('GRAPHQL_BAD_USER_INPUT', `${field.name} requires id.`);
  const current = await realProjectDatabase.getRow(ctx, table.name, args.id);
  if (!current) return null;

  if (action === 'update') {
    const patch = validateObject(args.patch, validColumns, 'patch');
    if (!securityEngine.evaluate(security, 'table', table.name, 'UPDATE', current, { ...current, ...patch }).allowed) fail('RLS_DENIED', 'Security policy denied this GraphQL update.');
    const row = await realProjectDatabase.updateRow(ctx, table.name, args.id, patch);
    if (row) await postgresCdc.emitChange({ ...ctx, schema: 'public', table: table.name, operation: 'UPDATE', new: row, old: current, requestId: ctx.requestId });
    await audit(req, 'graphql.update', table.name, { rowId: String(args.id) });
    return pick(row, field.selections);
  }

  if (!securityEngine.evaluate(security, 'table', table.name, 'DELETE', current).allowed) fail('RLS_DENIED', 'Security policy denied this GraphQL delete.');
  await realProjectDatabase.deleteRow(ctx, table.name, args.id);
  await postgresCdc.emitChange({ ...ctx, schema: 'public', table: table.name, operation: 'DELETE', old: current, requestId: ctx.requestId });
  await audit(req, 'graphql.delete', table.name, { rowId: String(args.id) });
  return pick(current, field.selections);
}

async function execute(req: ApiGatewayRequest, operation: GraphqlOperation, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tables = new Map((await realProjectDatabase.listTables(req.apiContext!)).map((table) => [table.name.toLowerCase(), table]));
  const data: Record<string, unknown> = {};
  for (const field of operation.selections) {
    const key = field.alias || field.name;
    data[key] = operation.type === 'mutation'
      ? await executeMutationField(req, field, variables, tables)
      : await executeQueryField(req, field, variables, tables);
  }
  return data;
}

graphqlRouter.get('/graphql/v1/schema', async (req: ApiGatewayRequest, res) => {
  try { res.type('text/plain').send(await sdl(req)); }
  catch (error) { res.status(500).json({ errors: [errorPayload(error, req.apiContext?.requestId)] }); }
});

graphqlRouter.post('/graphql/v1', async (req: ApiGatewayRequest, res) => {
  const requestId = req.apiContext?.requestId;
  try {
    const resolved = await persistedQuery(req, String(req.body?.query || ''));
    const variables = req.body?.variables && typeof req.body.variables === 'object' && !Array.isArray(req.body.variables) ? req.body.variables : {};
    const operationName = req.body?.operationName ? String(req.body.operationName) : undefined;
    const operations = parseGraphql(resolved.query);
    let operation: GraphqlOperation | undefined;
    if (operationName) operation = operations.find((item) => item.name === operationName);
    else if (operations.length === 1) operation = operations[0];
    else fail('GRAPHQL_OPERATION_NAME_REQUIRED', 'operationName is required when the document contains multiple operations.');
    if (!operation) fail('GRAPHQL_OPERATION_NOT_FOUND', `GraphQL operation '${operationName}' was not found.`);
    const complexity = operationComplexity(operation, variables);
    if (complexity > MAX_GRAPHQL_COMPLEXITY) fail('GRAPHQL_COMPLEXITY_LIMIT', `GraphQL operation complexity ${complexity} exceeds the limit of ${MAX_GRAPHQL_COMPLEXITY}.`);
    const data = await execute(req, operation, variables);
    res.setHeader('X-GraphQL-Complexity', String(complexity));
    res.json({ data, extensions: { requestId, complexity, persistedQuery: resolved.hash ? { sha256Hash: resolved.hash } : undefined } });
  } catch (error) {
    // GraphQL execution errors are returned in the GraphQL response envelope;
    // gateway/authentication failures have already been handled by middleware.
    res.status(200).json({ data: null, errors: [errorPayload(error, requestId)] });
  }
});
