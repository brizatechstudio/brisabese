import crypto from 'node:crypto';
import { Request, Router } from 'express';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { controlRepository } from '../db/controlRepository';
import { postgres } from '../db/postgres';

export const developerRouter = Router();

type ScopedRequest = Request & { organizationId?: string; projectId?: string; environmentId?: string; user?: { id: string; role: string } };

function scope(req: ScopedRequest) {
  if (!req.organizationId || !req.projectId || !req.environmentId) throw new Error('Developer tooling requires an authenticated project and environment scope.');
  return { organizationId: req.organizationId, projectId: req.projectId, environmentId: req.environmentId };
}

function jsonSchema(type: string): Record<string, unknown> {
  if (['integer', 'bigint', 'smallint'].includes(type)) return { type: 'integer' };
  if (['numeric', 'real', 'double precision', 'decimal'].includes(type)) return { type: 'number' };
  if (type === 'boolean') return { type: 'boolean' };
  if (type === 'json' || type === 'jsonb') return { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] };
  if (type === 'uuid') return { type: 'string', format: 'uuid' };
  if (type.includes('timestamp')) return { type: 'string', format: 'date-time' };
  if (type === 'date') return { type: 'string', format: 'date' };
  return { type: 'string' };
}

function tsType(type: string, nullable: boolean): string {
  let resolved = 'string';
  if (['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision', 'decimal'].includes(type)) resolved = 'number';
  else if (type === 'boolean') resolved = 'boolean';
  else if (type === 'json' || type === 'jsonb') resolved = 'unknown';
  const value = nullable ? `${resolved} | null` : resolved;
  return value;
}

async function buildArtifacts(req: ScopedRequest) {
  const current = scope(req);
  const [tables, relationships] = await Promise.all([
    realProjectDatabase.listTables(current),
    realProjectDatabase.getRelationships(current),
  ]);
  const schemas: Record<string, unknown> = {};
  const paths: Record<string, unknown> = {};
  const typeBlocks: string[] = [];

  for (const table of tables) {
    const required = table.columns.filter((column) => column.isNullable === false && column.defaultValue === undefined).map((column) => column.name);
    const properties = Object.fromEntries(table.columns.map((column) => [column.name, { ...jsonSchema(column.type), nullable: column.isNullable !== false }]));
    schemas[table.name] = { type: 'object', properties, ...(required.length ? { required } : {}) };
    const pk = table.columns.filter((column) => column.isPrimaryKey);
    const itemPath = `/rest/v1/${table.name}/{id}`;
    paths[`/rest/v1/${table.name}`] = {
      get: {
        summary: `List ${table.name}`,
        parameters: [
          { name: 'select', in: 'query', schema: { type: 'string' } },
          { name: 'order', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'include', in: 'query', description: 'Comma-separated related tables from declared foreign keys (max 5). Related rows are RLS-filtered.', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Rows', content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${table.name}` } } } } } },
      },
      post: {
        summary: `Insert into ${table.name}`,
        requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [{ $ref: `#/components/schemas/${table.name}` }, { type: 'array', items: { $ref: `#/components/schemas/${table.name}` } }] } } } },
        responses: { '201': { description: 'Created' }, '403': { description: 'RLS denied' } },
      },
    };
    if (pk.length === 1) {
      paths[itemPath] = {
        parameters: [{ name: 'id', in: 'path', required: true, schema: jsonSchema(pk[0].type) }],
        get: { summary: `Get ${table.name} by primary key`, responses: { '200': { description: 'Row' }, '404': { description: 'Not found' } } },
        patch: { summary: `Update ${table.name} by primary key`, requestBody: { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${table.name}` } } } }, responses: { '200': { description: 'Updated' }, '403': { description: 'RLS denied' } } },
        delete: { summary: `Delete ${table.name} by primary key`, responses: { '204': { description: 'Deleted' }, '403': { description: 'RLS denied' } } },
      };
    }
    typeBlocks.push(`export interface ${table.name.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase())} {\n${table.columns.map((column) => `  ${JSON.stringify(column.name)}${column.isNullable !== false ? '?' : ''}: ${tsType(column.type, column.isNullable !== false)};`).join('\n')}\n}`);
  }

  const openapi = {
    openapi: '3.0.3',
    info: { title: 'BrisaBase REST API', version: 'v1', description: 'Generated from the isolated project PostgreSQL schema. RLS and Auth are enforced at runtime.' },
    servers: [{ url: '/' }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'apikey' },
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    'x-brisabase': { projectId: current.projectId, environmentId: current.environmentId, relationships },
  };
  const typescript = `// Generated by BrisaBase. Do not edit by hand.\n// Project: ${current.projectId} / Environment: ${current.environmentId}\n\n${typeBlocks.join('\n\n')}\n`;
  return { current, tables, relationships, openapi, typescript };
}

async function persistArtifact(req: ScopedRequest, kind: 'openapi' | 'typescript', content: string): Promise<string> {
  const current = scope(req);
  const checksum = crypto.createHash('sha256').update(content).digest('hex');
  const id = `devart_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await postgres.execute(
    'INSERT INTO developer_artifacts(id,organization_id,project_id,environment_id,kind,checksum,generated_by,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [id, current.organizationId, current.projectId, current.environmentId, kind, checksum, req.user?.id || 'system', JSON.stringify({ bytes: Buffer.byteLength(content) })],
  );
  await controlRepository.logAudit({ organization_id: current.organizationId, project_id: current.projectId, environment_id: current.environmentId, user_id: req.user?.id || 'system', action: `developer.${kind}.generated`, resource_type: 'developer_artifact', resource_id: id, metadata: { checksum } });
  return checksum;
}

developerRouter.get('/api/developer/openapi', async (req: ScopedRequest, res) => {
  try {
    const { openapi } = await buildArtifacts(req);
    const content = JSON.stringify(openapi);
    const checksum = await persistArtifact(req, 'openapi', content);
    res.setHeader('ETag', `"${checksum}"`);
    res.json(openapi);
  } catch (error: any) {
    res.status(500).json({ error: { code: 'DEVELOPER_OPENAPI_ERROR', message: process.env.NODE_ENV === 'production' ? 'Could not generate OpenAPI.' : error?.message || 'Could not generate OpenAPI.' } });
  }
});

developerRouter.get('/api/developer/typescript', async (req: ScopedRequest, res) => {
  try {
    const { typescript } = await buildArtifacts(req);
    const checksum = await persistArtifact(req, 'typescript', typescript);
    res.setHeader('ETag', `"${checksum}"`);
    res.type('text/typescript').send(typescript);
  } catch (error: any) {
    res.status(500).json({ error: { code: 'DEVELOPER_TYPES_ERROR', message: process.env.NODE_ENV === 'production' ? 'Could not generate TypeScript types.' : error?.message || 'Could not generate TypeScript types.' } });
  }
});

developerRouter.get('/api/developer/artifacts', async (req: ScopedRequest, res) => {
  try {
    const current = scope(req);
    const rows = await postgres.query<any>('SELECT id,kind,checksum,generated_by,generated_at,metadata FROM developer_artifacts WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY generated_at DESC LIMIT 100', [current.organizationId, current.projectId, current.environmentId]);
    res.json(rows.map((row) => ({ id: row.id, kind: row.kind, checksum: row.checksum, generatedBy: row.generated_by, generatedAt: new Date(row.generated_at).toISOString(), metadata: row.metadata || {} })));
  } catch (error: any) {
    res.status(500).json({ error: { code: 'DEVELOPER_ARTIFACT_ERROR', message: process.env.NODE_ENV === 'production' ? 'Could not list developer artifacts.' : error?.message || 'Could not list developer artifacts.' } });
  }
});
