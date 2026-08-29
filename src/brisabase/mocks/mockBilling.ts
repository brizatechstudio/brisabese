export interface PlanTier {
  id: string;
  name: string;
  priceMonthly: number;
  description: string;
  isCurrentPlan?: boolean;
  isPopular?: boolean;
  features: string[];
  dbLimitGb: number | null;
  storageLimitGb: number | null;
  bandwidthLimitGb: number | null;
  functionsInvocationsLimit: string | number | null;
}

export const MOCK_BILLING_PLANS: PlanTier[] = [
  {
    id: 'plan_free',
    name: 'Free',
    priceMonthly: 0,
    description: 'Ideal para projetos pessoais, provas de conceito e protótipos.',
    features: ['Até 500 MB Postgres', '1 GB Storage', '2 GB Bandwidth/mês', '50K executions Functions/mês', 'Até 2 membros na equipe', 'Suporte via Comunidade'],
    dbLimitGb: 0.5,
    storageLimitGb: 1,
    bandwidthLimitGb: 2,
    functionsInvocationsLimit: '50.000'
  },
  {
    id: 'plan_pro',
    name: 'Pro',
    priceMonthly: 29,
    description: 'Para aplicações em produção com alta performance e suporte.',
    isCurrentPlan: true,
    isPopular: true,
    features: ['8 GB Postgres inclusos', '100 GB Storage inclusos', '250 GB Bandwidth/mês', '2M executions Functions/mês', 'Sem limite de membros', 'Backups diários automatizados', 'Suporte Prioritário 24/7'],
    dbLimitGb: 8,
    storageLimitGb: 100,
    bandwidthLimitGb: 250,
    functionsInvocationsLimit: '2.000.000'
  },
  {
    id: 'plan_team',
    name: 'Team',
    priceMonthly: 99,
    description: 'Para times em crescimento e escala acelerada de produtos.',
    features: ['32 GB Postgres inclusos', '500 GB Storage inclusos', '1 TB Bandwidth/mês', '10M executions Functions/mês', 'SLA 99.95% garantido', 'Suporte dedicado via Slack/Discord', 'SSO / SAML Integrado'],
    dbLimitGb: 32,
    storageLimitGb: 500,
    bandwidthLimitGb: 1024,
    functionsInvocationsLimit: '10.000.000'
  },
  {
    id: 'plan_enterprise',
    name: 'Enterprise',
    priceMonthly: 499,
    description: 'Arquitetura dedicada, conformidade SOC2/HIPAA e suporte customizado.',
    features: ['Cluster Postgres Dedicado', 'Storage customizável', 'Bandwidth ilimitado', 'Execuções ilimitadas', 'SLA 99.99%', 'Gerente de conta dedicado', 'Instalação On-Premises ou VPC Privada'],
    dbLimitGb: 1024,
    storageLimitGb: 5000,
    bandwidthLimitGb: 10000,
    functionsInvocationsLimit: 'Ilimitado'
  }
];

export const CURRENT_USAGE = {
  dbStorageMb: 3600, // 3.6 GB of 8 GB (45%)
  dbStorageLimitMb: 8000,
  storageMb: 62000, // 62 GB of 100 GB (62%)
  storageLimitMb: 100000,
  bandwidthMb: 95000, // 95 GB of 250 GB (38%)
  bandwidthLimitMb: 250000,
  functionsCount: 540000, // 540k of 2M (27%)
  functionsLimit: 2000000,
  apiRequestsCount: 1240000,
  apiRequestsLimit: 5000000
};
