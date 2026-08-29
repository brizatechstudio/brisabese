import { ApiKeyItem, WebhookItem } from '../types';

export const initialApiKeys: ApiKeyItem[] = [
  {
    id: 'key-1',
    name: 'Production Server Secret',
    keyPrefix: 'brisa_sec_live_9a87',
    fullKey: 'brisa_sec_live_9a87f2e104cb9881029481726a',
    role: 'Admin',
    createdAt: '10/01/2026',
    lastUsed: 'Agora mesmo'
  },
  {
    id: 'key-2',
    name: 'Web Public Key (Frontend)',
    keyPrefix: 'brisa_pk_live_44b1',
    fullKey: 'brisa_pk_live_44b1092847192837461928475c',
    role: 'Read',
    createdAt: '12/01/2026',
    lastUsed: 'há 2 minutos'
  },
  {
    id: 'key-3',
    name: 'Mobile App Client SDK',
    keyPrefix: 'brisa_pk_live_77e2',
    fullKey: 'brisa_pk_live_77e2193847291837492817462d',
    role: 'Write',
    createdAt: '15/01/2026',
    lastUsed: 'há 10 minutos'
  }
];

export const initialWebhooks: WebhookItem[] = [
  {
    id: 'wh-1',
    name: 'User Created Sync',
    event: 'auth.user.created',
    url: 'https://api.empresa.com.br/webhooks/users',
    status: 'active',
    lastDelivery: 'há 2 minutos (200 OK)',
    successRate: '99.8%'
  },
  {
    id: 'wh-2',
    name: 'Order Placed Webhook',
    event: 'database.orders.insert',
    url: 'https://logistica.empresa.com.br/hooks/new-order',
    status: 'active',
    lastDelivery: 'há 15 minutos (200 OK)',
    successRate: '100%'
  },
  {
    id: 'wh-3',
    name: 'Payment Status Updated',
    event: 'payments.charge.success',
    url: 'https://financeiro.empresa.com.br/conciliacao/pix',
    status: 'active',
    lastDelivery: 'há 1 hora (200 OK)',
    successRate: '99.4%'
  }
];
