import { SystemMetrics } from '../types';

export const CURRENT_METRICS: SystemMetrics = {
  cpuUsagePct: 24.8,
  memoryUsagePct: 58.4,
  requestsPerSec: 1420,
  avgLatencyMs: 18.5,
  errorRatePct: 0.08,
  activeDbConnections: 42,
  storageTotalGb: 1024,
  storageUsedGb: 256.4
};

export interface MetricPoint {
  time: string;
  cpu: number;
  memory: number;
  requests: number;
  latency: number;
  errors: number;
}

export const TIME_SERIES_24H: MetricPoint[] = [
  { time: '00:00', cpu: 18.2, memory: 52.1, requests: 840, latency: 14.2, errors: 0.02 },
  { time: '02:00', cpu: 15.1, memory: 51.4, requests: 620, latency: 12.8, errors: 0.01 },
  { time: '04:00', cpu: 12.8, memory: 50.8, requests: 480, latency: 11.5, errors: 0.00 },
  { time: '06:00', cpu: 22.4, memory: 54.2, requests: 1120, latency: 16.4, errors: 0.04 },
  { time: '08:00', cpu: 34.6, memory: 61.8, requests: 1850, latency: 21.2, errors: 0.09 },
  { time: '10:00', cpu: 28.4, memory: 58.9, requests: 1540, latency: 18.5, errors: 0.05 },
  { time: '12:00', cpu: 42.1, memory: 68.2, requests: 2410, latency: 26.8, errors: 0.12 },
  { time: '14:00', cpu: 38.9, memory: 65.4, requests: 2180, latency: 23.4, errors: 0.08 },
  { time: '16:00', cpu: 31.2, memory: 62.0, requests: 1720, latency: 19.1, errors: 0.06 },
  { time: '18:00', cpu: 26.5, memory: 57.3, requests: 1390, latency: 17.0, errors: 0.03 },
  { time: '20:00', cpu: 29.8, memory: 59.1, requests: 1620, latency: 18.2, errors: 0.05 },
  { time: '22:00', cpu: 21.4, memory: 53.6, requests: 980, latency: 15.0, errors: 0.02 }
];

export const TIME_SERIES_7D: MetricPoint[] = [
  { time: 'Seg', cpu: 28.5, memory: 58.0, requests: 1450, latency: 18.2, errors: 0.06 },
  { time: 'Ter', cpu: 31.2, memory: 61.4, requests: 1680, latency: 19.5, errors: 0.08 },
  { time: 'Qua', cpu: 35.8, memory: 64.2, requests: 1920, latency: 22.1, errors: 0.10 },
  { time: 'Qui', cpu: 29.4, memory: 59.8, requests: 1580, latency: 18.0, errors: 0.05 },
  { time: 'Sex', cpu: 44.1, memory: 72.5, requests: 2540, latency: 28.4, errors: 0.15 },
  { time: 'Sáb', cpu: 22.0, memory: 52.1, requests: 920, latency: 14.5, errors: 0.02 },
  { time: 'Dom', cpu: 18.6, memory: 49.8, requests: 780, latency: 13.1, errors: 0.01 }
];
