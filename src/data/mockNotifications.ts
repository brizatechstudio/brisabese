import { NotificationItem } from '../types';

export const initialNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Novo usuário registrado',
    message: 'Mariana Duarte (mariana.duarte@gmail.com) concluiu o cadastro no projeto BrisaStore.',
    type: 'info',
    service: 'auth',
    read: false,
    timestamp: '2026-02-26T14:23:00Z',
    timeAgo: 'há 2 minutos'
  },
  {
    id: 'notif-2',
    title: 'Arquivo enviado com sucesso',
    message: 'hero-banner-brisabase.png (3.4 MB) foi salvo na pasta /images.',
    type: 'success',
    service: 'storage',
    read: false,
    timestamp: '2026-02-26T14:20:00Z',
    timeAgo: 'há 5 minutos'
  },
  {
    id: 'notif-3',
    title: 'Função executada',
    message: 'sendNotification completou 100 execuções com taxa de sucesso de 99.6%.',
    type: 'info',
    service: 'functions',
    read: false,
    timestamp: '2026-02-26T14:13:00Z',
    timeAgo: 'há 12 minutos'
  },
  {
    id: 'notif-4',
    title: 'Backup automático concluído',
    message: 'Snapshot diário do cluster sa-east-1 finalizado e replicado com sucesso.',
    type: 'success',
    service: 'system',
    read: true,
    timestamp: '2026-02-26T13:25:00Z',
    timeAgo: 'há 1 hora'
  },
  {
    id: 'notif-5',
    title: 'Alerta de Armazenamento',
    message: 'O storage atingiu 45% do limite contratado (45.6 GB / 100 GB).',
    type: 'warning',
    service: 'storage',
    read: true,
    timestamp: '2026-02-26T12:00:00Z',
    timeAgo: 'há 2 horas'
  },
  {
    id: 'notif-6',
    title: 'Nova API criada',
    message: 'API "Payments API" foi provisionada com 4 endpoints ativos.',
    type: 'info',
    service: 'apis',
    read: true,
    timestamp: '2026-02-26T10:00:00Z',
    timeAgo: 'há 4 horas'
  }
];
