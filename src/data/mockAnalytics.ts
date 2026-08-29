export const mockRealtimeChartData24h = [
  { time: '00:00', requests: 45000, latency: 42, errors: 12 },
  { time: '02:00', requests: 32000, latency: 38, errors: 8 },
  { time: '04:00', requests: 21000, latency: 35, errors: 4 },
  { time: '06:00', requests: 28000, latency: 39, errors: 7 },
  { time: '08:00', requests: 68000, latency: 46, errors: 22 },
  { time: '10:00', requests: 95000, latency: 54, errors: 35 },
  { time: '12:00', requests: 110000, latency: 62, errors: 48 },
  { time: '14:00', requests: 124582, latency: 58, errors: 41 },
  { time: '16:00', requests: 118000, latency: 56, errors: 38 },
  { time: '18:00', requests: 104000, latency: 51, errors: 29 },
  { time: '20:00', requests: 88000, latency: 47, errors: 19 },
  { time: '22:00', requests: 62000, latency: 43, errors: 15 }
];

export const mockRealtimeChartData7d = [
  { time: 'Seg', requests: 620000, latency: 48, errors: 140 },
  { time: 'Ter', requests: 740000, latency: 51, errors: 165 },
  { time: 'Qua', requests: 890000, latency: 55, errors: 190 },
  { time: 'Qui', requests: 840000, latency: 52, errors: 175 },
  { time: 'Sex', requests: 980000, latency: 61, errors: 220 },
  { time: 'Sáb', requests: 520000, latency: 44, errors: 95 },
  { time: 'Dom', requests: 460000, latency: 41, errors: 80 }
];

export const mockRealtimeChartData30d = [
  { time: 'Semana 1', requests: 3800000, latency: 49, errors: 820 },
  { time: 'Semana 2', requests: 4200000, latency: 52, errors: 910 },
  { time: 'Semana 3', requests: 4600000, latency: 50, errors: 940 },
  { time: 'Semana 4', requests: 5100000, latency: 54, errors: 1020 }
];

export const mockServiceDistribution = [
  { name: 'Banco de Dados', value: 42, color: '#1677FF', requests: '1.76M' },
  { name: 'Autenticação', value: 24, color: '#12D9FF', requests: '1.01M' },
  { name: 'Storage', value: 18, color: '#10B981', requests: '756K' },
  { name: 'Funções', value: 10, color: '#F59E0B', requests: '420K' },
  { name: 'APIs', value: 6, color: '#7C3AED', requests: '252K' }
];

export const mockAnalyticsOverview = {
  requests: { value: '4.2M', growth: '+28.7%', subtitle: 'Últimas 24 horas' },
  users: { value: '248.5K', growth: '+12.4%', subtitle: 'Usuários ativos' },
  sessions: { value: '982.1K', growth: '+15.8%', subtitle: 'Sessões registradas' },
  errors: { value: '0.04%', growth: '-18.2%', subtitle: 'Taxa de erro global' },
  latency: { value: '48ms', growth: '-6.5%', subtitle: 'Tempo médio de resposta' }
};

export const mockStorageGrowthData = [
  { month: 'Set', used: 84 },
  { month: 'Out', used: 102 },
  { month: 'Nov', used: 128 },
  { month: 'Dez', used: 145 },
  { month: 'Jan', used: 168 },
  { month: 'Fev', used: 186.4 }
];

export const mockAnalyticsData = {
  requestsPerHour: mockRealtimeChartData24h,
  dbOperations: [
    { day: 'Seg', reads: 142000, writes: 38000 },
    { day: 'Ter', reads: 168000, writes: 42000 },
    { day: 'Qua', reads: 195000, writes: 51000 },
    { day: 'Qui', reads: 182000, writes: 47000 },
    { day: 'Sex', reads: 220000, writes: 64000 },
    { day: 'Sáb', reads: 110000, writes: 24000 },
    { day: 'Dom', reads: 98000, writes: 19000 }
  ],
  regionalLatency: [
    { region: 'América do Sul (São Paulo - sa-east-1)', latency: '12ms', share: '68%' },
    { region: 'América do Norte (N. Virginia - us-east-1)', latency: '68ms', share: '18%' },
    { region: 'Europa (Frankfurt - eu-west-1)', latency: '142ms', share: '10%' },
    { region: 'Ásia-Pacífico (Tóquio - ap-northeast-1)', latency: '210ms', share: '4%' }
  ]
};
