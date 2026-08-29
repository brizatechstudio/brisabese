import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { ValidationError } from '../validators';

export const settingsRouter = Router();

settingsRouter.get('/api/projects/:id/settings', async (req: AuthenticatedRequest, res: Response) => {
  const envId = req.query.environment_id as string;
  if (envId) {
    const environment = await controlRepository.getEnvironment(envId);
    if (!environment || environment.project_id !== req.params.id) {
      throw new ValidationError('O ambiente não pertence ao projeto informado.', 'INVALID_ENVIRONMENT_SCOPE');
    }
  }
  const settings = await controlRepository.listSettings(req.params.id, envId);
  res.json(settings);
});

settingsRouter.post('/api/projects/:id/settings', async (req: AuthenticatedRequest, res: Response) => {
  const { key, value, environment_id } = req.body;
  if (!key) throw new ValidationError('A chave de configuração é obrigatória.');
  if (environment_id) {
    const environment = await controlRepository.getEnvironment(environment_id);
    if (!environment || environment.project_id !== req.params.id) {
      throw new ValidationError('O ambiente não pertence ao projeto informado.', 'INVALID_ENVIRONMENT_SCOPE');
    }
  }

  const setting = await controlRepository.setSetting(req.params.id, key, value, environment_id);
  res.status(200).json(setting);
});
