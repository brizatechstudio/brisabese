import { SchemaIntrospectionService, ApiResource } from './schemaIntrospection';

export class OpenApiGenerator {
  public static generateSpec(orgId: string, projId: string, envId: string, baseUrl: string = 'https://api.brisabase.dev'): any {
    const resources = SchemaIntrospectionService.getExposedResources(orgId, projId, envId);

    const paths: Record<string, any> = {};

    resources.forEach((r) => {
      const tablePath = `/rest/v1/${r.table}`;
      const itemPath = `/rest/v1/${r.table}/{id}`;

      paths[tablePath] = {
        get: {
          summary: `Listar ou filtrar registros da tabela '${r.table}'`,
          parameters: [
            { name: 'select', in: 'query', description: 'Seleção de colunas e relacionamentos', schema: { type: 'string' } },
            { name: 'order', in: 'query', description: 'Ordenação e.g. price.desc', schema: { type: 'string' } },
            { name: 'limit', in: 'query', description: 'Limite de registros (max 1000)', schema: { type: 'integer', default: 50 } },
            { name: 'offset', in: 'query', description: 'Offset de paginação', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': { description: 'Sucesso', content: { 'application/json': {} } },
            '401': { description: 'Não Autorizado' },
            '403': { description: 'Proibido' },
          },
        },
        post: {
          summary: `Inserir novo registro ou lote de registros na tabela '${r.table}'`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '201': { description: 'Registro(s) criado(s) com sucesso' },
            '400': { description: 'Dados ou tipos inválidos' },
            '409': { description: 'Violação de constraint única' },
          },
        },
      };

      paths[itemPath] = {
        get: {
          summary: `Obter um registro da tabela '${r.table}' por ID`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Sucesso' },
            '404': { description: 'Registro não encontrado' },
          },
        },
        patch: {
          summary: `Atualizar parcialmente um registro da tabela '${r.table}' por ID`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: {
            '200': { description: 'Atualizado com sucesso' },
            '404': { description: 'Registro não encontrado' },
          },
        },
        delete: {
          summary: `Excluir um registro da tabela '${r.table}' por ID`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '204': { description: 'Excluído com sucesso' },
            '404': { description: 'Registro não encontrado' },
          },
        },
      };
    });

    return {
      openapi: '3.0.0',
      info: {
        title: `BrisaBase REST API (Project: ${projId}, Environment: ${envId})`,
        version: '1.0.0',
        description: 'API REST automática, relacional, segura e isolada gerada dinamicamente pelo BrisaBase Database Engine.',
      },
      servers: [{ url: `${baseUrl}/rest/v1` }],
      paths,
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'apikey',
          },
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    };
  }
}
