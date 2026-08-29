import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateApiKeyType, ValidationError } from '../validators';
import { roleAllows } from '../middleware/auth';

export const apiKeysRouter = Router();

apiKeysRouter.get('/api/projects/:id/api-keys', async (req: AuthenticatedRequest, res: Response) => {
  const keys = await controlRepository.listApiKeys(req.params.id);
  res.json(keys);
});

apiKeysRouter.post('/api/projects/:id/api-keys', async (req: AuthenticatedRequest, res: Response) => {
  const { name, type, environment_id } = req.body;
  if (!name) throw new ValidationError('O nome da API Key é obrigatório.', 'INVALID_KEY_NAME');
  const validTyp = validateApiKeyType(type || 'secret');
  if (environment_id) {
    const environment = await controlRepository.getEnvironment(environment_id);
    if (!environment || environment.project_id !== req.params.id) {
      throw new ValidationError('O ambiente não pertence ao projeto informado.', 'INVALID_ENVIRONMENT_SCOPE');
    }
  }

  const { apiKey, fullSecretKey } = await controlRepository.createApiKey(req.params.id, {
    name,
    type: validTyp,
    environment_id,
  });

  // Return the full secret key ONCE in response
  res.status(201).json({
    apiKey,
    fullSecretKey,
    notice: 'Guarde esta chave em local seguro. Ela não será exibida novamente.',
  });
});

apiKeysRouter.post('/api/api-keys/:id/revoke', async (req: AuthenticatedRequest, res: Response) => {
  const key = await controlRepository.getApiKey(req.params.id);
  const project = key ? await controlRepository.getProject(key.project_id) : null;
  const role = project ? await controlRepository.getOrganizationRole(req.user!.id, project.organization_id) : null;
  if (!key || !project || !roleAllows(role || undefined, 'admin')) {
    res.status(404).json({ error: { code: 'API_KEY_NOT_FOUND', message: 'API Key não encontrada.' } });
    return;
  }
  const revoked = await controlRepository.revokeApiKey(req.params.id);
  if (!revoked) {
    res.status(404).json({ error: { code: 'API_KEY_NOT_FOUND', message: 'API Key não encontrada.' } });
    return;
  }
  res.json(revoked);
});

apiKeysRouter.delete('/api/api-keys/:id', async (req: AuthenticatedRequest, res: Response) => {
  const key = await controlRepository.getApiKey(req.params.id);
  const project = key ? await controlRepository.getProject(key.project_id) : null;
  const role = project ? await controlRepository.getOrganizationRole(req.user!.id, project.organization_id) : null;
  if (!key || !project || !roleAllows(role || undefined, 'admin')) {
    res.status(404).json({ error: { code: 'API_KEY_NOT_FOUND', message: 'API Key não encontrada.' } });
    return;
  }
  const success = await controlRepository.deleteApiKey(req.params.id);
  if (!success) {
    res.status(404).json({ error: { code: 'API_KEY_NOT_FOUND', message: 'API Key não encontrada.' } });
    return;
  }
  res.status(204).send();
});
