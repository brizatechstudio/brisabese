import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { AuthenticatedRequest } from '../middleware/auth';

export const auditLogsRouter = Router();

auditLogsRouter.get('/api/organizations/:id/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  const logs = await controlRepository.listAuditLogs(req.params.id);
  res.json(logs);
});

auditLogsRouter.get('/api/projects/:id/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  const logs = await controlRepository.listAuditLogs(undefined, req.params.id);
  res.json(logs);
});
