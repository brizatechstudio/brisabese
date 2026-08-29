import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateProjectName, validateSlug, ValidationError } from '../validators';

export const projectsRouter = Router();

projectsRouter.get('/api/projects', async (req: AuthenticatedRequest, res: Response) => {
  const requestedOrganization = typeof req.query.organization_id === 'string' ? req.query.organization_id : undefined;
  if (requestedOrganization && !await controlRepository.getOrganizationRole(req.user!.id, requestedOrganization)) {
    res.status(403).json({ error: { code: 'TENANT_FORBIDDEN', message: 'Organization access is denied.' } });
    return;
  }
  const projects = await controlRepository.listProjectsForUser(req.user!.id, requestedOrganization || req.organizationId);
  res.json(projects);
});

projectsRouter.get('/api/projects/:id', async (req: AuthenticatedRequest, res: Response) => {
  const proj = await controlRepository.getProject(req.params.id);
  if (!proj) {
    res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' } });
    return;
  }
  res.json(proj);
});

projectsRouter.post('/api/projects', async (req: AuthenticatedRequest, res: Response) => {
  const { name, slug, description, region, organization_id } = req.body;
  const validName = validateProjectName(name);
  const validSlug = slug ? validateSlug(slug) : undefined;

  let targetOrganization = organization_id || req.organizationId;
  if (!targetOrganization) {
    const organizations = await controlRepository.listOrganizationsForUser(req.user!.id);
    if (organizations.length !== 1) {
      res.status(400).json({ error: { code: 'ORGANIZATION_REQUIRED', message: 'organization_id is required when the account can access zero or multiple organizations.' } });
      return;
    }
    targetOrganization = organizations[0].id;
  }
  const role = await controlRepository.getOrganizationRole(req.user!.id, targetOrganization);
  if (!role || !['owner', 'admin', 'developer'].includes(role)) {
    res.status(403).json({ error: { code: 'PERMISSION_DENIED', message: 'Project creation requires owner, admin, or developer access.' } });
    return;
  }

  const result = await controlRepository.createProject({
    organization_id: targetOrganization,
    name: validName,
    slug: validSlug,
    description,
    region,
  });

  res.status(201).json(result.project);
});

projectsRouter.patch('/api/projects/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { name, description, region, status } = req.body;
  const updates: any = {};
  if (name) updates.name = validateProjectName(name);
  if (description !== undefined) updates.description = description;
  if (region) updates.region = region;
  if (status) updates.status = status;

  const updated = await controlRepository.updateProject(req.params.id, updates);
  if (!updated) {
    res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' } });
    return;
  }
  res.json(updated);
});

projectsRouter.delete('/api/projects/:id', async (req: AuthenticatedRequest, res: Response) => {
  const success = await controlRepository.deleteProject(req.params.id);
  if (!success) {
    res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' } });
    return;
  }
  res.status(204).send();
});
