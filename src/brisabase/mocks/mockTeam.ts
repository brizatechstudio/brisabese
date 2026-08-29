import { TeamMember } from '../types';

export const INITIAL_TEAM_MEMBERS: TeamMember[] = [
  { id: 'tm_01', name: 'Lucas Silva', email: 'lucas@brisabase.dev', avatarUrl: '', role: 'Owner', status: 'active', lastActive: 'Agora' },
  { id: 'tm_02', name: 'Maria Souza', email: 'maria@brisabase.dev', avatarUrl: '', role: 'Admin', status: 'active', lastActive: 'Há 12 min' },
  { id: 'tm_03', name: 'João Santos', email: 'joao@partner.com', avatarUrl: '', role: 'Developer', status: 'active', lastActive: 'Há 2h' },
  { id: 'tm_04', name: 'Ana Oliveira', email: 'ana@design.co', avatarUrl: '', role: 'Viewer', status: 'active', lastActive: 'Ontem' },
  { id: 'tm_05', name: 'Carlos Ferreira (Pendente)', email: 'carlos@finance.com', avatarUrl: '', role: 'Billing', status: 'pending', lastActive: 'Convite enviado' }
];
