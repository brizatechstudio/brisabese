import React,{useEffect,useState}from'react';
import{billingService}from'../services';
import{CreditCard,Check,RefreshCw,ShieldCheck,ExternalLink,Receipt,RotateCcw}from'lucide-react';

const panel='rounded-2xl border border-slate-800 bg-slate-900/60 p-6';
const button='inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50';

export const BillingPage:React.FC=()=>{
  const[usage,setUsage]=useState<any>(null),[plans,setPlans]=useState<any[]>([]),[subscription,setSubscription]=useState<any>(null),[invoices,setInvoices]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);setError('');try{const[u,p,s,i]=await Promise.all([billingService.getCurrentUsage(),billingService.getPlans(),billingService.getSubscription(),billingService.getInvoices()]);setUsage(u);setPlans(p);setSubscription(s);setInvoices(i)}catch(e:any){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const checkout=async(plan:any)=>{try{if(!usage?.paymentProcessing)return;if(plan.priceMonthly===0){await billingService.changePlan(plan.id);await load();return}const result=await billingService.checkout(plan.id);if(result.url)location.assign(result.url)}catch(e:any){setError(e.message)}};
  const portal=async()=>{try{const r=await billingService.portal();if(r.url)location.assign(r.url)}catch(e:any){setError(e.message)}};
  return <div className="space-y-6 pb-12">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><CreditCard className="h-5 w-5 text-purple-400"/>Planos & Cobrança</h1>
        <p className="mt-1 text-xs text-slate-400">Beta público gratuito. A integração Paddle fica preparada, mas sem checkout ou cobrança enquanto o produto estiver em validação.</p>
      </div>
      <div className="flex gap-2">
        <button className={button} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Atualizar</button>
        {usage?.provider==='paddle'&&usage?.paymentProcessing&&<button className={button} onClick={()=>void portal()}><ExternalLink className="h-4 w-4"/>Portal Paddle</button>}
      </div>
    </div>
    {error&&<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">{error}</div>}
    {!loading&&usage&&!usage.paymentProcessing&&<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-emerald-300"><ShieldCheck className="h-4 w-4"/>Beta público gratuito</div>
      <p className="mt-2 text-xs text-slate-400">Nenhuma cobrança externa está ativa. O BrisaBase permanece com <code>BILLING_PROVIDER=disabled</code>. Quando os objetivos do beta forem validados, a ativação comercial será feita com <code>BILLING_PROVIDER=paddle</code> e credenciais Paddle de sandbox/live.</p>
    </div>}
    {usage&&<section className={panel}>
      <div className="flex items-center justify-between">
        <div><div className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Plano atual</div><div className="text-2xl font-black text-white">{usage.currentPlan}</div></div>
        {subscription?.cancel_at_period_end&&<span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-300">Cancela no fim do período</span>}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-5">{Object.entries(usage.limits||{}).map(([key,value]:any)=><div key={key} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="truncate text-[10px] uppercase text-slate-500">{key.replaceAll('_',' ')}</div>
        <div className="mt-1 text-sm font-bold text-slate-100">{Number(value.used||0).toLocaleString()} / {value.limit===null?'∞':Number(value.limit).toLocaleString()}</div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-purple-500" style={{width:`${Math.min(100,value.percent||0)}%`}}/></div>
        {value.overage>0&&<div className="mt-1 text-[10px] text-amber-300">Overage {Number(value.overage).toLocaleString()}</div>}
      </div>)}</div>
    </section>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{plans.map(p=>{
      const paid=p.priceMonthly>0||p.name==='Enterprise';
      const canSelect=!p.isCurrentPlan&&!loading&&(!paid||Boolean(usage?.paymentProcessing));
      return <article key={p.id} className={`${panel} flex flex-col justify-between ${p.isPopular?'ring-1 ring-purple-500':''}`}>
        <div>{p.isPopular&&<span className="rounded-full bg-purple-600 px-2 py-1 text-[10px] font-bold">POPULAR</span>}
          <h3 className="mt-3 text-lg font-bold">{p.name}</h3>
          <div className="mt-1 text-3xl font-black">{p.name==='Enterprise'?'Contato':`US$ ${p.priceMonthly}`}<span className="text-xs font-normal text-slate-500">{p.name==='Enterprise'?'':' /mês'}</span></div>
          <p className="mt-2 text-xs text-slate-500">{p.description}</p>
          <ul className="mt-4 space-y-2 text-xs">{p.features?.map((f:string)=><li key={f} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-purple-400"/>{f}</li>)}</ul>
        </div>
        <button disabled={!canSelect} onClick={()=>void checkout(p)} className={`${button} mt-5 w-full justify-center`}>
          {p.isCurrentPlan?'Plano atual':paid&&!usage?.paymentProcessing?'Disponível após o beta':p.name==='Enterprise'?'Contrato Enterprise':'Selecionar'}
        </button>
      </article>
    })}</div>
    <section className={panel}>
      <h2 className="flex items-center gap-2 text-sm font-bold"><Receipt className="h-4 w-4 text-purple-400"/>Invoices</h2>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2">Data</th><th>Status</th><th>Valor</th><th>Imposto</th><th></th></tr></thead><tbody>{invoices.map(inv=><tr key={inv.id} className="border-t border-slate-800"><td className="py-3">{new Date(inv.created_at).toLocaleDateString()}</td><td>{inv.status}</td><td>{inv.currency} {(Number(inv.amount_cents)/100).toFixed(2)}</td><td>{inv.currency} {(Number(inv.tax_cents||0)/100).toFixed(2)}</td><td className="text-right">{inv.hosted_invoice_url&&<a className="mr-3 text-purple-400" href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">Abrir</a>}{usage?.paymentProcessing&&inv.status==='paid'&&Number(inv.refunded_cents||0)<Number(inv.amount_cents)&&<button className="inline-flex items-center gap-1 text-amber-300" onClick={async()=>{if(confirm('Solicitar refund total desta invoice?')){try{await billingService.refund(inv.id);await load()}catch(e:any){setError(e.message)}}}}><RotateCcw className="h-3 w-3"/>Refund</button>}</td></tr>)}</tbody></table>{!invoices.length&&<p className="py-4 text-xs text-slate-500">Nenhuma invoice registrada — esperado durante o beta gratuito.</p>}</div>
    </section>
  </div>
};
