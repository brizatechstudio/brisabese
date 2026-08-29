import { Router, Response } from 'express';
import { controlRepository } from '../db/controlRepository';
import { emailService } from '../auth/emailService';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateEmail, validateMemberRole } from '../validators';
import { roleAllows } from '../middleware/auth';

export const membersRouter = Router();

membersRouter.get('/api/organizations/:id/members', async (req: AuthenticatedRequest, res: Response) => {
  const members = await controlRepository.listMembers(req.params.id);
  res.json(members);
});

membersRouter.post('/api/organizations/:id/members', async (req: AuthenticatedRequest, res: Response) => {
  const { email, role } = req.body;
  const validEm = validateEmail(email);
  const validRole = validateMemberRole(role || 'developer');

  const newMember = await controlRepository.addMember(req.params.id, { email: validEm, role: validRole });
  await emailService.sendEmail({ to: validEm, subject: 'Convite BrisaBase', body: 'Você recebeu um convite para acessar uma organização BrisaBase.' });
  res.status(201).json(newMember);
});

membersRouter.patch('/api/organization-members/:id', async (req: AuthenticatedRequest, res: Response) => {
  const member = await controlRepository.getMember(req.params.id);
  const roleForOrganization = member ? await controlRepository.getOrganizationRole(req.user!.id, member.organization_id) : null;
  if (!member || !roleAllows(roleForOrganization || undefined, 'admin')) {
    res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Membro não encontrado.' } });
    return;
  }
  const { role } = req.body;
  const validRole = validateMemberRole(role);
  const updated = await controlRepository.updateMember(req.params.id, validRole);
  if (!updated) {
    res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Membro não encontrado.' } });
    return;
  }
  res.json(updated);
});

membersRouter.delete('/api/organization-members/:id', async (req: AuthenticatedRequest, res: Response) => {
  const member = await controlRepository.getMember(req.params.id);
  const roleForOrganization = member ? await controlRepository.getOrganizationRole(req.user!.id, member.organization_id) : null;
  if (!member || !roleAllows(roleForOrganization || undefined, 'admin')) {
    res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Membro não encontrado.' } });
    return;
  }
  const success = await controlRepository.deleteMember(req.params.id);
  if (!success) {
    res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Membro não encontrado.' } });
    return;
  }
  res.status(204).send();
});
