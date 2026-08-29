import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateEnvironmentType, ValidationError } from '../validators';

export const environmentsRouter = Router();

environmentsRouter.get('/api/projects/:id/environments', async (req: AuthenticatedRequest, res: Response) => {
  const envs = await controlRepository.listEnvironments(req.params.id);
  res.json(envs);
});

environmentsRouter.post('/api/projects/:id/environments', async (req: AuthenticatedRequest, res: Response) => {
  const { name, type } = req.body;
  if (!name) throw new ValidationError('O nome do ambiente é obrigatório.');
  const validTyp = validateEnvironmentType(type || 'development');

  const env = await controlRepository.createEnvironment(req.params.id, { name, type: validTyp });
  res.status(201).json(env);
});

environmentsRouter.patch('/api/environments/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { name, status } = req.body;
  const updated = await controlRepository.updateEnvironment(req.params.id, { name, status });
  if (!updated) {
    res.status(404).json({ error: { code: 'ENVIRONMENT_NOT_FOUND', message: 'Ambiente não encontrado.' } });
    return;
  }
  res.json(updated);
});
