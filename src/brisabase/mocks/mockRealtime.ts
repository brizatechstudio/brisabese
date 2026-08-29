import { RealtimeChannel } from '../types';

export const INITIAL_REALTIME_CHANNELS: RealtimeChannel[] = [
  { id: 'chan_orders', name: 'orders', activeConnections: 1204, eventsPerMin: 3200, status: 'online', description: 'Websockets para transmissão de status de pedidos e pagamentos em tempo real.' },
  { id: 'chan_messages', name: 'messages', activeConnections: 4892, eventsPerMin: 7800, status: 'online', description: 'Canal de chat e suporte com sincronização instantânea de estado.' },
  { id: 'chan_notifications', name: 'notifications', activeConnections: 821, eventsPerMin: 1400, status: 'online', description: 'Disparo de push/toast alerts de alta prioridade para o app.' },
  { id: 'chan_telemetry', name: 'telemetry', activeConnections: 1324, eventsPerMin: 12400, status: 'online', description: 'Coleta contínua de métricas de uso e dados de sensores de dispositivos.' }
];

export interface RealtimeEventMock {
  id: string;
  channel: string;
  event: string;
  payload: string;
  timestamp: string;
  latencyMs: number;
}

export const MOCK_REALTIME_STREAM: RealtimeEventMock[] = [
  { id: 'evt_001', channel: 'orders', event: 'order.updated', payload: '{"order_id": "ord_9003", "status": "processing"}', timestamp: '10:05:42', latencyMs: 28 },
  { id: 'evt_002', channel: 'messages', event: 'message.sent', payload: '{"channel": "general", "sender": "usr_202b90c"}', timestamp: '10:05:40', latencyMs: 34 },
  { id: 'evt_003', channel: 'notifications', event: 'push.broadcast', payload: '{"title": "Promoção Relâmpago", "recipients": 4800}', timestamp: '10:05:31', latencyMs: 22 },
  { id: 'evt_004', channel: 'telemetry', event: 'metric.ping', payload: '{"cpu": 38.2, "mem": 62.1, "node": "node-us-east-1a"}', timestamp: '10:05:25', latencyMs: 18 }
];
