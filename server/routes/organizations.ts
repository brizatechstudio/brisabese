import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateOrgName, validateSlug, ValidationError } from '../validators';

export const organizationsRouter = Router();

organizationsRouter.get('/api/organizations', async (req: AuthenticatedRequest, res: Response) => {
  const orgs = await controlRepository.listOrganizationsForUser(req.user!.id);
  res.json(orgs);
});

organizationsRouter.get('/api/organizations/:id', async (req: AuthenticatedRequest, res: Response) => {
  const org = await controlRepository.getOrganization(req.params.id);
  if (!org) {
    res.status(404).json({ error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organização não encontrada.' } });
    return;
  }
  res.json(org);
});

organizationsRouter.post('/api/organizations', async (req: AuthenticatedRequest, res: Response) => {
  const { name, slug } = req.body;
  const validName = validateOrgName(name);
  const validSlug = validateSlug(slug || name);

  const ownerId = req.user?.id || 'usr_owner_1';
  const newOrg = await controlRepository.createOrganization({ name: validName, slug: validSlug, owner_id: ownerId });
  res.status(201).json(newOrg);
});

organizationsRouter.patch('/api/organizations/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { name, slug } = req.body;
  const updates: any = {};
  if (name) updates.name = validateOrgName(name);
  if (slug) updates.slug = validateSlug(slug);

  const updated = await controlRepository.updateOrganization(req.params.id, updates);
  if (!updated) {
    res.status(404).json({ error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organização não encontrada.' } });
    return;
  }
  res.json(updated);
});

organizationsRouter.delete('/api/organizations/:id', async (req: AuthenticatedRequest, res: Response) => {
  const success = await controlRepository.deleteOrganization(req.params.id);
  if (!success) {
    res.status(404).json({ error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organização não encontrada.' } });
    return;
  }
  res.status(204).send();
});
