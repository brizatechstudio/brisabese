import { Response, Router } from 'express';
import { ApiGateway, ApiGatewayRequest } from '../apiEngine/apiGateway';
import { ApiResource } from '../apiEngine/schemaIntrospection';
import { SafeQueryBuilder } from '../apiEngine/queryBuilder';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { controlRepository } from '../db/controlRepository';
import { securityEngine } from '../security/securityEngine';
import { postgresCdc } from '../realtime/postgresCdc';
import { logger } from '../logger';

export const realRestApiRouter = Router();
realRestApiRouter.use('/rest/v1', ApiGateway.corsAndHeadersMiddleware, ApiGateway.gatewayMiddleware);

const RESOURCE_CACHE_TTL_MS = 1_000;
type ResourceCacheEntry = { expiresAt: number; value: Promise<ApiResource | null> };
const resourceCache = new Map<string, ResourceCacheEntry>();

function resourceCacheKey(req: ApiGatewayRequest, tableName: string): string {
  const ctx = req.apiContext!;
  return `${ctx.organizationId}:${ctx.projectId}:${ctx.environmentId}:${tableName}`;
}

async function resource(req: ApiGatewayRequest, tableName: string): Promise<ApiResource | null> {
  const now = Date.now();
  const key = resourceCacheKey(req, tableName);
  const cached = resourceCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) resourceCache.delete(key);

  if (resourceCache.size > 1_000) {
    for (const [cacheKey, entry] of resourceCache) {
      if (entry.expiresAt <= now) resourceCache.delete(cacheKey);
    }
  }

  const value = (async (): Promise<ApiResource | null> => {
    const ctx = req.apiContext!;
    const table = await realProjectDatabase.getTable(ctx, tableName);
    if (!table) return null;
    const relationships = await realProjectDatabase.getRelationships(ctx);
    return { schema: 'public', table: table.name, primaryKey: table.columns.find((column) => column.isPrimaryKey)?.name || 'id', columns: table.columns.map((column) => ({ name: column.name, type: column.type, isPrimaryKey: Boolean(column.isPrimaryKey), isNullable: column.isNullable !== false, isUnique: Boolean(column.isUnique), defaultValue: column.defaultValue })), relationships: relationships.filter((relationship) => relationship.fromTable === table.name || relationship.toTable === table.name).map((relationship) => ({ fromTable: relationship.fromTable, fromColumn: relationship.fromColumn, toTable: relationship.toTable, toColumn: relationship.toColumn, type: relationship.type })) };
  })();

  resourceCache.set(key, { expiresAt: now + RESOURCE_CACHE_TTL_MS, value });
  try {
    return await value;
  } catch (cause) {
    const current = resourceCache.get(key);
    if (current?.value === value) resourceCache.delete(key);
    throw cause;
  }
}

function match(value: unknown, operator: string, expected: any): boolean {
  if (operator === 'isnull') return expected ? value === null || value === undefined : value !== null && value !== undefined;
  if (value === null || value === undefined) return operator === 'is' && expected === null;
  switch (operator) {
    case 'eq': return String(value) === String(expected);
    case 'neq': return String(value) !== String(expected);
    case 'gt': return Number(value) > Number(expected);
    case 'gte': return Number(value) >= Number(expected);
    case 'lt': return Number(value) < Number(expected);
    case 'lte': return Number(value) <= Number(expected);
    case 'in': return Array.isArray(expected) && expected.some((item) => String(item) === String(value));
    case 'is': return value === expected;
    case 'like': case 'ilike': case 'contains': return String(value).toLowerCase().includes(String(expected).replaceAll('%', '').toLowerCase());
    case 'starts_with': return String(value).toLowerCase().startsWith(String(expected).toLowerCase());
    case 'ends_with': return String(value).toLowerCase().endsWith(String(expected).toLowerCase());
    default: return false;
  }
}

async function audit(req: ApiGatewayRequest, action: string, table: string, metadata: Record<string, unknown>): Promise<void> {
  const ctx = req.apiContext!;
  await controlRepository.logAudit({ organization_id: ctx.organizationId, project_id: ctx.projectId, environment_id: ctx.environmentId, user_id: ctx.userId || 'anonymous', action, resource_type: 'table', resource_id: table, metadata, ip_address: req.ip, user_agent: req.headers['user-agent'] });
}

function error(res: Response, status: number, code: string, message: string): void { res.status(status).json({ error: { code, message } }); }

function requestedIncludes(req: ApiGatewayRequest, apiResource: ApiResource, relationshipSelects: Array<{ relationName: string; fields?: string[] }> = []): string[] {
  const raw = String(req.query.include || '').trim();
  const explicit = raw ? raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) : [];
  const nested = relationshipSelects.map((item) => item.relationName.toLowerCase());
  const names = [...new Set([...explicit, ...nested])];
  if (names.length > 5) throw Object.assign(new Error('At most five relationships can be included per request.'), { code: 'INVALID_INCLUDE' });
  const current = apiResource.table.toLowerCase();
  const available = new Set(apiResource.relationships.flatMap((relationship) => {
    if (relationship.fromTable.toLowerCase() === current) return [relationship.toTable.toLowerCase()];
    if (relationship.toTable.toLowerCase() === current) return [relationship.fromTable.toLowerCase()];
    return [];
  }));
  const invalid = names.find((name) => !available.has(name));
  if (invalid) throw Object.assign(new Error(`Relationship '${invalid}' is not available from '${apiResource.table}'.`), { code: 'INVALID_INCLUDE' });
  return names;
}


async function expandRelationships(req: ApiGatewayRequest, apiResource: ApiResource, rows: any[], includes: string[], relationshipSelects: Array<{ relationName: string; fields?: string[] }> = []): Promise<any[]> {
  if (!includes.length || !rows.length) return rows;
  const ctx = req.apiContext!;
  const security = ApiGateway.toSecurityContext(ctx, req);
  const output = rows.map((row) => ({ ...row }));
  const selections = new Map(relationshipSelects.map((item) => [item.relationName.toLowerCase(), item.fields || []]));
  const protectedFields = new Set(['password','password_hash','secret','refresh_token_hash','key_hash']);
  for (const include of includes) {
    const relations = apiResource.relationships.filter((relationship) => {
      const current = apiResource.table.toLowerCase();
      return (relationship.fromTable.toLowerCase() === current && relationship.toTable.toLowerCase() === include) || (relationship.toTable.toLowerCase() === current && relationship.fromTable.toLowerCase() === include);
    });
    for (const relationship of relations) {
      const forward = relationship.fromTable.toLowerCase() === apiResource.table.toLowerCase();
      const relatedTable = forward ? relationship.toTable : relationship.fromTable;
      const localColumn = forward ? relationship.fromColumn : relationship.toColumn;
      const remoteColumn = forward ? relationship.toColumn : relationship.fromColumn;
      const values = [...new Set(rows.map((row) => row[localColumn]).filter((value) => value !== null && value !== undefined))];
      if (!values.length) { output.forEach((row) => { row[relatedTable] = forward ? null : []; }); continue; }
      const related = await realProjectDatabase.getRows(ctx, relatedTable, { limit: 1000, offset: 0, filters: [{ field: remoteColumn, operator: 'in', value: values }] });
      const allowed = securityEngine.filterRows(security, relatedTable, related.rows);
      const requestedFields = selections.get(include) || [];
      const projected = allowed.map((item) => {
        const fields = requestedFields.length && !requestedFields.includes('*') ? requestedFields : Object.keys(item).filter((field) => !protectedFields.has(field.toLowerCase()));
        return Object.fromEntries(fields.filter((field) => item[field] !== undefined && !protectedFields.has(field.toLowerCase())).map((field) => [field, item[field]]));
      });
      const grouped = new Map<string, any[]>();
      for (let index = 0; index < allowed.length; index += 1) { const raw = allowed[index]; const item = projected[index]; const key = String(raw[remoteColumn]); const bucket = grouped.get(key) || []; bucket.push(item); grouped.set(key, bucket); }
      output.forEach((row) => { const matches = grouped.get(String(row[localColumn])) || []; row[relatedTable] = forward ? (matches[0] || null) : matches; });
    }
  }
  return output;
}

realRestApiRouter.get('/rest/v1/docs', async (req: ApiGatewayRequest, res) => {
  try { const tables = await realProjectDatabase.listTables(req.apiContext!); res.json({ openapi: '3.0.3', info: { title: 'BrisaBase REST API', version: 'v1' }, paths: Object.fromEntries(tables.map((table) => [`/rest/v1/${table.name}`, { get: { summary: `List ${table.name}` }, post: { summary: `Create ${table.name}` } }])) }); } catch { error(res, 503, 'DATABASE_UNAVAILABLE', 'Project database is unavailable.'); }
});

realRestApiRouter.get('/rest/v1/:table', async (req: ApiGatewayRequest, res) => {
  try {
    const ctx = req.apiContext!; const apiResource = await resource(req, req.params.table.toLowerCase()); if (!apiResource) return error(res, 404, 'RESOURCE_NOT_FOUND', 'The requested table is not exposed.');
    const parsed = SafeQueryBuilder.parseQueryParams(req.query, apiResource);
    const includes = requestedIncludes(req, apiResource, parsed.relationshipSelects);
    if (includes.length && parsed.limit > 200) return error(res, 400, 'RELATIONSHIP_LIMIT', 'Relationship expansion supports at most 200 root rows per request.');
    const result = await realProjectDatabase.getRows(ctx, apiResource.table, { limit: parsed.limit, offset: parsed.offset, filters: parsed.filters, orFilters: parsed.orFilters, sorts: parsed.sorts });
    let rows = result.rows;
    rows = securityEngine.filterRows(ApiGateway.toSecurityContext(ctx, req), apiResource.table, rows);
    rows = await expandRelationships(req, apiResource, rows, includes, parsed.relationshipSelects);
    rows = rows.map((row) => { const fields = [...new Set([...(parsed.selectFields || Object.keys(row)), ...includes])]; return Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, row[field]])); });
    await audit(req, 'api.request', apiResource.table, { method: 'GET', rowCount: rows.length, filteredTotal: result.totalCount, includes }); res.json(rows);
  } catch (cause: any) {
    if (cause?.code === 'INVALID_INCLUDE') return error(res, 400, 'INVALID_INCLUDE', cause.message);
    // Preserve the opaque public error while keeping a request-correlated,
    // non-secret diagnosis for operators.
    logger.error('REST project query failed.', { requestId: req.apiContext?.requestId, reason: cause instanceof Error ? cause.message : String(cause) });
    error(res, 500, 'DATABASE_ERROR', 'Unable to query project records.');
  }
});

realRestApiRouter.get('/rest/v1/:table/:id', async (req: ApiGatewayRequest, res) => {
  try { const ctx = req.apiContext!; const apiResource = await resource(req, req.params.table.toLowerCase()); if (!apiResource) return error(res, 404, 'RESOURCE_NOT_FOUND', 'The requested table is not exposed.'); const row = await realProjectDatabase.getRow(ctx, apiResource.table, req.params.id); if (!row || !securityEngine.filterRows(ApiGateway.toSecurityContext(ctx, req), apiResource.table, [row]).length) return error(res, 404, 'RECORD_NOT_FOUND', 'Record not found.'); res.json(row); } catch { error(res, 500, 'DATABASE_ERROR', 'Unable to query project records.'); }
});

realRestApiRouter.post('/rest/v1/:table', async (req: ApiGatewayRequest, res) => {
  try { const ctx = req.apiContext!; const apiResource = await resource(req, req.params.table.toLowerCase()); if (!apiResource) return error(res, 404, 'RESOURCE_NOT_FOUND', 'The requested table is not exposed.'); const items = Array.isArray(req.body) ? req.body : [req.body]; if (!items.length || items.some((item) => !item || typeof item !== 'object')) return error(res, 400, 'INVALID_BODY', 'A JSON object or array is required.'); const allowed = new Set(apiResource.columns.map((column) => column.name)); if (items.some((item) => Object.keys(item).some((key) => !allowed.has(key)))) return error(res, 400, 'INVALID_COLUMN', 'One or more columns are invalid.'); const inserted: any[] = []; for (const item of items) { if (!securityEngine.evaluate(ApiGateway.toSecurityContext(ctx, req), 'table', apiResource.table, 'INSERT', undefined, item).allowed) return error(res, 403, 'RLS_DENIED', 'Security policy denied this insert.'); const row = await realProjectDatabase.insertRow(ctx, apiResource.table, item); inserted.push(row); await postgresCdc.emitChange({ ...ctx, schema: 'public', table: apiResource.table, operation: 'INSERT', new: row, requestId: ctx.requestId }); } await audit(req, 'api.insert', apiResource.table, { count: inserted.length }); res.status(201).json(Array.isArray(req.body) ? inserted : inserted[0]); } catch { error(res, 400, 'DATABASE_ERROR', 'Unable to insert project records.'); }
});

realRestApiRouter.patch('/rest/v1/:table/:id', async (req: ApiGatewayRequest, res) => {
  try { const ctx = req.apiContext!; const apiResource = await resource(req, req.params.table.toLowerCase()); if (!apiResource) return error(res, 404, 'RESOURCE_NOT_FOUND', 'The requested table is not exposed.'); const current = await realProjectDatabase.getRow(ctx, apiResource.table, req.params.id); if (!current) return error(res, 404, 'RECORD_NOT_FOUND', 'Record not found.'); if (!securityEngine.evaluate(ApiGateway.toSecurityContext(ctx, req), 'table', apiResource.table, 'UPDATE', current, { ...current, ...req.body }).allowed) return error(res, 403, 'RLS_DENIED', 'Security policy denied this update.'); const row = await realProjectDatabase.updateRow(ctx, apiResource.table, req.params.id, req.body); if (row) await postgresCdc.emitChange({ ...ctx, schema: 'public', table: apiResource.table, operation: 'UPDATE', new: row, old: current, requestId: ctx.requestId }); await audit(req, 'api.update', apiResource.table, { rowId: req.params.id }); res.json(row); } catch { error(res, 400, 'DATABASE_ERROR', 'Unable to update project record.'); }
});

realRestApiRouter.delete('/rest/v1/:table/:id', async (req: ApiGatewayRequest, res) => {
  try { const ctx = req.apiContext!; const apiResource = await resource(req, req.params.table.toLowerCase()); if (!apiResource) return error(res, 404, 'RESOURCE_NOT_FOUND', 'The requested table is not exposed.'); const current = await realProjectDatabase.getRow(ctx, apiResource.table, req.params.id); if (!current) return error(res, 404, 'RECORD_NOT_FOUND', 'Record not found.'); if (!securityEngine.evaluate(ApiGateway.toSecurityContext(ctx, req), 'table', apiResource.table, 'DELETE', current).allowed) return error(res, 403, 'RLS_DENIED', 'Security policy denied this deletion.'); await realProjectDatabase.deleteRow(ctx, apiResource.table, req.params.id); await postgresCdc.emitChange({ ...ctx, schema: 'public', table: apiResource.table, operation: 'DELETE', old: current, requestId: ctx.requestId }); await audit(req, 'api.delete', apiResource.table, { rowId: req.params.id }); res.status(204).end(); } catch { error(res, 500, 'DATABASE_ERROR', 'Unable to delete project record.'); }
});
