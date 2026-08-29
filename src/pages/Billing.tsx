import React, { useState } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  CreditCard,
  Crown,
  Check,
  Zap,
  HardDrive,
  Activity,
  Download,
  ShieldCheck,
  ArrowUpRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Billing: React.FC = () => {
  const { showToast } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro' | 'enterprise'>('pro');

  const plans = [
    {
      id: 'free',
      name: 'Starter',
      price: 'R$ 0',
      period: 'para sempre',
      desc: 'Ideal para protótipos, projetos pessoais e aprendizado.',
      features: [
        '500.000 requisições / mês',
        '1 GB de Banco de Dados NoSQL',
        '2 GB de Armazenamento CDN',
        '3 Funções Serverless',
        'Suporte comunitário no Discord'
      ],
      current: false
    },
    {
      id: 'pro',
      name: 'Plano Pro',
      price: 'R$ 149',
      period: 'por mês',
      desc: 'Para aplicações em produção com alta performance e escalabilidade.',
      features: [
        '5.000.000 requisições / mês',
        '50 GB de Banco de Dados NoSQL',
        '100 GB de Armazenamento CDN',
        'Funções Serverless Ilimitadas',
        'WebSockets Realtime de baixa latência',
        'Backups diários automáticos',
        'Suporte prioritário 24/7'
      ],
      current: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'R$ 899',
      period: 'por mês',
      desc: 'Clusters dedicados, VPC peering e SLA de 99.99% garantido em contrato.',
      features: [
        'Requisições e dados sob demanda',
        'Cluster isolado Single-Tenant',
        'VPC Peering e IP Fixo Dedicado',
        'SLA 99.99% com compensação financeira',
        'Gerente de Contas & Arquiteto Dedicado'
      ],
      current: false
    }
  ];

  const invoices = [
    { id: 'INV-2026-02', date: '01/02/2026', amount: 'R$ 149,00', status: 'Pago' },
    { id: 'INV-2026-01', date: '01/01/2026', amount: 'R$ 149,00', status: 'Pago' },
    { id: 'INV-2025-12', date: '01/12/2025', amount: 'R$ 149,00', status: 'Pago' }
  ];

  const handleSelectPlan = (planId: string, planName: string) => {
    if (planId === 'pro') return;
    setSelectedPlan(planId as any);
    showToast('Plano Atualizado!', `Você selecionou a assinatura ${planName}`, 'success');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="Faturamento & Planos"
        subtitle="Gerencie sua assinatura, limites de consumo de infraestrutura e histórico de pagamentos."
        badge={
          <Badge variant="cyan" dot>
            Plano Pro Ativo
          </Badge>
        }
      />

      {/* Usage Quotas Progress */}
      <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-slate-100">Consumo do Ciclo Atual (Renova em 01/03/2026)</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          {/* Requests */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Requisições HTTP</span>
              <span className="font-bold text-slate-200">1.42M / 5.0M (28%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#0B1628] overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full" style={{ width: '28%' }} />
            </div>
          </div>

          {/* Database */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Banco de Dados</span>
              <span className="font-bold text-slate-200">14.2 GB / 50 GB (28%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#0B1628] overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: '28%' }} />
            </div>
          </div>

          {/* Storage CDN */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">CDN Storage</span>
              <span className="font-bold text-slate-200">142.8 GB / 500 GB (28%)</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#0B1628] overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: '28%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Plans Pricing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {plans.map((p) => {
          const isCurrent = p.current;
          return (
            <div
              key={p.id}
              className={`p-6 rounded-2xl bg-[#07111F] border transition-all flex flex-col justify-between shadow-xl ${
                isCurrent
                  ? 'border-cyan-400 ring-2 ring-cyan-400/20 bg-gradient-to-b from-[#07111F] to-[#0B1628]'
                  : 'border-white/[0.08] hover:border-white/20'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-slate-100">{p.name}</h3>
                  {isCurrent && (
                    <Badge variant="cyan" size="sm" dot>
                      Plano Atual
                    </Badge>
                  )}
                </div>

                <div className="my-4">
                  <span className="text-3xl font-black text-slate-100">{p.price}</span>
                  <span className="text-xs text-slate-400 ml-1.5">/ {p.period}</span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed mb-6">{p.desc}</p>

                <div className="space-y-2.5 mb-8">
                  {p.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                variant={isCurrent ? 'secondary' : 'gradient'}
                size="md"
                disabled={isCurrent}
                onClick={() => handleSelectPlan(p.id, p.name)}
                className="w-full"
              >
                {isCurrent ? 'Plano Ativo' : 'Escolher este Plano'}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Payment Method & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Card */}
        <div className="p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-cyan-400" />
            <span>Forma de Pagamento</span>
          </h3>

          <div className="p-4 rounded-xl bg-[#020617] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 rounded bg-slate-800 border border-white/20 flex items-center justify-center font-bold text-[10px] text-white">
                  MC
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">Mastercard final •••• 8820</div>
                  <div className="text-[10px] text-slate-500">Expira em 12/2028</div>
                </div>
              </div>
              <Badge variant="success" size="sm">
                Padrão
              </Badge>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => showToast('Atualizar Cartão', 'Fluxo de pagamento aberto com sucesso', 'info')}
          >
            Alterar Cartão de Crédito
          </Button>
        </div>

        {/* Invoices History */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#07111F] border border-white/[0.08] shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-slate-100">Histórico de Faturas</h3>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0B1628] text-slate-400 font-mono text-[11px] uppercase border-b border-white/[0.08]">
                <tr>
                  <th className="py-2.5 px-4">Fatura</th>
                  <th className="py-2.5 px-4">Data</th>
                  <th className="py-2.5 px-4">Valor</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Recibo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-mono">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.03]">
                    <td className="py-2.5 px-4 font-semibold text-cyan-300">{inv.id}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-400">{inv.date}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-200">{inv.amount}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="success" size="sm">
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 text-right font-sans">
                      <button
                        onClick={() => showToast('Download Iniciado', `Fatura ${inv.id}.pdf baixada`, 'success')}
                        className="text-cyan-400 hover:underline flex items-center justify-end gap-1 ml-auto"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
