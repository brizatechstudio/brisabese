import { BackupItem } from '../types';

export const INITIAL_BACKUPS: BackupItem[] = [
  { id: 'bak_20260804_0300', timestamp: '2026-08-04 03:00:00', sizeMb: 1845, type: 'automated', status: 'completed', downloadUrl: 'https://cdn.brisabase.dev/backups/bak_20260804_0300.sql.gz' },
  { id: 'bak_20260803_0300', timestamp: '2026-08-03 03:00:00', sizeMb: 1820, type: 'automated', status: 'completed', downloadUrl: 'https://cdn.brisabase.dev/backups/bak_20260803_0300.sql.gz' },
  { id: 'bak_20260802_0300', timestamp: '2026-08-02 03:00:00', sizeMb: 1795, type: 'automated', status: 'completed', downloadUrl: 'https://cdn.brisabase.dev/backups/bak_20260802_0300.sql.gz' },
  { id: 'bak_20260801_1520', timestamp: '2026-08-01 15:20:00', sizeMb: 1780, type: 'manual', status: 'completed', downloadUrl: 'https://cdn.brisabase.dev/backups/bak_20260801_1520.sql.gz' },
  { id: 'bak_20260731_0300', timestamp: '2026-07-31 03:00:00', sizeMb: 1750, type: 'automated', status: 'completed', downloadUrl: 'https://cdn.brisabase.dev/backups/bak_20260731_0300.sql.gz' }
];
