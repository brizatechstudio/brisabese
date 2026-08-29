import { ApiEndpoint, ApiKeyItem, WebhookItem } from '../types';

export const MOCK_REST_ENDPOINTS: ApiEndpoint[] = [
  { id: 'ep_1', method: 'GET', path: '/rest/v1/users', service: 'database', requests24h: 420000, avgLatencyMs: 14, successRate: 99.9 },
  { id: 'ep_2', method: 'POST', path: '/rest/v1/users', service: 'database', requests24h: 12400, avgLatencyMs: 28, successRate: 99.5 },
  { id: 'ep_3', method: 'GET', path: '/rest/v1/orders', service: 'database', requests24h: 380000, avgLatencyMs: 18, successRate: 99.8 },
  { id: 'ep_4', method: 'POST', path: '/auth/v1/signup', service: 'auth', requests24h: 8900, avgLatencyMs: 65, successRate: 98.9 },
  { id: 'ep_5', method: 'POST', path: '/auth/v1/token', service: 'auth', requests24h: 142000, avgLatencyMs: 32, successRate: 99.7 },
  { id: 'ep_6', method: 'POST', path: '/storage/v1/object/upload', service: 'storage', requests24h: 24500, avgLatencyMs: 120, successRate: 99.2 },
  { id: 'ep_7', method: 'POST', path: '/functions/v1/send-email', service: 'functions', requests24h: 12480, avgLatencyMs: 182, successRate: 99.4 }
];

export const INITIAL_API_KEYS: ApiKeyItem[] = [
  {
    id: 'key_anon_01',
    name: 'Anon / Public Client Key',
    type: 'public',
    keyPrefix: 'bb_pub_live_9a8b',
    fullKeyMock: 'bb_pub_live_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
    createdAt: '2025-11-10 08:30:00',
    lastUsedAt: '2026-08-04 10:05:12'
  },
  {
    id: 'key_service_02',
    name: 'Service Admin Key (Full Access)',
    type: 'service',
    keyPrefix: 'bb_sec_live_1f2e',
    fullKeyMock: 'bb_sec_live_1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e',
    createdAt: '2025-11-10 08:30:00',
    lastUsedAt: '2026-08-04 10:04:45'
  },
  {
    id: 'key_mobile_03',
    name: 'Mobile App Secret',
    type: 'secret',
    keyPrefix: 'bb_sec_live_88a1',
    fullKeyMock: 'bb_sec_live_88a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9',
    createdAt: '2026-03-01 10:00:00',
    lastUsedAt: '2026-08-04 09:50:00'
  }
];

export const INITIAL_WEBHOOKS: WebhookItem[] = [
  { id: 'wh_stripe', name: 'Stripe Payment Events', targetUrl: 'https://api.brisabase.dev/functions/v1/process-payment', events: ['payment_intent.succeeded', 'customer.subscription.updated'], status: 'active', lastTriggeredAt: '2026-08-04 10:02:11', successRate: 99.9 },
  { id: 'wh_discord', name: 'Discord Alerts Bot', targetUrl: 'https://discord.com/api/webhooks/109283012938102/xyz891238', events: ['user.registered', 'backup.completed'], status: 'active', lastTriggeredAt: '2026-08-04 09:30:00', successRate: 100.0 },
  { id: 'wh_slack', name: 'Slack DevOps Feed', targetUrl: 'https://hooks.slack.com/services/T00/B00/XXXX', events: ['function.failed', 'rls.policy.changed'], status: 'active', lastTriggeredAt: '2026-08-03 14:20:00', successRate: 98.5 },
  { id: 'wh_analytics', name: 'Mixpanel Data Pipeline', targetUrl: 'https://api.mixpanel.com/track', events: ['user.login', 'order.created'], status: 'active', lastTriggeredAt: '2026-08-04 10:05:00', successRate: 99.8 }
];
