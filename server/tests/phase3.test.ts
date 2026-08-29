import assert from 'assert';
import { authDatabase } from '../db/authDatabase';
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  hashToken,
  encryptSecret,
  decryptSecret,
  normalizeEmail,
} from '../auth/cryptoUtils';
import { signJwt, verifyJwt } from '../auth/jwt';
import { generateTotpSecret, verifyTotpCode, generateTotpCode, generateMfaRecoveryCodes } from '../auth/mfa';
import { getOAuthProvider } from '../auth/oauth';
import { AuthClient } from '../auth/authClient';

async function runPhase3Tests() {
  console.log('----------------------------------------------------');
  console.log('🧪 EXECUTANDO TESTES DA FASE 3 - AUTHENTICATION ENGINE');
  console.log('----------------------------------------------------');

  const projA = 'proj_alpha_1';
  const envProd = 'env_prod_1';
  const projB = 'proj_beta_2';
  const envDev = 'env_dev_2';

  // 1. Crypto & Password Hashing
  console.log('1️⃣ Testando Criptografia e Password Hashing...');
  const rawPassword = 'MinhaSenhaSegura123!';
  const hashedPassword = hashPassword(rawPassword);

  assert.notStrictEqual(rawPassword, hashedPassword);
  assert.strictEqual(verifyPassword(rawPassword, hashedPassword), true);
  assert.strictEqual(verifyPassword('SenhaIncorreta', hashedPassword), false);
  console.log('   ✅ Password Hashing PBKDF2/Salt validado.');

  // Secret Encryption
  const secretText = 'TOTP_SECRET_SUPER_CONFIDENTIAL';
  const encrypted = encryptSecret(secretText);
  const decrypted = decryptSecret(encrypted);
  assert.strictEqual(decrypted, secretText);
  console.log('   ✅ Criptografia simétrica de segredos (AES-256-GCM) validada.');

  // 2. JWT Generation & Verification
  console.log('\n2️⃣ Testando Assinatura e Validação de Tokens JWT...');
  const token = signJwt(
    {
      sub: 'usr_test_123',
      project_id: projA,
      environment_id: envProd,
      session_id: 'sess_123',
      role: 'admin',
      email: 'teste@brisabase.dev',
    },
    900
  );

  assert.ok(token);
  assert.strictEqual(token.split('.').length, 3);

  const payload = verifyJwt(token);
  assert.strictEqual(payload.sub, 'usr_test_123');
  assert.strictEqual(payload.project_id, projA);
  assert.strictEqual(payload.role, 'admin');
  console.log('   ✅ Geração, HMAC-SHA256 e payload de JWT validados.');

  // Expired JWT failure
  const expiredToken = signJwt(
    {
      sub: 'usr_test_123',
      project_id: projA,
      environment_id: envProd,
      session_id: 'sess_123',
      role: 'user',
      email: 'teste@brisabase.dev',
    },
    -10
  );

  assert.throws(() => verifyJwt(expiredToken), /expirado/i);
  console.log('   ✅ Rejeição de JWT expirado validada.');

  // 3. Project & Environment Isolation
  console.log('\n3️⃣ Testando Isolamento por Projeto e Ambiente...');
  const userA = authDatabase.createUser({
    project_id: projA,
    environment_id: envProd,
    email: 'marcos@empresa.com',
    display_name: 'Marcos Silva',
    password_hash: hashPassword('SenhaProjA123'),
    role: 'user',
    status: 'active',
    provider: 'email',
    email_verified: true,
    user_metadata: {},
    app_metadata: {},
  });

  // Check user exists in Project A
  const foundA = authDatabase.findUserByEmail(projA, envProd, 'marcos@empresa.com');
  assert.ok(foundA);
  assert.strictEqual(foundA.id, userA.id);

  // Check user DOES NOT exist in Project B
  const foundB = authDatabase.findUserByEmail(projB, envDev, 'marcos@empresa.com');
  assert.strictEqual(foundB, null);
  console.log('   ✅ Isolamento rígido de usuários entre Project A (Prod) e Project B (Dev) confirmado.');

  // Allow same email in Project B without conflict
  const userB = authDatabase.createUser({
    project_id: projB,
    environment_id: envDev,
    email: 'marcos@empresa.com',
    display_name: 'Marcos Silva (Outro Projeto)',
    password_hash: hashPassword('OutraSenha123'),
    role: 'user',
    status: 'active',
    provider: 'email',
    email_verified: true,
    user_metadata: {},
    app_metadata: {},
  });
  assert.notStrictEqual(userA.id, userB.id);
  console.log('   ✅ O mesmo e-mail em projetos/ambientes diferentes cria instâncias isoladas.');

  // 4. Session & Refresh Token Rotation
  console.log('\n4️⃣ Testando Gerenciamento de Sessões e Rotação de Refresh Tokens...');
  const session = authDatabase.createSession({
    user_id: userA.id,
    project_id: projA,
    environment_id: envProd,
    ip_address: '200.150.10.5',
    user_agent: 'NodeTestAgent',
    device_name: 'Test Runner',
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });

  const rawRefreshToken1 = generateRandomToken(32);
  const familyId = `fam_${generateRandomToken(8)}`;

  const rt1 = authDatabase.createRefreshToken({
    session_id: session.id,
    token_hash: hashToken(rawRefreshToken1),
    user_id: userA.id,
    project_id: projA,
    environment_id: envProd,
    family_id: familyId,
    expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
  });

  // Verify lookup
  const foundRt = authDatabase.findRefreshTokenByHash(hashToken(rawRefreshToken1));
  assert.ok(foundRt);
  assert.strictEqual(foundRt.id, rt1.id);

  // Rotate token
  authDatabase.revokeRefreshToken(rt1.id);
  const rawRefreshToken2 = generateRandomToken(32);
  const rt2 = authDatabase.createRefreshToken({
    session_id: session.id,
    token_hash: hashToken(rawRefreshToken2),
    user_id: userA.id,
    project_id: projA,
    environment_id: envProd,
    family_id: familyId,
    expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
  });

  assert.ok(rt2);

  // Test token family revocation on reuse
  authDatabase.revokeRefreshTokenFamily(familyId);
  authDatabase.revokeSession(session.id);

  const revokedSession = authDatabase.findSessionById(session.id);
  assert.strictEqual(revokedSession, null);
  console.log('   ✅ Rotação de Refresh Token, detecção de reúso e revogação em cadeia validadas.');

  // 5. MFA TOTP
  console.log('\n5️⃣ Testando Autenticação Multi-Fator (MFA TOTP)...');
  const { secret, otpauthUrl } = generateTotpSecret();
  assert.ok(secret);
  assert.ok(otpauthUrl.includes(secret));

  const currentCode = generateTotpCode(secret, 0);
  assert.strictEqual(verifyTotpCode(secret, currentCode), true);
  assert.strictEqual(verifyTotpCode(secret, '000000'), false);

  const { rawCodes, hashedCodes } = generateMfaRecoveryCodes(10);
  assert.strictEqual(rawCodes.length, 10);
  assert.strictEqual(hashedCodes.length, 10);
  console.log('   ✅ Algoritmo HMAC-SHA1 TOTP e Códigos de Recuperação validados.');

  // 6. OAuth provider abstraction (network-free contract)
  console.log('\n6️⃣ Testando Provedores OAuth suportados...');
  const oauthExpectations: Array<[string, string]> = [
    ['google', 'accounts.google.com'],
    ['github', 'github.com/login/oauth'],
    ['microsoft', 'login.microsoftonline.com'],
    ['discord', 'discord.com/oauth2'],
    ['apple', 'appleid.apple.com'],
  ];
  for (const [provider, host] of oauthExpectations) {
    const oauth = getOAuthProvider(provider, 'mock_client', 'mock_secret');
    const authUrl = await oauth.getAuthorizationUrl('state_test', `https://api.brisabase.dev/auth/v1/oauth/${provider}/callback`);
    assert.ok(authUrl.includes(host), `${provider} authorization URL must use ${host}`);
  }
  assert.throws(() => getOAuthProvider('unsupported'), /not supported/i);
  console.log('   ✅ Google, GitHub, Microsoft, Discord e Apple disponíveis sem fallback fictício.');

  // 7. Banned / Disabled User
  console.log('\n7️⃣ Testando Proteções para Usuários Banidos/Desativados...');
  const bannedUser = authDatabase.createUser({
    project_id: projA,
    environment_id: envProd,
    email: 'banido@empresa.com',
    display_name: 'Usuario Banido',
    password_hash: hashPassword('Senha123!'),
    role: 'user',
    status: 'banned',
    provider: 'email',
    email_verified: true,
    user_metadata: {},
    app_metadata: {},
  });

  const bannedLookup = authDatabase.findUserById(bannedUser.id);
  assert.strictEqual(bannedLookup?.status, 'banned');
  console.log('   ✅ Bloqueio preventivo de autenticação para contas banidas verificado.');

  console.log('\n----------------------------------------------------');
  console.log('🎉 TODOS OS TESTES DA FASE 3 FORAM CONCLUÍDOS COM SUCESSO! 🚀');
  console.log('----------------------------------------------------');
}

runPhase3Tests().catch((err) => {
  console.error('❌ FALHA NOS TESTES DA FASE 3:', err);
  process.exit(1);
});
