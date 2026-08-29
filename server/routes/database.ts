import { Router, Request, Response } from 'express';
import { projectDbManager } from '../db/projectDatabase';
import { db } from '../db/database';
import { securityEngine } from '../security/securityEngine';
import { SecurityContext } from '../security/types';

export const databaseRouter = Router();

function getContext(req: Request) {
  const orgId = (req.headers['x-organization-id'] as string) || (req.query.organizationId as string) || 'org_core_1';
  let projId = (req.headers['x-project-id'] as string) || (req.query.projectId as string) || 'proj_ecommerce_1';

  // Resolve project slug if necessary
  const proj = db.getProjectById(projId);
  if (proj) {
    projId = proj.id;
  }

  const envId = (req.headers['x-environment-id'] as string) || (req.query.environmentId as string) || `env_${projId}_production`;
  return { orgId, projId, envId };
}

function securityContext(req: Request, scope: { orgId: string; projId: string; envId: string }): SecurityContext {
  const user = (req as any).user;
  return { organizationId: scope.orgId, projectId: scope.projId, environmentId: scope.envId, userId: user?.id, role: user?.role || 'anonymous', ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.headers['x-request-id'] as string | undefined };
}

function denyRls(res: Response): void { res.status(403).json({ error: { code: 'RLS_DENIED', message: 'A política de segurança negou esta operação.' } }); }

// 1. OVERVIEW
databaseRouter.get('/api/database/overview', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const overview = projectDbManager.getOverview(orgId, projId, envId);
    res.json(overview);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. SCHEMAS
databaseRouter.get('/api/database/schemas', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const schemas = projectDbManager.getSchemas(orgId, projId, envId);
    res.json(schemas);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/schemas', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome do schema é obrigatório.' });
    const created = projectDbManager.createSchema(orgId, projId, envId, name);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

databaseRouter.delete('/api/database/schemas/:name', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const success = projectDbManager.deleteSchema(orgId, projId, envId, req.params.name);
    if (!success) return res.status(404).json({ error: 'Schema não encontrado.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. TABLES
databaseRouter.get('/api/database/tables', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const tables = projectDbManager.listTables(orgId, projId, envId);
    res.json(tables);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/tables', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const { name, schema, columns } = req.body;
    if (!name || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'Nome e colunas da tabela são obrigatórios.' });
    }
    const created = projectDbManager.createTable(orgId, projId, envId, { name, schema, columns });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

databaseRouter.get('/api/database/tables/:tableName', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const table = projectDbManager.getTableSchema(orgId, projId, envId, req.params.tableName);
    if (!table) return res.status(404).json({ error: `Tabela '${req.params.tableName}' não encontrada.` });
    res.json(table);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.delete('/api/database/tables/:tableName', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const deleted = projectDbManager.deleteTable(orgId, projId, envId, req.params.tableName);
    if (!deleted) return res.status(404).json({ error: 'Tabela não encontrada.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. ROWS
databaseRouter.get('/api/database/tables/:tableName/rows', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const search = req.query.search as string;
    const sortField = req.query.sortField as string;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc';

    const result = projectDbManager.getTableRows(orgId, projId, envId, req.params.tableName, {
      limit,
      offset,
      search,
      sortField,
      sortOrder
    });
    const rows = securityEngine.filterRows(securityContext(req, { orgId, projId, envId }), req.params.tableName, result.rows);
    res.json({ ...result, rows, totalCount: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/tables/:tableName/rows', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    if (!securityEngine.evaluate(securityContext(req, { orgId, projId, envId }), 'table', req.params.tableName, 'INSERT', undefined, req.body).allowed) return denyRls(res);
    const createdRow = projectDbManager.insertRow(orgId, projId, envId, req.params.tableName, req.body);
    res.status(201).json(createdRow);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

databaseRouter.patch('/api/database/tables/:tableName/rows/:rowId', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const existing = projectDbManager.getRow(orgId, projId, envId, req.params.tableName, req.params.rowId);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });
    if (!securityEngine.evaluate(securityContext(req, { orgId, projId, envId }), 'table', req.params.tableName, 'UPDATE', existing, { ...existing, ...req.body }).allowed) return denyRls(res);
    const updatedRow = projectDbManager.updateRow(orgId, projId, envId, req.params.tableName, req.params.rowId, req.body);
    res.json(updatedRow);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

databaseRouter.delete('/api/database/tables/:tableName/rows/:rowId', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const existing = projectDbManager.getRow(orgId, projId, envId, req.params.tableName, req.params.rowId);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });
    if (!securityEngine.evaluate(securityContext(req, { orgId, projId, envId }), 'table', req.params.tableName, 'DELETE', existing).allowed) return denyRls(res);
    const success = projectDbManager.deleteRow(orgId, projId, envId, req.params.tableName, req.params.rowId);
    if (!success) return res.status(404).json({ error: 'Registro não encontrado.' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. SQL EDITOR
databaseRouter.post('/api/database/sql/execute', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Instrução SQL é obrigatória.' });

    const userId = (req as any).user?.id || 'usr_owner_1';
    const result = projectDbManager.executeQuery(orgId, projId, envId, query, userId, securityContext(req, { orgId, projId, envId }));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

databaseRouter.get('/api/database/sql/history', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const history = projectDbManager.getSqlHistory(orgId, projId, envId);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. RELATIONSHIPS
databaseRouter.get('/api/database/relationships', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const rels = projectDbManager.getRelationships(orgId, projId, envId);
    res.json(rels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/relationships', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const created = projectDbManager.createRelationship(orgId, projId, envId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. INDEXES
databaseRouter.get('/api/database/indexes', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const indexes = projectDbManager.getIndexes(orgId, projId, envId);
    res.json(indexes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/indexes', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const created = projectDbManager.createIndex(orgId, projId, envId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. MIGRATIONS
databaseRouter.get('/api/database/migrations', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const migrations = projectDbManager.getMigrations(orgId, projId, envId);
    res.json(migrations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/migrations', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const { name, sqlUp, sqlDown } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome da migração é obrigatório.' });
    const created = projectDbManager.createMigration(orgId, projId, envId, name, sqlUp, sqlDown);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 9. FUNCTIONS
databaseRouter.get('/api/database/functions', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const fns = projectDbManager.getFunctions(orgId, projId, envId);
    res.json(fns);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/functions', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const created = projectDbManager.createFunction(orgId, projId, envId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. TRIGGERS
databaseRouter.get('/api/database/triggers', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const triggers = projectDbManager.getTriggers(orgId, projId, envId);
    res.json(triggers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

databaseRouter.post('/api/database/triggers', (req: Request, res: Response) => {
  try {
    const { orgId, projId, envId } = getContext(req);
    const created = projectDbManager.createTrigger(orgId, projId, envId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
