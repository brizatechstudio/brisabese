import { LogItem } from '../types';

export const initialLogs: LogItem[] = [
  {
    id: 'log-001',
    timestamp: '26/02/2026 14:25:32',
    level: 'INFO',
    service: 'auth',
    message: 'User authentication succeeded via Google OAuth (lucas.moreira@brisabase.dev)',
    requestId: 'req_849201948',
    duration: '42ms',
    status: 200,
    details: { ip: '189.120.45.12', client: 'BrisaStore Web v2.4' }
  },
  {
    id: 'log-002',
    timestamp: '26/02/2026 14:24:18',
    level: 'INFO',
    service: 'database',
    message: 'Document inserted into collection [orders] -> id: doc_ord_7719',
    requestId: 'req_849201947',
    duration: '18ms',
    status: 201,
    details: { collection: 'orders', bytes: 1420 }
  },
  {
    id: 'log-003',
    timestamp: '26/02/2026 14:22:05',
    level: 'INFO',
    service: 'functions',
    message: 'Function execution [sendNotification] completed successfully in 312ms',
    requestId: 'req_849201946',
    duration: '312ms',
    status: 200,
    details: { function: 'sendNotification', memoryUsed: '142MB' }
  },
  {
    id: 'log-004',
    timestamp: '26/02/2026 14:20:41',
    level: 'WARNING',
    service: 'apis',
    message: 'Rate limit threshold warning: Client 177.34.89.2 reached 85% of tier limit',
    requestId: 'req_849201945',
    duration: '5ms',
    status: 429,
    details: { limit: '1000 req/min', current: '850 req/min' }
  },
  {
    id: 'log-005',
    timestamp: '26/02/2026 14:18:12',
    level: 'INFO',
    service: 'storage',
    message: 'File upload completed [hero-banner-brisabase.png] to bucket /images (3.4 MB)',
    requestId: 'req_849201944',
    duration: '840ms',
    status: 200,
    details: { bucket: 'images', sizeBytes: 3565158 }
  },
  {
    id: 'log-006',
    timestamp: '26/02/2026 14:15:02',
    level: 'ERROR',
    service: 'functions',
    message: 'Payment gateway timeout in [processPayment]: Connection reset by peer',
    requestId: 'req_849201943',
    duration: '5002ms',
    status: 504,
    details: { gateway: 'Stripe API', retryAttempt: 1 }
  },
  {
    id: 'log-007',
    timestamp: '26/02/2026 14:10:55',
    level: 'DEBUG',
    service: 'system',
    message: 'Automatic snapshot backup completed for database shard sa-east-1-primary',
    requestId: 'req_849201942',
    duration: '1420ms',
    status: 200,
    details: { snapshotSize: '2.4 GB', replicaSync: 'in-sync' }
  },
  {
    id: 'log-008',
    timestamp: '26/02/2026 14:05:30',
    level: 'INFO',
    service: 'database',
    message: 'Query executed [users] WHERE status = "active" LIMIT 50',
    requestId: 'req_849201941',
    duration: '6ms',
    status: 200,
    details: { scannedDocs: 50, indexUsed: 'idx_users_status' }
  }
];
