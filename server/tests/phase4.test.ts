import { db } from '../db/database';
import { projectDbManager } from '../db/projectDatabase';
import { SchemaIntrospectionService } from '../apiEngine/schemaIntrospection';
import { SafeQueryBuilder } from '../apiEngine/queryBuilder';
import { ApiPermissionEngine } from '../apiEngine/permissionEngine';
import { OpenApiGenerator } from '../apiEngine/openapiGenerator';
import { pathToFileURL } from 'node:url';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED (Phase 4): ${message}`);
  }
}

export async function runPhase4Tests() {
  console.log('🧪 Iniciando testes de validação da FASE 4 - API Engine Real...\n');

  const orgId = 'org_core_1';
  const projId = 'proj_main_1';
  const envId = 'env_prod_1';

  const store = projectDbManager.getOrCreateStore(orgId, projId, envId);

  // 1. Seed test database schema & data
  const nowStr = new Date().toISOString();

  store.tables.set('categories', {
    name: 'categories',
    schema: 'public',
    rowCount: 2,
    sizeBytes: 1024,
    createdAt: nowStr,
    updatedAt: nowStr,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true },
      { name: 'name', type: 'text', isNullable: false },
    ],
  });

  store.rows.set('categories', [
    { id: 'cat_1', name: 'Eletrônicos' },
    { id: 'cat_2', name: 'Livros' },
  ]);

  store.tables.set('products', {
    name: 'products',
    schema: 'public',
    rowCount: 3,
    sizeBytes: 2048,
    createdAt: nowStr,
    updatedAt: nowStr,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'price', type: 'numeric', isNullable: false },
      { name: 'category_id', type: 'uuid', isNullable: true },
      { name: 'password', type: 'text', isNullable: true },
    ],
  });

  store.rows.set('products', [
    { id: 'prod_1', name: 'Smartphone Pro', price: 1200, category_id: 'cat_1', password: 'secret_hash_1' },
    { id: 'prod_2', name: 'Notebook Ultrabook', price: 3500, category_id: 'cat_1', password: 'secret_hash_2' },
    { id: 'prod_3', name: 'Livro TypeScript Clean Code', price: 90, category_id: 'cat_2', password: 'secret_hash_3' },
  ]);

  store.relationships.push({
    id: 'rel_prod_cat',
    fromTable: 'products',
    fromColumn: 'category_id',
    toTable: 'categories',
    toColumn: 'id',
    type: 'one-to-one',
  });

  // Seed API Keys
  const pubKey = db.createApiKey(projId, { name: 'Test Public Key', type: 'public', environment_id: envId });
  const secKey = db.createApiKey(projId, { name: 'Test Secret Key', type: 'secret', environment_id: envId });

  assert(!!pubKey.fullSecretKey, 'Chave de API pública gerada com sucesso');
  assert(!!secKey.fullSecretKey, 'Chave de API secreta gerada com sucesso');

  // Test 1: Schema Introspection
  const resources = SchemaIntrospectionService.getExposedResources(orgId, projId, envId);
  const resourceNames = resources.map((r) => r.table);
  assert(resourceNames.includes('products'), 'SchemaIntrospection deve expor tabela products');
  assert(resourceNames.includes('categories'), 'SchemaIntrospection deve expor tabela categories');
  console.log('✅ Teste 1: SchemaIntrospectionService e descoberta dinâmica de tabelas validada.');

  // Test 2: System Table Exclusion
  store.tables.set('auth_users', {
    name: 'auth_users',
    schema: 'public',
    rowCount: 0,
    sizeBytes: 0,
    createdAt: nowStr,
    updatedAt: nowStr,
    columns: [{ name: 'id', type: 'uuid', isPrimaryKey: true }],
  });
  const filteredResources = SchemaIntrospectionService.getExposedResources(orgId, projId, envId);
  assert(!filteredResources.map((r) => r.table).includes('auth_users'), 'Tabelas reservadas como auth_users devem ser ignoradas');
  console.log('✅ Teste 2: Proteção e isolamento de tabelas do sistema validada.');

  // Test 3: SafeQueryBuilder - Parameter Parsing & Execution
  const prodResource = SchemaIntrospectionService.getResource(orgId, projId, envId, 'products')!;
  const parsedParams = SafeQueryBuilder.parseQueryParams(
    {
      select: 'id,name,price,categories(id,name)',
      order: 'price.desc',
      limit: '2',
      price: 'gt.100',
    },
    prodResource
  );

  assert(parsedParams.limit === 2, 'Limit deve ser 2');
  assert(!parsedParams.selectFields?.includes('password'), 'Campos protegidos como password devem ser filtrados');

  const queryResult = SafeQueryBuilder.executeSelect(orgId, projId, envId, prodResource, parsedParams);
  assert(queryResult.data.length === 2, 'Query com filtro price gt 100 e limit 2 deve retornar 2 registros');
  assert(queryResult.data[0].price === 3500, 'Ordenação price.desc deve colocar Notebook Ultrabook (3500) em primeiro lugar');
  assert(!!queryResult.data[0].categories, 'Expansão de relacionamento categories deve funcionar');
  console.log('✅ Teste 3: SafeQueryBuilder (filtros, ordenação, paginação e relacionamento) validado.');

  // Test 4: ApiPermissionEngine
  const permPublicRead = ApiPermissionEngine.canExecute(projId, envId, 'products', 'anonymous', 'READ');
  assert(permPublicRead.allowed === true, 'Acesso de leitura anônimo deve ser permitido por padrão');

  const permPublicInsert = ApiPermissionEngine.canExecute(projId, envId, 'products', 'anonymous', 'INSERT');
  assert(permPublicInsert.allowed === false, 'Inserção anônima deve ser bloqueada por padrão');

  const permSecInsert = ApiPermissionEngine.canExecute(projId, envId, 'products', 'authenticated', 'INSERT');
  assert(permSecInsert.allowed === true, 'Inserção autenticada com Secret Key deve ser permitida');

  ApiPermissionEngine.setPermissions(projId, envId, 'products', { apiEnabled: false });
  const permDisabled = ApiPermissionEngine.canExecute(projId, envId, 'products', 'anonymous', 'READ');
  assert(permDisabled.allowed === false, 'Quando API é desativada, requisições devem ser bloqueadas');

  // Re-enable for subsequent tests
  ApiPermissionEngine.setPermissions(projId, envId, 'products', { apiEnabled: true });
  console.log('✅ Teste 4: ApiPermissionEngine (Acesso público vs. autenticado vs. tabela desativada) validado.');

  // Test 5: OpenApiGenerator
  const openApiSpec = OpenApiGenerator.generateSpec(orgId, projId, envId);
  assert(openApiSpec.openapi === '3.0.0', 'Deve gerar especificação OpenAPI 3.0');
  assert(!!openApiSpec.paths['/rest/v1/products'], 'OpenAPI deve conter rota /rest/v1/products');
  console.log('✅ Teste 5: Gerador de Especificação OpenAPI 3.0 dinâmica validado.');

  // Test 6: Database Modifications via Manager (Insert, Update, Delete)
  const insertedRow = projectDbManager.insertRow(orgId, projId, envId, 'products', {
    name: 'Teclado Gamer Mechanical',
    price: 350,
  });
  assert(!!insertedRow.id, 'Inserção via ProjectDatabaseManager deve retornar novo registro com ID');

  const updatedRow = projectDbManager.updateRow(orgId, projId, envId, 'products', insertedRow.id, {
    price: 299,
  });
  assert(updatedRow.price === 299, 'Atualização de registro deve alterar campos informados');

  const deleted = projectDbManager.deleteRow(orgId, projId, envId, 'products', insertedRow.id);
  assert(deleted === true, 'Exclusão de registro deve retornar true');
  console.log('✅ Teste 6: Operações de Mutação (POST, PATCH, DELETE) validadas.');

  console.log('🎉 TODOS OS TESTES DA FASE 4 — API ENGINE REAL PASSARAM COM SUCESSO!\n');
}

// Auto-execute if run directly with tsx
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPhase4Tests().catch((err) => {
    console.error('❌ Erro nos testes da FASE 4:', err);
    process.exit(1);
  });
}
