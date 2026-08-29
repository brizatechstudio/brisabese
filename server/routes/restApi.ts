import { Router, Response } from 'express';
import { ApiGateway, ApiGatewayRequest } from '../apiEngine/apiGateway';
import { SchemaIntrospectionService } from '../apiEngine/schemaIntrospection';
import { ApiPermissionEngine } from '../apiEngine/permissionEngine';
import { SafeQueryBuilder } from '../apiEngine/queryBuilder';
import { OpenApiGenerator } from '../apiEngine/openapiGenerator';
import { projectDbManager } from '../db/projectDatabase';
import { db } from '../db/database';
import { securityEngine } from '../security/securityEngine';

function denyRls(res: Response, operation: string): void {
  res.status(403).json({ error: { code: 'RLS_DENIED', message: `A política de segurança negou ${operation}.` } });
}

export const restApiRouter = Router();

// Apply Gateway Middleware (Context Resolution, CORS, Rate Limiting, API Key & JWT Auth)
restApiRouter.use('/rest/v1', ApiGateway.corsAndHeadersMiddleware, ApiGateway.gatewayMiddleware);

// 1. OpenAPI Specification Endpoint
restApiRouter.get('/rest/v1/docs', (req: ApiGatewayRequest, res: Response) => {
  const ctx = req.apiContext!;
  const spec = OpenApiGenerator.generateSpec(ctx.organizationId, ctx.projectId, ctx.environmentId);
  res.json(spec);
});

// 2. GET /rest/v1/:table — List, Search, Filter, Sort, Paginate, Expand
restApiRouter.get('/rest/v1/:table', (req: ApiGatewayRequest, res: Response) => {
  try {
    const ctx = req.apiContext!;
    const tableName = req.params.table.toLowerCase();

    // 1. Schema Introspection
    const resource = SchemaIntrospectionService.getResource(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName
    );

    if (!resource) {
      res.status(404).json({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `A tabela '${tableName}' não existe ou não está exposta na API.`,
        },
      });
      return;
    }

    // 2. Permission Check
    const perm = ApiPermissionEngine.canExecute(
      ctx.projectId,
      ctx.environmentId,
      tableName,
      ctx.callerRole,
      'READ'
    );

    if (!perm.allowed) {
      db.logAudit({
        organization_id: ctx.organizationId,
        project_id: ctx.projectId,
        environment_id: ctx.environmentId,
        user_id: ctx.userId || 'anonymous',
        action: 'api.permission_denied',
        resource_type: 'table',
        resource_id: tableName,
        metadata: { reason: perm.reason },
      });

      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: perm.reason || 'Acesso negado para leitura.',
        },
      });
      return;
    }

    // 3. Query Parsing & Execution
    const parsedParams = SafeQueryBuilder.parseQueryParams(req.query, resource);
    const result = SafeQueryBuilder.executeSelect(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      resource,
      parsedParams,
      ApiGateway.toSecurityContext(ctx, req)
    );

    // Audit Log
    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'anonymous',
      action: 'api.request',
      resource_type: 'table',
      resource_id: tableName,
      metadata: { method: 'GET', rowCount: result.data.length, limit: result.limit },
    });

    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'Erro ao consultar registros.',
      },
    });
  }
});

// 3. GET /rest/v1/:table/:id — Single Record Lookup
restApiRouter.get('/rest/v1/:table/:id', (req: ApiGatewayRequest, res: Response) => {
  try {
    const ctx = req.apiContext!;
    const tableName = req.params.table.toLowerCase();
    const id = req.params.id;

    const resource = SchemaIntrospectionService.getResource(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName
    );

    if (!resource) {
      res.status(404).json({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `A tabela '${tableName}' não existe.`,
        },
      });
      return;
    }

    const perm = ApiPermissionEngine.canExecute(
      ctx.projectId,
      ctx.environmentId,
      tableName,
      ctx.callerRole,
      'READ'
    );

    if (!perm.allowed) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado.' },
      });
      return;
    }

    const parsedParams = SafeQueryBuilder.parseQueryParams({ ...req.query, [resource.primaryKey]: `eq.${id}` }, resource);
    const result = SafeQueryBuilder.executeSelect(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      resource,
      parsedParams,
      ApiGateway.toSecurityContext(ctx, req)
    );

    if (result.data.length === 0) {
      res.status(404).json({
        error: {
          code: 'RECORD_NOT_FOUND',
          message: `Registro com ID '${id}' não encontrado em '${tableName}'.`,
        },
      });
      return;
    }

    res.json(result.data[0]);
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: err.message },
    });
  }
});

// 4. POST /rest/v1/:table — Single or Bulk Insert
restApiRouter.post('/rest/v1/:table', (req: ApiGatewayRequest, res: Response) => {
  try {
    const ctx = req.apiContext!;
    const tableName = req.params.table.toLowerCase();
    const body = req.body;

    const resource = SchemaIntrospectionService.getResource(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName
    );

    if (!resource) {
      res.status(404).json({
        error: { code: 'RESOURCE_NOT_FOUND', message: `A tabela '${tableName}' não existe.` },
      });
      return;
    }

    const perm = ApiPermissionEngine.canExecute(
      ctx.projectId,
      ctx.environmentId,
      tableName,
      ctx.callerRole,
      'INSERT'
    );

    if (!perm.allowed) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado para inserção.' },
      });
      return;
    }

    if (!body || (typeof body !== 'object' && !Array.isArray(body))) {
      res.status(400).json({
        error: { code: 'INVALID_BODY', message: 'O corpo da requisição deve ser um objeto JSON ou array de objetos.' },
      });
      return;
    }

    const itemsToInsert = Array.isArray(body) ? body : [body];
    const insertedRows: any[] = [];

    // Validate columns for all items
    const validColNames = new Set(resource.columns.map((c) => c.name.toLowerCase()));

    for (const item of itemsToInsert) {
      for (const k of Object.keys(item)) {
        if (!validColNames.has(k.toLowerCase())) {
          res.status(400).json({
            error: {
              code: 'INVALID_COLUMN',
              message: `A coluna '${k}' não existe na tabela '${tableName}'.`,
            },
          });
          return;
        }
      }
    }

    // Execute inserts inside store
    for (const item of itemsToInsert) {
      const decision = securityEngine.evaluate(ApiGateway.toSecurityContext(ctx, req), 'table', tableName, 'INSERT', undefined, item);
      if (!decision.allowed) {
        denyRls(res, 'a inserção desta linha');
        return;
      }
      const inserted = projectDbManager.insertRow(
        ctx.organizationId,
        ctx.projectId,
        ctx.environmentId,
        tableName,
        item,
        ctx.requestId,
      );
      insertedRows.push(inserted);
    }

    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'anonymous',
      action: itemsToInsert.length > 1 ? 'api.bulk_insert' : 'api.insert',
      resource_type: 'table',
      resource_id: tableName,
      metadata: { count: insertedRows.length },
    });

    res.status(201).json(Array.isArray(body) ? insertedRows : insertedRows[0]);
  } catch (err: any) {
    res.status(400).json({
      error: { code: 'DATABASE_ERROR', message: err.message },
    });
  }
});

// 5. PATCH /rest/v1/:table/:id — Update Record by ID
restApiRouter.patch('/rest/v1/:table/:id', (req: ApiGatewayRequest, res: Response) => {
  try {
    const ctx = req.apiContext!;
    const tableName = req.params.table.toLowerCase();
    const id = req.params.id;
    const body = req.body;

    const resource = SchemaIntrospectionService.getResource(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName
    );

    if (!resource) {
      res.status(404).json({
        error: { code: 'RESOURCE_NOT_FOUND', message: `A tabela '${tableName}' não existe.` },
      });
      return;
    }

    const perm = ApiPermissionEngine.canExecute(
      ctx.projectId,
      ctx.environmentId,
      tableName,
      ctx.callerRole,
      'UPDATE'
    );

    if (!perm.allowed) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado para atualização.' },
      });
      return;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({
        error: { code: 'INVALID_BODY', message: 'O corpo do PATCH deve ser um objeto JSON.' },
      });
      return;
    }

    const existingRow = projectDbManager.getRow(ctx.organizationId, ctx.projectId, ctx.environmentId, tableName, id);
    if (!existingRow) {
      res.status(404).json({ error: { code: 'RECORD_NOT_FOUND', message: `Registro '${id}' não encontrado em '${tableName}'.` } });
      return;
    }
    const decision = securityEngine.evaluate(ApiGateway.toSecurityContext(ctx, req), 'table', tableName, 'UPDATE', existingRow, { ...existingRow, ...body });
    if (!decision.allowed) {
      denyRls(res, 'a atualização desta linha');
      return;
    }

    const updatedRow = projectDbManager.updateRow(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName,
      id,
      body,
      ctx.requestId,
    );

    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'anonymous',
      action: 'api.update',
      resource_type: 'table',
      resource_id: tableName,
      metadata: { rowId: id },
    });

    res.json(updatedRow);
  } catch (err: any) {
    if (err.message.includes('não encontrado')) {
      res.status(404).json({
        error: { code: 'RECORD_NOT_FOUND', message: err.message },
      });
      return;
    }
    res.status(400).json({
      error: { code: 'DATABASE_ERROR', message: err.message },
    });
  }
});

// 6. DELETE /rest/v1/:table/:id — Delete Record by ID
restApiRouter.delete('/rest/v1/:table/:id', (req: ApiGatewayRequest, res: Response) => {
  try {
    const ctx = req.apiContext!;
    const tableName = req.params.table.toLowerCase();
    const id = req.params.id;

    const resource = SchemaIntrospectionService.getResource(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName
    );

    if (!resource) {
      res.status(404).json({
        error: { code: 'RESOURCE_NOT_FOUND', message: `A tabela '${tableName}' não existe.` },
      });
      return;
    }

    const perm = ApiPermissionEngine.canExecute(
      ctx.projectId,
      ctx.environmentId,
      tableName,
      ctx.callerRole,
      'DELETE'
    );

    if (!perm.allowed) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: perm.reason || 'Acesso negado para exclusão.' },
      });
      return;
    }

    const existingRow = projectDbManager.getRow(ctx.organizationId, ctx.projectId, ctx.environmentId, tableName, id);
    if (!existingRow) {
      res.status(404).json({ error: { code: 'RECORD_NOT_FOUND', message: `Registro '${id}' não encontrado em '${tableName}'.` } });
      return;
    }
    const decision = securityEngine.evaluate(ApiGateway.toSecurityContext(ctx, req), 'table', tableName, 'DELETE', existingRow);
    if (!decision.allowed) {
      denyRls(res, 'a exclusão desta linha');
      return;
    }

    const success = projectDbManager.deleteRow(
      ctx.organizationId,
      ctx.projectId,
      ctx.environmentId,
      tableName,
      id,
      ctx.requestId,
    );

    if (!success) {
      res.status(404).json({
        error: { code: 'RECORD_NOT_FOUND', message: `Registro '${id}' não encontrado em '${tableName}'.` },
      });
      return;
    }

    db.logAudit({
      organization_id: ctx.organizationId,
      project_id: ctx.projectId,
      environment_id: ctx.environmentId,
      user_id: ctx.userId || 'anonymous',
      action: 'api.delete',
      resource_type: 'table',
      resource_id: tableName,
      metadata: { rowId: id },
    });

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({
      error: { code: 'DATABASE_ERROR', message: err.message },
    });
  }
});

// 7. Table API Settings Configuration Management Endpoints
restApiRouter.get('/api/projects/:id/environments/:envId/tables/:tableName/api-settings', (req, res) => {
  const perms = ApiPermissionEngine.getPermissions(req.params.id, req.params.envId, req.params.tableName);
  res.json(perms);
});

restApiRouter.patch('/api/projects/:id/environments/:envId/tables/:tableName/api-settings', (req, res) => {
  const perms = ApiPermissionEngine.setPermissions(req.params.id, req.params.envId, req.params.tableName, req.body);
  res.json(perms);
});
