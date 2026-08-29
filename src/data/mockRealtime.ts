import { RealtimeConnection } from '../types';

export const initialRealtimeConnections: RealtimeConnection[] = [
  {
    id: 'conn-1',
    clientId: 'ws_cli_99210a',
    userId: 'usr_9a87f2e104cb',
    userName: 'Lucas Moreira',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    channel: 'channel:orders:live',
    status: 'connected',
    connectedSince: 'há 45 minutos',
    lastEvent: 'order_status_updated (12s atrás)',
    ip: '189.120.45.12',
    ping: 24
  },
  {
    id: 'conn-2',
    clientId: 'ws_cli_88419b',
    userId: 'usr_3b78c9d012ef',
    userName: 'Beatriz Vasconcelos',
    userAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    channel: 'channel:chat:support',
    status: 'connected',
    connectedSince: 'há 18 minutos',
    lastEvent: 'message_delivered (3s atrás)',
    ip: '177.89.201.44',
    ping: 32
  },
  {
    id: 'conn-3',
    clientId: 'ws_cli_77391c',
    userId: 'usr_8f12a34bc987',
    userName: 'Rodrigo Alencar',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    channel: 'channel:telemetry:gps',
    status: 'subscribed',
    connectedSince: 'há 2 horas',
    lastEvent: 'location_ping (1s atrás)',
    ip: '201.45.112.98',
    ping: 18
  },
  {
    id: 'conn-4',
    clientId: 'ws_cli_66284d',
    userId: 'usr_66c4d8e901a2',
    userName: 'Camila Fontana',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    channel: 'channel:dashboard:metrics',
    status: 'idle',
    connectedSince: 'há 30 minutos',
    lastEvent: 'metric_sync (5m atrás)',
    ip: '186.210.99.14',
    ping: 45
  },
  {
    id: 'conn-5',
    clientId: 'ws_cli_55190e',
    userId: 'usr_1098ef34a5bc',
    userName: 'Gabriel Siqueira',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    channel: 'channel:orders:live',
    status: 'connected',
    connectedSince: 'há 10 minutos',
    lastEvent: 'new_order_created (45s atrás)',
    ip: '179.180.22.61',
    ping: 28
  }
];
