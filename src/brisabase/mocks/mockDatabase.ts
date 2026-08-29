import { TableSchema, TableRow, DbRelationship, DbMigration } from '../types';

export const MOCK_TABLES: TableSchema[] = [
  {
    name: 'users',
    rowCount: 48620,
    sizeBytes: 18454912,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'name', type: 'text', isNullable: false },
      { name: 'email', type: 'text', isNullable: false, isUnique: true },
      { name: 'role', type: 'text', isNullable: false, defaultValue: "'user'" },
      { name: 'active', type: 'boolean', isNullable: false, defaultValue: 'true' },
      { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
    ]
  },
  {
    name: 'products',
    rowCount: 1420,
    sizeBytes: 4210000,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'title', type: 'text', isNullable: false },
      { name: 'price', type: 'numeric', isNullable: false },
      { name: 'stock', type: 'integer', isNullable: false, defaultValue: '0' },
      { name: 'category', type: 'text', isNullable: true },
      { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
    ]
  },
  {
    name: 'orders',
    rowCount: 38910,
    sizeBytes: 24500000,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false },
      { name: 'total_amount', type: 'numeric', isNullable: false },
      { name: 'status', type: 'text', isNullable: false, defaultValue: "'pending'" },
      { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
    ]
  },
  {
    name: 'profiles',
    rowCount: 48620,
    sizeBytes: 12000000,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'user_id', type: 'uuid', isNullable: false, isUnique: true },
      { name: 'bio', type: 'text', isNullable: true },
      { name: 'avatar_url', type: 'text', isNullable: true },
      { name: 'phone', type: 'text', isNullable: true },
      { name: 'updated_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
    ]
  },
  {
    name: 'messages',
    rowCount: 184200,
    sizeBytes: 45000000,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'sender_id', type: 'uuid', isNullable: false },
      { name: 'channel_id', type: 'text', isNullable: false },
      { name: 'content', type: 'text', isNullable: false },
      { name: 'created_at', type: 'timestamp', isNullable: false, defaultValue: 'now()' }
    ]
  },
  {
    name: 'payments',
    rowCount: 38200,
    sizeBytes: 19800000,
    columns: [
      { name: 'id', type: 'uuid', isPrimaryKey: true, isNullable: false },
      { name: 'order_id', type: 'uuid', isNullable: false },
      { name: 'provider', type: 'text', isNullable: false },
      { name: 'transaction_code', type: 'text', isNullable: false, isUnique: true },
      { name: 'status', type: 'text', isNullable: false },
      { name: 'paid_at', type: 'timestamp', isNullable: true }
    ]
  }
];

export const MOCK_TABLE_ROWS: Record<string, TableRow[]> = {
  users: [
    { id: 'usr_101a89b', name: 'Lucas Silva', email: 'lucas.silva@tech.br', role: 'admin', active: true, created_at: '2026-08-01 14:22:10' },
    { id: 'usr_202b90c', name: 'Maria Souza', email: 'maria.souza@dev.io', role: 'user', active: true, created_at: '2026-08-02 09:15:43' },
    { id: 'usr_303c01d', name: 'João Santos', email: 'joao.santos@gmail.com', role: 'user', active: false, created_at: '2026-08-02 11:40:02' },
    { id: 'usr_404d12e', name: 'Ana Oliveira', email: 'ana.oliveira@empresa.com', role: 'moderator', active: true, created_at: '2026-08-03 16:05:22' },
    { id: 'usr_505e23f', name: 'Carlos Ferreira', email: 'carlos.f@startup.co', role: 'user', active: true, created_at: '2026-08-03 20:11:58' },
    { id: 'usr_606f34a', name: 'Beatriz Costa', email: 'b.costa@design.br', role: 'user', active: true, created_at: '2026-08-04 08:30:11' }
  ],
  products: [
    { id: 'prod_881', title: 'Plano Pro SaaS (Anual)', price: 899.90, stock: 9999, category: 'Assinaturas', created_at: '2026-01-10 10:00:00' },
    { id: 'prod_882', title: 'Curso de React + TypeScript Advanced', price: 299.00, stock: 500, category: 'Cursos', created_at: '2026-02-14 11:30:00' },
    { id: 'prod_883', title: 'Mentoria BrisaBase 1-on-1', price: 1500.00, stock: 12, category: 'Serviços', created_at: '2026-03-01 15:00:00' },
    { id: 'prod_884', title: 'Licença API Keys Enterprise', price: 4900.00, stock: 100, category: 'Enterprise', created_at: '2026-04-12 18:20:00' }
  ],
  orders: [
    { id: 'ord_9001', user_id: 'usr_101a89b', total_amount: 899.90, status: 'completed', created_at: '2026-08-03 10:12:00' },
    { id: 'ord_9002', user_id: 'usr_202b90c', total_amount: 299.00, status: 'completed', created_at: '2026-08-03 12:45:00' },
    { id: 'ord_9003', user_id: 'usr_505e23f', total_amount: 1500.00, status: 'processing', created_at: '2026-08-04 07:20:00' }
  ],
  profiles: [
    { id: 'prof_01', user_id: 'usr_101a89b', bio: 'Senior Fullstack Engineer & Cloud Enthusiast', avatar_url: '', phone: '+55 11 98888-7777', updated_at: '2026-08-01 14:22:10' },
    { id: 'prof_02', user_id: 'usr_202b90c', bio: 'Frontend UI Architect @ Dev.io', avatar_url: '', phone: '+55 21 97777-6666', updated_at: '2026-08-02 09:15:43' }
  ],
  messages: [
    { id: 'msg_001', sender_id: 'usr_101a89b', channel_id: 'general', content: 'Boas-vindas à nova versão do BrisaBase!', created_at: '2026-08-04 09:00:00' },
    { id: 'msg_002', sender_id: 'usr_202b90c', channel_id: 'general', content: 'A velocidade do Realtime está incrível! 🚀', created_at: '2026-08-04 09:02:15' }
  ],
  payments: [
    { id: 'pay_7701', order_id: 'ord_9001', provider: 'Stripe', transaction_code: 'tx_3M8aK92L1', status: 'paid', paid_at: '2026-08-03 10:12:05' },
    { id: 'pay_7702', order_id: 'ord_9002', provider: 'Pix', transaction_code: 'pix_991823102', status: 'paid', paid_at: '2026-08-03 12:45:10' }
  ]
};

export const MOCK_RELATIONSHIPS: DbRelationship[] = [
  { id: 'rel_1', fromTable: 'users', fromColumn: 'id', toTable: 'profiles', toColumn: 'user_id', type: 'one-to-one' },
  { id: 'rel_2', fromTable: 'users', fromColumn: 'id', toTable: 'orders', toColumn: 'user_id', type: 'one-to-many' },
  { id: 'rel_3', fromTable: 'orders', fromColumn: 'id', toTable: 'payments', toColumn: 'order_id', type: 'one-to-one' },
  { id: 'rel_4', fromTable: 'users', fromColumn: 'id', toTable: 'messages', toColumn: 'sender_id', type: 'one-to-many' }
];

export const MOCK_MIGRATIONS: DbMigration[] = [
  { id: 'mig_001', version: '20260101_init', name: 'Create initial core tables (users, profiles)', appliedAt: '2026-01-01 00:00:00', executionTimeMs: 42, status: 'success' },
  { id: 'mig_002', version: '20260215_orders_payments', name: 'Add e-commerce orders and payments schema', appliedAt: '2026-02-15 10:12:00', executionTimeMs: 88, status: 'success' },
  { id: 'mig_003', version: '20260510_realtime_messages', name: 'Add channels and messages indexes', appliedAt: '2026-05-10 16:30:00', executionTimeMs: 31, status: 'success' },
  { id: 'mig_004', version: '20260801_add_user_roles', name: 'Add RBAC role field to users table', appliedAt: '2026-08-01 08:00:00', executionTimeMs: 15, status: 'success' }
];
