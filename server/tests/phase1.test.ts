import { db, hashApiKey } from '../db/database';
import { validateEmail, validateProjectName, validateSlug, ValidationError } from '../validators';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

export async function runPhase1Tests() {
  console.log('🧪 Iniciando testes de validação da FASE 1 - Backend & Foundation...\n');

  // Test 1: Migrations & Seed initialization
  assert(db.migrationVersion === 1, 'Versão de migração do banco deve ser 1');
  const initialOrgs = db.getOrganizations();
  assert(initialOrgs.length > 0, 'Deve conter pelo menos 1 organização semeada');
  const org = initialOrgs[0];
  console.log('✅ Teste 1: Banco de Dados & Migrações inicializados com sucesso.');

  // Test 2: Project Creation & Environments Auto-Generation
  const projResult = db.createProject({
    organization_id: org.id,
    name: 'Projeto de Teste Automatizado',
    region: 'sa-east-1',
  });

  assert(!!projResult.project.id, 'Projeto deve ter um ID gerado');
  assert(projResult.environments.length === 3, 'Deve ter criado automaticamente 3 ambientes (Production, Staging, Development)');
  console.log('✅ Teste 2: Criação de Projeto & Ambientes automáticos validado.');

  // Test 3: API Key Hashing Security
  const keyResult = db.createApiKey(projResult.project.id, {
    name: 'Chave Backend Teste',
    type: 'secret',
  });

  assert(!!keyResult.fullSecretKey, 'Chave secreta completa deve ser retornada no momento da criação');
  assert(keyResult.apiKey.key_hash !== keyResult.fullSecretKey, 'A chave NÃO deve ser armazenada em texto puro');
  assert(keyResult.apiKey.key_hash === hashApiKey(keyResult.fullSecretKey), 'Hash SHA-256 deve ser armazenado corretamente');
  console.log('✅ Teste 3: Segurança de API Keys (Segredo mostrado 1 vez e salvo apenas HASH) validado.');

  // Test 4: Member Management
  const member = db.addMember(org.id, { email: 'dev.novo@brisabase.dev', role: 'developer' });
  assert(member.role === 'developer', 'Membro deve possuir role developer');

  const updatedMember = db.updateMemberRole(member.id, 'admin');
  assert(updatedMember?.role === 'admin', 'Membro deve ser atualizado para role admin');
  console.log('✅ Teste 4: Gerenciamento de Membros e Roles da Organização validado.');

  // Test 5: Audit Logs Recording
  const logs = db.getAuditLogs(org.id);
  assert(logs.length > 0, 'Deve registrar logs de auditoria para ações executadas');
  console.log('✅ Teste 5: Registro de Logs de Auditoria validado.');

  // Test 6: Project Settings
  const setting = db.setSetting(projResult.project.id, 'TIMEOUT_MS', '3000');
  assert(setting.value === '3000', 'Configuração do projeto deve ser registrada');
  console.log('✅ Teste 6: Configurações do Projeto (Project Settings) validadas.');

  // Test 7: Validation Handlers
  let caughtValidation = false;
  try {
    validateEmail('email-invalido');
  } catch (err: any) {
    if (err instanceof ValidationError) caughtValidation = true;
  }
  assert(caughtValidation, 'Validador de email deve rejeitar emails sem formato correto');
  console.log('✅ Teste 7: Validadores de Entrada e Tratamento de Erros validados.\n');

  console.log('🎉 TODOS OS TESTES DA FASE 1 PASSARAM COM SUCESSO!\n');
}

// Execute tests if run directly
if (process.argv[1] && process.argv[1].includes('phase1.test')) {
  runPhase1Tests().catch((err) => {
    console.error('❌ Falha nos testes da Fase 1:', err);
    process.exit(1);
  });
}
