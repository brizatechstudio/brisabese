import { SqlDatabaseState } from '../types/sql';

export const initialSqlDatabaseState: SqlDatabaseState = {
  tables: [
    {
      id: 'tbl-users',
      schema: 'public',
      name: 'users',
      size: '18.4 MB',
      rlsEnabled: true,
      realtimeEnabled: true,
      createdAt: '2026-01-14T12:00:00.000Z',
      updatedAt: '2026-08-27T16:01:00.000Z',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true, defaultValue: 'gen_random_uuid()' },
        { name: 'email', type: 'text', nullable: false, unique: true },
        { name: 'full_name', type: 'text', nullable: true },
        { name: 'role', type: 'text', nullable: false, defaultValue: "'user'" },
        { name: 'is_active', type: 'boolean', nullable: false, defaultValue: 'true' },
        { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' }
      ],
      rows: [
        { id: '9a3b6a9c-9e0a-4b61-95ad-c2d2efc60c11', email: 'ana@brisabase.dev', full_name: 'Ana Souza', role: 'admin', is_active: true, created_at: '2026-08-24 10:32:11+00' },
        { id: '1d1cf076-c39e-4f53-a970-c521d2d4c88f', email: 'lucas@brisabase.dev', full_name: 'Lucas Moreira', role: 'developer', is_active: true, created_at: '2026-08-25 13:18:42+00' },
        { id: 'a9ce55a2-b458-4b77-b3ce-b58b8e387ee1', email: 'maria@exemplo.com', full_name: 'Maria Lima', role: 'user', is_active: true, created_at: '2026-08-26 09:05:00+00' }
      ]
    },
    {
      id: 'tbl-products',
      schema: 'public',
      name: 'products',
      size: '42.7 MB',
      rlsEnabled: true,
      realtimeEnabled: false,
      createdAt: '2026-02-03T12:00:00.000Z',
      updatedAt: '2026-08-27T15:55:00.000Z',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true, defaultValue: 'gen_random_uuid()' },
        { name: 'name', type: 'text', nullable: false },
        { name: 'sku', type: 'text', nullable: false, unique: true },
        { name: 'price', type: 'numeric(12,2)', nullable: false, defaultValue: '0' },
        { name: 'stock', type: 'integer', nullable: false, defaultValue: '0' },
        { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' }
      ],
      rows: [
        { id: 'a16fc046-793f-4f07-91f8-9d3675c44c91', name: 'Brisa Keyboard', sku: 'BR-KB-001', price: 349.9, stock: 31, created_at: '2026-08-18 15:22:00+00' },
        { id: 'a90dc933-47e3-43c7-b05b-55ef17292f1f', name: 'Brisa Mouse', sku: 'BR-MS-001', price: 199.9, stock: 68, created_at: '2026-08-19 11:04:00+00' },
        { id: '362af8ea-ecb1-4447-a85d-72a50541fd93', name: 'Brisa Hub', sku: 'BR-HB-001', price: 289.0, stock: 22, created_at: '2026-08-20 18:40:00+00' }
      ]
    },
    {
      id: 'tbl-orders',
      schema: 'public',
      name: 'orders',
      size: '96.2 MB',
      rlsEnabled: true,
      realtimeEnabled: true,
      createdAt: '2026-02-07T12:00:00.000Z',
      updatedAt: '2026-08-27T16:03:00.000Z',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true, defaultValue: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', nullable: false, references: 'public.users(id)' },
        { name: 'product_id', type: 'uuid', nullable: false, references: 'public.products(id)' },
        { name: 'total', type: 'numeric(12,2)', nullable: false },
        { name: 'status', type: 'text', nullable: false, defaultValue: "'pending'" },
        { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' }
      ],
      rows: [
        { id: 'ord-1001', user_id: '9a3b6a9c-9e0a-4b61-95ad-c2d2efc60c11', product_id: 'a16fc046-793f-4f07-91f8-9d3675c44c91', total: 349.9, status: 'paid', created_at: '2026-08-27 10:11:00+00' },
        { id: 'ord-1002', user_id: '1d1cf076-c39e-4f53-a970-c521d2d4c88f', product_id: 'a90dc933-47e3-43c7-b05b-55ef17292f1f', total: 199.9, status: 'pending', created_at: '2026-08-27 12:32:00+00' },
        { id: 'ord-1003', user_id: 'a9ce55a2-b458-4b77-b3ce-b58b8e387ee1', product_id: '362af8ea-ecb1-4447-a85d-72a50541fd93', total: 289, status: 'paid', created_at: '2026-08-27 14:48:00+00' }
      ]
    }
  ],
  indexes: [
    { id: 'idx-users-email', name: 'users_email_key', table: 'public.users', columns: ['email'], unique: true, method: 'btree', status: 'ready' },
    { id: 'idx-products-sku', name: 'products_sku_key', table: 'public.products', columns: ['sku'], unique: true, method: 'btree', status: 'ready' },
    { id: 'idx-orders-user-status', name: 'idx_orders_user_status', table: 'public.orders', columns: ['user_id', 'status'], method: 'btree', status: 'ready' }
  ],
  views: [
    {
      id: 'view-paid-orders-summary',
      schema: 'public',
      name: 'paid_orders_summary',
      materialized: false,
      definition: "select status, count(*) as total_orders, sum(total) as revenue from public.orders group by status",
      rowsEstimate: 3
    }
  ],
  extensions: ['pgcrypto', 'uuid-ossp', 'pg_stat_statements', 'vector'],
  savedQueries: [
    {
      id: 'saved-create-customer-table',
      name: 'Criar tabela customers',
      sql: `create table public.customers (\n  id uuid primary key default gen_random_uuid(),\n  email text not null unique,\n  name text,\n  plan text not null default 'free',\n  created_at timestamptz not null default now()\n);`,
      createdAt: '2026-08-27T12:00:00.000Z',
      updatedAt: '2026-08-27T12:00:00.000Z'
    },
    {
      id: 'saved-orders-paid',
      name: 'Pedidos pagos',
      sql: `select id, user_id, total, status, created_at\nfrom public.orders\nwhere status = 'paid'\norder by created_at desc\nlimit 100;`,
      createdAt: '2026-08-26T12:00:00.000Z',
      updatedAt: '2026-08-27T10:00:00.000Z'
    }
  ],
  history: []
};
