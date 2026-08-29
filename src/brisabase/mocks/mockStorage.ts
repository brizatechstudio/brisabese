import { StorageBucket, StorageFile } from '../types';

export const INITIAL_BUCKETS: StorageBucket[] = [
  { id: 'bkt_avatars', name: 'avatars', isPublic: true, fileCount: 48620, sizeMb: 12400, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'], createdAt: '2025-11-10 09:00:00' },
  { id: 'bkt_images', name: 'images', isPublic: true, fileCount: 18400, sizeMb: 85200, allowedMimeTypes: ['image/*'], createdAt: '2025-11-12 11:30:00' },
  { id: 'bkt_documents', name: 'documents', isPublic: false, fileCount: 8900, sizeMb: 42100, allowedMimeTypes: ['application/pdf', 'application/msword'], createdAt: '2025-12-01 10:15:00' },
  { id: 'bkt_videos', name: 'videos', isPublic: true, fileCount: 1240, sizeMb: 112000, allowedMimeTypes: ['video/mp4', 'video/webm'], createdAt: '2026-01-05 14:00:00' },
  { id: 'bkt_backups', name: 'backups', isPublic: false, fileCount: 30, sizeMb: 15400, createdAt: '2026-01-20 08:00:00' },
  { id: 'bkt_public', name: 'public', isPublic: true, fileCount: 4200, sizeMb: 9800, createdAt: '2026-02-01 12:00:00' },
  { id: 'bkt_private', name: 'private', isPublic: false, fileCount: 3100, sizeMb: 18200, createdAt: '2026-02-15 16:45:00' },
  { id: 'bkt_uploads', name: 'uploads', isPublic: false, fileCount: 12850, sizeMb: 36800, createdAt: '2026-03-01 10:00:00' }
];

export const INITIAL_FILES: Record<string, StorageFile[]> = {
  bkt_avatars: [
    { id: 'file_01', bucketId: 'bkt_avatars', name: 'user_101a89b_avatar.jpg', sizeBytes: 245000, mimeType: 'image/jpeg', updatedAt: '2026-08-01 14:22:10', publicUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', visibility: 'public' },
    { id: 'file_02', bucketId: 'bkt_avatars', name: 'user_202b90c_avatar.jpg', sizeBytes: 198000, mimeType: 'image/jpeg', updatedAt: '2026-08-02 09:15:43', publicUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', visibility: 'public' },
    { id: 'file_03', bucketId: 'bkt_avatars', name: 'user_303c01d_avatar.png', sizeBytes: 312000, mimeType: 'image/png', updatedAt: '2026-08-02 11:40:02', publicUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', visibility: 'public' }
  ],
  bkt_images: [
    { id: 'file_11', bucketId: 'bkt_images', name: 'hero_banner_v2.png', sizeBytes: 2450000, mimeType: 'image/png', updatedAt: '2026-08-03 10:00:00', publicUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', visibility: 'public' },
    { id: 'file_12', bucketId: 'bkt_images', name: 'dashboard_preview.jpg', sizeBytes: 1850000, mimeType: 'image/jpeg', updatedAt: '2026-08-03 11:20:00', publicUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', visibility: 'public' }
  ],
  bkt_documents: [
    { id: 'file_21', bucketId: 'bkt_documents', name: 'relatorio_financeiro_q2.pdf', sizeBytes: 4890000, mimeType: 'application/pdf', updatedAt: '2026-07-30 18:00:00', publicUrl: 'https://cdn.brisabase.dev/documents/relatorio_financeiro_q2.pdf', visibility: 'private' },
    { id: 'file_22', bucketId: 'bkt_documents', name: 'contrato_prestacao_servicos.pdf', sizeBytes: 1200000, mimeType: 'application/pdf', updatedAt: '2026-08-01 10:30:00', publicUrl: 'https://cdn.brisabase.dev/documents/contrato_prestacao_servicos.pdf', visibility: 'private' }
  ]
};
