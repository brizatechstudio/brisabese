import { TeamMember } from '../types';

export const initialMembers: TeamMember[] = [
  {
    id: 'mem-1',
    name: 'Lucas Moreira',
    email: 'lucas.moreira@brisabase.dev',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'Owner',
    status: 'active',
    lastAccess: 'Agora mesmo',
    addedAt: '01/01/2026'
  },
  {
    id: 'mem-2',
    name: 'Beatriz Vasconcelos',
    email: 'beatriz.vasc@empresa.com.br',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    role: 'Admin',
    status: 'active',
    lastAccess: 'há 15 minutos',
    addedAt: '05/01/2026'
  },
  {
    id: 'mem-3',
    name: 'Rodrigo Alencar',
    email: 'rodrigo.dev@github.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'Developer',
    status: 'active',
    lastAccess: 'há 1 hora',
    addedAt: '12/01/2026'
  },
  {
    id: 'mem-4',
    name: 'Camila Fontana',
    email: 'camila.fontana@icloud.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    role: 'Viewer',
    status: 'active',
    lastAccess: 'há 4 horas',
    addedAt: '20/01/2026'
  },
  {
    id: 'mem-5',
    name: 'Henrique Faria',
    email: 'henrique.faria@partner.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    role: 'Developer',
    status: 'invited',
    lastAccess: 'Pendente',
    addedAt: '24/02/2026'
  }
];
