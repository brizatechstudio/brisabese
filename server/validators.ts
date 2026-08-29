export class ValidationError extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code: string = 'VALIDATION_ERROR', statusCode: number = 422) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function validateEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email é obrigatório.', 'INVALID_EMAIL');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    throw new ValidationError('Formato de e-mail inválido.', 'INVALID_EMAIL');
  }
  return email.trim().toLowerCase();
}

export function validateProjectName(name: string): string {
  if (!name || typeof name !== 'string' || name.trim().length < 3) {
    throw new ValidationError('O nome do projeto deve ter no mínimo 3 caracteres.', 'INVALID_PROJECT_NAME');
  }
  if (name.trim().length > 100) {
    throw new ValidationError('O nome do projeto não pode exceder 100 caracteres.', 'INVALID_PROJECT_NAME');
  }
  return name.trim();
}

export function validateSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') return '';
  const cleaned = slug.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (cleaned.length < 2) {
    throw new ValidationError('O slug deve conter pelo menos 2 caracteres válidos (a-z, 0-9).', 'INVALID_SLUG');
  }
  return cleaned;
}

export function validateOrgName(name: string): string {
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new ValidationError('O nome da organização deve ter no mínimo 2 caracteres.', 'INVALID_ORG_NAME');
  }
  return name.trim();
}

export function validateMemberRole(role: string): 'owner' | 'admin' | 'developer' | 'viewer' | 'billing' {
  const allowed = ['owner', 'admin', 'developer', 'viewer', 'billing'];
  if (!role || !allowed.includes(role)) {
    throw new ValidationError(`Função de membro inválida. Deve ser uma de: ${allowed.join(', ')}`, 'INVALID_ROLE');
  }
  return role as any;
}

export function validateApiKeyType(type: string): 'public' | 'secret' | 'service' {
  const allowed = ['public', 'secret', 'service'];
  if (!type || !allowed.includes(type)) {
    throw new ValidationError(`Tipo de API Key inválido. Deve ser um de: ${allowed.join(', ')}`, 'INVALID_KEY_TYPE');
  }
  return type as any;
}

export function validateEnvironmentType(type: string): 'production' | 'staging' | 'development' {
  const allowed = ['production', 'staging', 'development'];
  if (!type || !allowed.includes(type)) {
    throw new ValidationError(`Tipo de ambiente inválido. Deve ser um de: ${allowed.join(', ')}`, 'INVALID_ENV_TYPE');
  }
  return type as any;
}
