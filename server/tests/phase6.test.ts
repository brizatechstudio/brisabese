import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LocalStorageAdapter } from '../storage/localStorageAdapter';
import { StoragePathUtils } from '../storage/pathUtils';
import { StoragePermissionEngine } from '../storage/permissionEngine';
import { storageEngine } from '../storage/storageEngine';
import { StorageOpContext } from '../storage/types';

const context: StorageOpContext = {
  organizationId: 'org_core_1',
  projectId: 'proj_ecommerce_1',
  environmentId: 'env_proj_ecommerce_1_production',
  userId: 'usr_owner_1',
  role: 'admin',
};

function expect(condition: unknown, message: string): asserts condition {
  assert.ok(condition, `TEST FAILED (Phase 6): ${message}`);
}

export async function runPhase6Tests() {
  console.log('🧪 Iniciando testes de validação da FASE 6 - Storage Engine Real...\n');
  const suffix = crypto.randomBytes(4).toString('hex');
  const bucketName = `files-${suffix}`;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

  // Validation and traversal protection
  expect(StoragePathUtils.normalizePath('images/hero.png') === 'images/hero.png', 'Normalização deve preservar paths relativos válidos');
  expect(StoragePathUtils.normalizePath('../secret.txt') === null, 'Path traversal deve ser bloqueado');
  expect(StoragePathUtils.normalizePath('/etc/passwd') === null, 'Paths absolutos devem ser bloqueados');
  expect(StoragePathUtils.isValidBucketName(bucketName), 'Nome de bucket válido deve ser aceito');
  expect(!StoragePathUtils.isValidBucketName('bad bucket'), 'Espaços em bucket devem ser bloqueados');
  console.log('✅ Teste 1: validação de bucket e path traversal.');

  const created = storageEngine.createBucket(context, { name: bucketName, isPublic: false, fileSizeLimit: 1024, allowedMimeTypes: ['image/png'] });
  expect(created.success && created.data, 'Bucket privado deve ser criado');

  const uploaded = await storageEngine.uploadObject(context, bucketName, 'users/avatar.png', png, 'image/png', { metadata: { userId: 'usr_owner_1' } });
  expect(uploaded.success && uploaded.data, 'Upload válido deve ser persistido');
  expect(uploaded.data!.checksum === crypto.createHash('sha256').update(png).digest('hex'), 'Checksum SHA-256 deve ser registrado');
  expect(uploaded.data!.metadata.userId === 'usr_owner_1', 'Metadata deve ser preservado');
  console.log('✅ Teste 2: upload físico, metadata e checksum.');

  const wrongMagic = await storageEngine.uploadObject(context, bucketName, 'users/forged.png', Buffer.from('not-a-png'), 'image/png');
  expect(!wrongMagic.success && wrongMagic.error?.code === 'INVALID_FILE_CONTENT', 'MIME e magic bytes incompatíveis devem ser bloqueados');
  const oversized = await storageEngine.uploadObject(context, bucketName, 'users/large.png', Buffer.alloc(1025), 'image/png');
  expect(!oversized.success && oversized.error?.code === 'FILE_TOO_LARGE', 'Limite por bucket deve ser aplicado');
  console.log('✅ Teste 3: validação de MIME, magic bytes e tamanho.');

  const listed = storageEngine.listObjectsPage(context, bucketName, { prefix: 'users/', limit: 1 });
  expect(listed.success && listed.data?.objects.length === 1 && listed.data.total === 1, 'Listagem com paginação deve retornar o objeto correto');
  const downloaded = await storageEngine.getObject(context, bucketName, 'users/avatar.png');
  expect(downloaded.success && downloaded.data?.content.equals(png), 'Download deve retornar o conteúdo original');
  console.log('✅ Teste 4: listagem e download.');

  const anonymous: StorageOpContext = { ...context, userId: undefined, role: 'anonymous' };
  const privateRead = await storageEngine.getObject(anonymous, bucketName, 'users/avatar.png');
  expect(!privateRead.success && privateRead.error?.code === 'FORBIDDEN', 'Bucket privado não pode ser lido anonimamente');
  const otherProjectRead = await storageEngine.getObject({ ...context, projectId: 'proj_mobile_saas', environmentId: 'env_proj_mobile_saas_production' }, bucketName, 'users/avatar.png');
  expect(!otherProjectRead.success && otherProjectRead.error?.code === 'BUCKET_NOT_FOUND', 'Isolamento entre projetos deve bloquear acesso cruzado');
  const otherEnvironmentRead = await storageEngine.getObject({ ...context, environmentId: 'env_proj_ecommerce_1_staging' }, bucketName, 'users/avatar.png');
  expect(!otherEnvironmentRead.success && otherEnvironmentRead.error?.code === 'BUCKET_NOT_FOUND', 'Isolamento entre ambientes deve bloquear acesso cruzado');
  console.log('✅ Teste 5: isolamento e bucket privado.');

  const copied = await storageEngine.copyObject(context, bucketName, 'users/avatar.png', 'archive/avatar-copy.png');
  expect(copied.success && copied.data?.path === 'archive/avatar-copy.png', 'Copy deve criar outro objeto');
  const moved = await storageEngine.moveObject(context, bucketName, 'archive/avatar-copy.png', 'archive/avatar-renamed.png');
  expect(moved.success && moved.data?.path === 'archive/avatar-renamed.png', 'Move/rename deve atualizar metadados');
  console.log('✅ Teste 6: copy e move/rename.');

  const signed = storageEngine.createSignedUrl(context, bucketName, 'users/avatar.png', 60);
  expect(signed.success && signed.data?.signedUrl.includes('token='), 'URL assinada deve conter token criptograficamente assinado');
  const token = new URL(`https://brisabase.test${signed.data!.signedUrl}`).searchParams.get('token')!;
  const signedContext = storageEngine.resolveAccessToken(token, 'read');
  expect(signedContext?.path === 'users/avatar.png' && signedContext.bucketName === bucketName, 'Token assinado deve resolver somente o objeto autorizado');
  expect(storageEngine.resolveAccessToken(`${token}x`, 'read') === null, 'Assinatura adulterada deve ser recusada');
  const signedUpload = storageEngine.createSignedUploadUrl(context, bucketName, 'users/new.png', 60);
  expect(signedUpload.success && signedUpload.data?.signedUrl.includes('/upload/'), 'Fundação de signed upload deve existir');
  console.log('✅ Teste 7: URLs assinadas e detecção de adulteração.');

  const policyCheck = StoragePermissionEngine.validateMimeType(['image/*'], 'image/jpeg');
  expect(policyCheck.allowed, 'Wildcard de MIME deve funcionar');
  expect(!StoragePermissionEngine.validateMimeType(['application/pdf'], 'image/png').allowed, 'MIME não permitido deve ser recusado');

  const versionedBucketName = `versions-${suffix}`;
  const versioned = storageEngine.createBucket(context, { name: versionedBucketName, isPublic: false, versioningEnabled: true, allowedMimeTypes: ['image/png'] });
  expect(versioned.success, 'Bucket com versionamento deve ser criado');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+vI5kQAAAAABJRU5ErkJggg==', 'base64');
  const firstVersion = await storageEngine.uploadObject(context, versionedBucketName, 'images/cover.png', image, 'image/png');
  const secondImage = Buffer.concat([image, Buffer.from('version-2')]);
  const secondVersion = await storageEngine.uploadObject(context, versionedBucketName, 'images/cover.png', secondImage, 'image/png');
  expect(firstVersion.success && firstVersion.data?.version === 1 && secondVersion.success && secondVersion.data?.version === 2, 'Uploads em bucket versionado devem incrementar a versão');
  expect(Object.keys((firstVersion.data?.metadata.thumbnails || {}) as object).length > 0, 'Imagens devem receber thumbnails automáticos sem expor chaves internas');
  const versions = storageEngine.listObjectVersions(context, versionedBucketName, 'images/cover.png');
  expect(versions.success && versions.data?.map((entry) => entry.version).join(',') === '2,1', 'Histórico deve incluir versões atual e anterior');
  const restoredVersion = await storageEngine.restoreObjectVersion(context, versionedBucketName, 'images/cover.png', 1);
  expect(restoredVersion.success && restoredVersion.data?.version === 3, 'Restaurar versão deve criar uma nova versão atual');
  const restoredContent = await storageEngine.getObject(context, versionedBucketName, 'images/cover.png');
  expect(restoredContent.success && restoredContent.data?.content.equals(image), 'Restauração deve recuperar o conteúdo da versão escolhida');
  const transformed = await storageEngine.transformImage(context, versionedBucketName, 'images/cover.png', { format: 'webp', quality: 80 });
  expect(transformed.success && transformed.data?.mimeType === 'image/webp' && transformed.data.content.length > 0, 'Transformação de imagem deve produzir derivado sem alterar o original');
  const softDeleted = await storageEngine.deleteObject(context, versionedBucketName, 'images/cover.png');
  expect(softDeleted.success && !(await storageEngine.getObject(context, versionedBucketName, 'images/cover.png')).success, 'Bucket versionado deve fazer soft delete por padrão');
  const restoredObject = storageEngine.restoreObject(context, versionedBucketName, 'images/cover.png');
  expect(restoredObject.success, 'Soft delete deve permitir restauração');
  await storageEngine.deleteObject(context, versionedBucketName, 'images/cover.png', { softDelete: false });
  expect(storageEngine.deleteBucket(context, versionedBucketName).success, 'Bucket versionado deve ser removível depois da exclusão definitiva');
  console.log('✅ Teste 8: versionamento, rollback, soft delete e transformação de imagens.');

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'brisabase-storage-'));
  try {
    const adapter = new LocalStorageAdapter(tempDir);
    await adapter.putObject('safe/object.bin', Buffer.from('adapter'), 'application/octet-stream');
    expect((await adapter.headObject('safe/object.bin'))?.size === 7, 'Adapter local deve gravar e consultar metadata');
    const stream = await adapter.getObjectStream('safe/object.bin');
    expect(Boolean(stream), 'Adapter local deve disponibilizar stream');
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8') === 'adapter', 'Stream do adapter deve entregar o conteúdo do objeto');
    await adapter.deleteObject('safe/object.bin');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  console.log('✅ Teste 8: LocalStorageAdapter e streaming.');

  await storageEngine.deleteObject(context, bucketName, 'users/avatar.png');
  await storageEngine.deleteObject(context, bucketName, 'archive/avatar-renamed.png');
  const removed = storageEngine.deleteBucket(context, bucketName);
  expect(removed.success, 'Limpeza do bucket de teste deve funcionar após remover objetos');
  console.log('🎉 TODOS OS TESTES DA FASE 6 — STORAGE ENGINE REAL PASSARAM COM SUCESSO!\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPhase6Tests().catch((error) => {
    console.error('❌ Erro nos testes da FASE 6:', error);
    process.exit(1);
  });
}
