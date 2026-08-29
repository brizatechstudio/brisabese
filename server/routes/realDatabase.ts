import { Request, Response, Router } from 'express';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { controlRepository } from '../db/controlRepository';
import { postgres } from '../db/postgres';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';
import { postgresCdc } from '../realtime/postgresCdc';
import { databasePhase2Engine } from '../db/databasePhase2';

export const realDatabaseRouter = Router();

type ScopedRequest = Request & { organizationId?: string; projectId?: string; environmentId?: string; user?: { id: string; role: string }; authKind?: string };

function scope(req: ScopedRequest) {
  if (!req.organizationId || !req.projectId || !req.environmentId) throw new Error('Authenticated organization, project, and environment scope are required.');
  return { organizationId: req.organizationId, projectId: req.projectId, environmentId: req.environmentId };
}

function securityContext(req: ScopedRequest): SecurityContext {
  const current = scope(req);
  const role = req.user?.role || 'anonymous';
  return { ...current, userId: req.user?.id, role, bypassRls: role === 'service' && req.headers['x-brisabase-service-bypass'] === 'true', ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.headers['x-request-id'] as string | undefined };
}

function canReadManagedRows(req: ScopedRequest): boolean {
  return req.authKind === 'admin' && ['owner', 'admin', 'developer'].includes(req.user?.role || '');
}

function canWriteManagedRows(req: ScopedRequest): boolean {
  return req.authKind === 'admin' && ['owner', 'admin'].includes(req.user?.role || '');
}

async function audit(req: ScopedRequest, action: string, resourceType: string, resourceId?: string, metadata?: Record<string, unknown>): Promise<void> {
  const current = scope(req);
  await controlRepository.logAudit({ organization_id: current.organizationId, project_id: current.projectId, environment_id: current.environmentId, user_id: req.user?.id || 'system', action, resource_type: resourceType, resource_id: resourceId, metadata, ip_address: req.ip, user_agent: req.headers['user-agent'] });
}

function fail(res: Response, error: unknown, status = 400): void {
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'Database request failed.' : error instanceof Error ? error.message : 'Database request failed.';
  res.status(status).json({ error: { code: status >= 500 ? 'DATABASE_ERROR' : 'INVALID_DATABASE_REQUEST', message } });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message } });
}

async function emit(req: ScopedRequest, table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', value?: Record<string, unknown>, old?: Record<string, unknown>): Promise<void> {
  const current = scope(req);
  await postgresCdc.emitChange({ ...current, schema: 'public', table, operation, new: value || null, old: old || null, requestId: req.headers['x-request-id'] as string | undefined });
}

realDatabaseRouter.get('/api/database/overview', async (req: ScopedRequest, res) => {
  try {
    const [overview, connectionStats] = await Promise.all([
      realProjectDatabase.overview(scope(req)),
      postgres.query<{ active_connections: string; max_connections: string }>(
        `SELECT (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database())::text AS active_connections,
                current_setting('max_connections')::text AS max_connections`,
      ),
    ]);
    const databaseSize = Number(overview.databaseSize || 0);
    const schemas = Array.isArray(overview.schemas) ? overview.schemas : [];
    res.json({
      status: 'connected',
      version: String(overview.version || 'PostgreSQL'),
      sizeMb: Math.round((databaseSize / (1024 * 1024)) * 100) / 100,
      tableCount: Number(overview.tableCount || 0),
      schemaCount: schemas.length,
      activeConnections: Number(connectionStats[0]?.active_connections || 0),
      maxConnections: Number(connectionStats[0]?.max_connections || 0),
      totalRows: Number(overview.rowCount || 0),
    });
  } catch (error) {
    fail(res, error, 500);
  }
});
realDatabaseRouter.get('/api/database/schemas', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.getSchemas(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/schemas', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createSchema(scope(req), req.body?.name); await audit(req, 'schema.created', 'schema', created.name); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/schemas/:name', async (req: ScopedRequest, res) => { try { const deleted = await realProjectDatabase.deleteSchema(scope(req), req.params.name); if (!deleted) { notFound(res, 'Schema not found.'); return; } await audit(req, 'schema.deleted', 'schema', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });

realDatabaseRouter.get('/api/database/tables', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.listTables(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/tables', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createTable(scope(req), req.body); await audit(req, 'table.created', 'table', created.name, { columns: created.columns.length }); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/tables/:tableName', async (req: ScopedRequest, res) => { try { const table = await realProjectDatabase.getTable(scope(req), req.params.tableName); if (!table) { notFound(res, 'Table not found.'); return; } res.json(table); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.delete('/api/database/tables/:tableName', async (req: ScopedRequest, res) => { try { if (String(req.query.confirm || '') !== req.params.tableName) throw new Error(`Type '${req.params.tableName}' to confirm table deletion.`); const deleted = await realProjectDatabase.deleteTable(scope(req), req.params.tableName); if (!deleted) { notFound(res, 'Table not found.'); return; } await audit(req, 'table.deleted', 'table', req.params.tableName); res.json({ success: true }); } catch (error) { fail(res, error); } });

realDatabaseRouter.patch('/api/database/tables/:tableName', async (req: ScopedRequest, res) => { try { const updated = await databasePhase2Engine.alterTable(scope(req), req.params.tableName, req.body || {}); await audit(req, 'table.renamed', 'table', updated.name, { previousName: req.params.tableName }); res.json(updated); } catch (error) { fail(res, error); } });
realDatabaseRouter.post('/api/database/tables/:tableName/columns', async (req: ScopedRequest, res) => { try { const updated = await databasePhase2Engine.addColumn(scope(req), req.params.tableName, req.body || {}); await audit(req, 'column.created', 'column', `${req.params.tableName}.${req.body?.name}`); res.status(201).json(updated); } catch (error) { fail(res, error); } });
realDatabaseRouter.patch('/api/database/tables/:tableName/columns/:columnName', async (req: ScopedRequest, res) => { try { const updated = await databasePhase2Engine.alterColumn(scope(req), req.params.tableName, req.params.columnName, req.body || {}); await audit(req, 'column.updated', 'column', `${req.params.tableName}.${req.params.columnName}`); res.json(updated); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/tables/:tableName/columns/:columnName', async (req: ScopedRequest, res) => { try { const updated = await databasePhase2Engine.dropColumn(scope(req), req.params.tableName, req.params.columnName, String(req.query.confirm || '')); await audit(req, 'column.deleted', 'column', `${req.params.tableName}.${req.params.columnName}`); res.json(updated); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/tables/:tableName/export', async (req: ScopedRequest, res) => { try { const format = req.query.format === 'json' ? 'json' : 'csv'; const exported = await databasePhase2Engine.exportRows(scope(req), req.params.tableName, format, Number(req.query.limit) || 10000); res.setHeader('Content-Type', exported.contentType); res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`); res.setHeader('X-BrisaBase-Row-Count', String(exported.rowCount)); res.send(exported.content); } catch (error) { fail(res, error); } });
realDatabaseRouter.post('/api/database/tables/:tableName/import', async (req: ScopedRequest, res) => { try { const result = await databasePhase2Engine.importRows(scope(req), req.params.tableName, req.body || {}); await audit(req, 'rows.imported', 'table', req.params.tableName, result); res.status(201).json(result); } catch (error) { fail(res, error); } });

realDatabaseRouter.get('/api/database/tables/:tableName/rows', async (req: ScopedRequest, res) => {
  try {
    const parseList = (value: unknown): any[] | undefined => {
      if (typeof value !== 'string' || !value.trim()) return undefined;
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.length > 20) throw new Error('Database filters/sorts must be JSON arrays with at most 20 entries.');
      return parsed;
    };
    const result = await realProjectDatabase.getRows(scope(req), req.params.tableName, {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
      search: typeof req.query.search === 'string' ? req.query.search.slice(0, 500) : undefined,
      sortField: typeof req.query.sortField === 'string' ? req.query.sortField : undefined,
      sortOrder: req.query.sortOrder === 'desc' ? 'desc' : 'asc',
      filters: parseList(req.query.filters),
      orFilters: parseList(req.query.orFilters),
      sorts: parseList(req.query.sorts),
    });
    if (canReadManagedRows(req)) { res.json(result); return; }
    const rows = securityEngine.filterRows(securityContext(req), req.params.tableName, result.rows);
    res.json({ ...result, rows, totalCount: rows.length });
  } catch (error) { fail(res, error, 400); }
});
realDatabaseRouter.post('/api/database/tables/:tableName/rows', async (req: ScopedRequest, res) => { try { if (!canWriteManagedRows(req) && !securityEngine.evaluate(securityContext(req), 'table', req.params.tableName, 'INSERT', undefined, req.body).allowed) { res.status(403).json({ error: { code: 'RLS_DENIED', message: 'Security policy denied this insert.' } }); return; } const row = await realProjectDatabase.insertRow(scope(req), req.params.tableName, req.body); await emit(req, req.params.tableName, 'INSERT', row); await audit(req, 'row.inserted', 'row', String(row.id || '')); res.status(201).json(row); } catch (error) { fail(res, error); } });
realDatabaseRouter.patch('/api/database/tables/:tableName/rows/:rowId', async (req: ScopedRequest, res) => { try { const current = await realProjectDatabase.getRow(scope(req), req.params.tableName, req.params.rowId); if (!current) { notFound(res, 'Record not found.'); return; } if (!canWriteManagedRows(req) && !securityEngine.evaluate(securityContext(req), 'table', req.params.tableName, 'UPDATE', current, { ...current, ...req.body }).allowed) { res.status(403).json({ error: { code: 'RLS_DENIED', message: 'Security policy denied this update.' } }); return; } const row = await realProjectDatabase.updateRow(scope(req), req.params.tableName, req.params.rowId, req.body); if (row) await emit(req, req.params.tableName, 'UPDATE', row, current); await audit(req, 'row.updated', 'row', req.params.rowId); res.json(row); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/tables/:tableName/rows/:rowId', async (req: ScopedRequest, res) => { try { const current = await realProjectDatabase.getRow(scope(req), req.params.tableName, req.params.rowId); if (!current) { notFound(res, 'Record not found.'); return; } if (!canWriteManagedRows(req) && !securityEngine.evaluate(securityContext(req), 'table', req.params.tableName, 'DELETE', current).allowed) { res.status(403).json({ error: { code: 'RLS_DENIED', message: 'Security policy denied this deletion.' } }); return; } const deleted = await realProjectDatabase.deleteRow(scope(req), req.params.tableName, req.params.rowId); if (!deleted) { notFound(res, 'Record not found.'); return; } await emit(req, req.params.tableName, 'DELETE', undefined, current); await audit(req, 'row.deleted', 'row', req.params.rowId); res.json({ success: true }); } catch (error) { fail(res, error); } });

realDatabaseRouter.post('/api/database/sql/execute', async (req: ScopedRequest, res) => {
  const query = String(req.body?.query || ''); const current = scope(req);
  try {
    const result = await realProjectDatabase.executeSql(current, query, { queryId: req.body?.queryId, timeoutMs: req.body?.timeoutMs, maxRows: req.body?.maxRows });
    await controlRepository.recordSqlHistory({ projectId: current.projectId, environmentId: current.environmentId, userId: req.user?.id || 'system', query, executionTimeMs: result.executionTimeMs, rowCount: result.rowCount, status: 'success' });
    await audit(req, 'database.sql.executed', 'sql', undefined, { rowCount: result.rowCount, executionTimeMs: result.executionTimeMs });
    res.json(result);
  } catch (error) {
    await controlRepository.recordSqlHistory({ projectId: current.projectId, environmentId: current.environmentId, userId: req.user?.id || 'system', query, status: 'error', errorMessage: error instanceof Error ? error.message : 'SQL execution failed.' }).catch(() => undefined);
    fail(res, error);
  }
});
realDatabaseRouter.get('/api/database/sql/history', async (req: ScopedRequest, res) => { try { const current = scope(req); res.json(await controlRepository.listSqlHistory(current.projectId, current.environmentId, Number(req.query.limit) || 100)); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.get('/api/database/sql/metrics', async (req: ScopedRequest, res) => { try { const current = scope(req); res.json(await controlRepository.getSqlMetrics(current.projectId, current.environmentId)); } catch (error) { fail(res, error, 500); } });

realDatabaseRouter.post('/api/database/sql/explain', async (req: ScopedRequest, res) => { try { const result = await realProjectDatabase.explainSql(scope(req), String(req.body?.query || ''), Boolean(req.body?.analyze), { queryId: req.body?.queryId, timeoutMs: req.body?.timeoutMs }); await audit(req, 'database.sql.explained', 'sql', result.queryId, { analyze: result.analyze, executionTimeMs: result.executionTimeMs }); res.json(result); } catch (error) { fail(res, error); } });
realDatabaseRouter.post('/api/database/sql/cancel/:queryId', async (req: ScopedRequest, res) => { try { const cancelled = await realProjectDatabase.cancelSql(scope(req), req.params.queryId); if (!cancelled) { notFound(res, 'Running query not found.'); return; } await audit(req, 'database.sql.cancelled', 'sql', req.params.queryId); res.json({ cancelled: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/sql/saved', async (req: ScopedRequest, res) => { try { const current = scope(req); res.json(await controlRepository.listSavedSqlQueries(current.projectId, current.environmentId, req.user?.id || 'system')); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/sql/saved', async (req: ScopedRequest, res) => { try { const current = scope(req); const saved = await controlRepository.saveSqlQuery({ projectId: current.projectId, environmentId: current.environmentId, userId: req.user?.id || 'system', name: String(req.body?.name || ''), query: String(req.body?.query || ''), favorite: Boolean(req.body?.favorite) }); res.status(201).json(saved); } catch (error) { fail(res, error); } });
realDatabaseRouter.patch('/api/database/sql/saved/:id', async (req: ScopedRequest, res) => { try { const current = scope(req); const saved = await controlRepository.updateSavedSqlQuery(req.params.id, current.projectId, current.environmentId, req.user?.id || 'system', req.body || {}); if (!saved) { notFound(res, 'Saved query not found.'); return; } res.json(saved); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/sql/saved/:id', async (req: ScopedRequest, res) => { try { const current = scope(req); const deleted = await controlRepository.deleteSavedSqlQuery(req.params.id, current.projectId, current.environmentId, req.user?.id || 'system'); if (!deleted) { notFound(res, 'Saved query not found.'); return; } res.status(204).end(); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/relationships', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.getRelationships(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/relationships', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createRelationship(scope(req), req.body); await audit(req, 'relationship.created', 'relationship', created.id); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/relationships/:id', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteRelationship(scope(req), req.params.id, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Relationship not found.'); return; } await audit(req, 'relationship.deleted', 'relationship', req.params.id); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/indexes', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.getIndexes(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/indexes', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createIndex(scope(req), req.body); await audit(req, 'index.created', 'index', created.id); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/indexes/:id', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteIndex(scope(req), req.params.id, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Index not found.'); return; } await audit(req, 'index.deleted', 'index', req.params.id); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/migrations', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.getMigrations(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/migrations', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createMigration(scope(req), req.body?.name, req.body?.sqlUp, req.body?.sqlDown); await audit(req, 'migration.applied', 'migration', created.id); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.post('/api/database/migrations/:id/rollback', async (req: ScopedRequest, res) => { try { if (String(req.body?.confirm || '') !== req.params.id) throw new Error(`Type migration id '${req.params.id}' to confirm rollback.`); const rolledBack = await realProjectDatabase.rollbackMigration(scope(req), req.params.id); await audit(req, 'migration.rolled_back', 'migration', req.params.id); res.json(rolledBack); } catch (error) { fail(res, error); } });

realDatabaseRouter.get('/api/database/functions', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.getFunctions(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/functions', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createFunction(scope(req), req.body); await audit(req, 'function.created', 'database_function', created?.id); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/functions/:name', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteFunction(scope(req), req.params.name, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Function not found.'); return; } await audit(req, 'function.deleted', 'database_function', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/triggers', async (req: ScopedRequest, res) => { try { res.json(await realProjectDatabase.getTriggers(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/triggers', async (req: ScopedRequest, res) => { try { const created = await realProjectDatabase.createTrigger(scope(req), req.body); await audit(req, 'trigger.created', 'trigger', created?.id); res.status(201).json(created); } catch (error) { fail(res, error); } });
realDatabaseRouter.patch('/api/database/triggers/:name', async (req: ScopedRequest, res) => { try { const trigger = await databasePhase2Engine.setTriggerEnabled(scope(req), req.params.name, Boolean(req.body?.enabled)); await audit(req, req.body?.enabled ? 'trigger.enabled' : 'trigger.disabled', 'trigger', req.params.name); res.json(trigger); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/triggers/:name', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteTrigger(scope(req), req.params.name, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Trigger not found.'); return; } await audit(req, 'trigger.deleted', 'trigger', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });


realDatabaseRouter.get('/api/database/objects/views', async (req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.listViews(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/objects/views', async (req: ScopedRequest, res) => { try { const item = await databasePhase2Engine.createView(scope(req), String(req.body?.name || ''), String(req.body?.query || ''), Boolean(req.body?.replace)); await audit(req, 'view.created', 'view', item.name); res.status(201).json(item); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/objects/views/:name', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteView(scope(req), req.params.name, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'View not found.'); return; } await audit(req, 'view.deleted', 'view', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/objects/materialized-views', async (req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.listMaterializedViews(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/objects/materialized-views', async (req: ScopedRequest, res) => { try { const item = await databasePhase2Engine.createMaterializedView(scope(req), String(req.body?.name || ''), String(req.body?.query || ''), req.body?.withData !== false); await audit(req, 'materialized_view.created', 'materialized_view', item.name); res.status(201).json(item); } catch (error) { fail(res, error); } });
realDatabaseRouter.post('/api/database/objects/materialized-views/:name/refresh', async (req: ScopedRequest, res) => { try { const item = await databasePhase2Engine.refreshMaterializedView(scope(req), req.params.name); await audit(req, 'materialized_view.refreshed', 'materialized_view', item.name); res.json(item); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/objects/materialized-views/:name', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteMaterializedView(scope(req), req.params.name, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Materialized view not found.'); return; } await audit(req, 'materialized_view.deleted', 'materialized_view', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/objects/enums', async (req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.listEnums(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/objects/enums', async (req: ScopedRequest, res) => { try { const item = await databasePhase2Engine.createEnum(scope(req), String(req.body?.name || ''), Array.isArray(req.body?.values) ? req.body.values : []); await audit(req, 'enum.created', 'enum', item.name); res.status(201).json(item); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/objects/enums/:name', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteEnum(scope(req), req.params.name, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Enum not found.'); return; } await audit(req, 'enum.deleted', 'enum', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/objects/sequences', async (req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.listSequences(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/objects/sequences', async (req: ScopedRequest, res) => { try { const item = await databasePhase2Engine.createSequence(scope(req), req.body || {}); await audit(req, 'sequence.created', 'sequence', item.name); res.status(201).json(item); } catch (error) { fail(res, error); } });
realDatabaseRouter.delete('/api/database/objects/sequences/:name', async (req: ScopedRequest, res) => { try { const deleted = await databasePhase2Engine.deleteSequence(scope(req), req.params.name, String(req.query.confirm || '')); if (!deleted) { notFound(res, 'Sequence not found.'); return; } await audit(req, 'sequence.deleted', 'sequence', req.params.name); res.json({ success: true }); } catch (error) { fail(res, error); } });
realDatabaseRouter.get('/api/database/objects/extensions', async (_req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.listExtensions()); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.get('/api/database/schema/snapshot', async (req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.snapshot(scope(req))); } catch (error) { fail(res, error, 500); } });
realDatabaseRouter.post('/api/database/schema/diff', async (req: ScopedRequest, res) => { try { res.json(await databasePhase2Engine.diff(scope(req), req.body?.baseline)); } catch (error) { fail(res, error); } });
