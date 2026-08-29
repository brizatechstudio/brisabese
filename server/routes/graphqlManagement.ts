import { Router } from 'express';
import { realProjectDatabase } from '../db/realProjectDatabase';
import { postgres } from '../db/postgres';

export const graphqlManagementRouter = Router();

function graphqlType(type: string): string {
  if (type === 'boolean') return 'Boolean';
  if (type === 'integer' || type === 'bigint') return 'Int';
  if (type === 'numeric' || type === 'real') return 'Float';
  return 'String';
}

function scope(req: any) {
  if (!req.organizationId || !req.projectId || !req.environmentId) throw new Error('GraphQL management scope is unavailable.');
  return { organizationId: req.organizationId, projectId: req.projectId, environmentId: req.environmentId };
}

graphqlManagementRouter.get('/api/graphql/schema', async (req, res) => {
  try {
    const tables = await realProjectDatabase.listTables(scope(req));
    const types = tables.map((table) => `type ${table.name} {\n${table.columns.map((column) => `  ${column.name}: ${graphqlType(column.type)}${column.isNullable === false ? '!' : ''}`).join('\n')}\n}`).join('\n\n');
    const queries = tables.flatMap((table) => [
      `  ${table.name}(limit: Int, offset: Int, where: JSON, orderBy: JSON): [${table.name}!]!`,
      `  ${table.name}_by_pk(id: ID!): ${table.name}`,
    ]).join('\n');
    const mutations = tables.flatMap((table) => [
      `  insert_${table.name}(object: JSON!): ${table.name}!`,
      `  update_${table.name}(id: ID!, patch: JSON!): ${table.name}`,
      `  delete_${table.name}(id: ID!): ${table.name}`,
    ]).join('\n');
    return res.json({
      endpoint: '/graphql/v1',
      subscriptionTransport: '/realtime/v1/websocket',
      version: 'v1',
      tables: tables.map((table) => ({ name: table.name, columns: table.columns })),
      sdl: `scalar JSON\n\n${types}\n\ntype Query {\n${queries}\n}\n\ntype Mutation {\n${mutations}\n}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: { code: 'GRAPHQL_SCHEMA_ERROR', message: process.env.NODE_ENV === 'production' ? 'Could not build GraphQL schema.' : error?.message || 'Could not build GraphQL schema.' } });
  }
});


graphqlManagementRouter.get('/api/graphql/persisted', async (req, res) => {
  try {
    const current = scope(req);
    const rows = await postgres.query<any>('SELECT sha256_hash AS hash,operation_name,created_at,last_used_at,use_count FROM graphql_persisted_queries WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 ORDER BY COALESCE(last_used_at,created_at) DESC LIMIT 200', [current.organizationId, current.projectId, current.environmentId]);
    return res.json(rows);
  } catch (error: any) { return res.status(500).json({ error: { code: 'GRAPHQL_PERSISTED_LIST_ERROR', message: process.env.NODE_ENV === 'production' ? 'Could not list persisted queries.' : error?.message || 'Could not list persisted queries.' } }); }
});

graphqlManagementRouter.delete('/api/graphql/persisted/:hash', async (req, res) => {
  try {
    const current = scope(req);
    const hash = String(req.params.hash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) return res.status(400).json({ error: { code: 'GRAPHQL_PERSISTED_HASH_INVALID', message: 'Persisted query hash is invalid.' } });
    const rows = await postgres.query<{ sha256_hash: string }>('DELETE FROM graphql_persisted_queries WHERE organization_id=$1 AND project_id=$2 AND environment_id=$3 AND sha256_hash=$4 RETURNING sha256_hash', [current.organizationId, current.projectId, current.environmentId, hash]);
    return rows[0] ? res.status(204).end() : res.status(404).json({ error: { code: 'GRAPHQL_PERSISTED_NOT_FOUND', message: 'Persisted query not found.' } });
  } catch (error: any) { return res.status(500).json({ error: { code: 'GRAPHQL_PERSISTED_DELETE_ERROR', message: process.env.NODE_ENV === 'production' ? 'Could not delete persisted query.' : error?.message || 'Could not delete persisted query.' } }); }
});
