import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip
} from 'recharts';
import {
  Box, Users, Zap, Cloud, Plus, BookOpen, ShieldCheck,
  Code2, CheckCircle2, MoreHorizontal, Search, Grid2X2, List,
  Utensils, Smartphone, Crown, ArrowRight, Activity, Settings2
} from 'lucide-react';
import iconB from '../img/icon_B.png';
import { useApp } from '../context/AppContext';

const traffic = [
  {t:'07:00',v:16},{t:'08:00',v:20},{t:'09:00',v:36},{t:'10:00',v:30},
  {t:'11:00',v:45},{t:'12:00',v:50},{t:'13:00',v:38},{t:'14:00',v:44},
  {t:'15:00',v:84},{t:'16:00',v:61},{t:'17:00',v:49},{t:'18:00',v:44},
  {t:'19:00',v:62},{t:'20:00',v:57},{t:'21:00',v:79},{t:'22:00',v:93}
];

const serviceData = [
  { name: 'Banco de Dados', value: 42, color: '#0b8cff' },
  { name: 'Autenticação', value: 24, color: '#7448ff' },
  { name: 'Storage', value: 18, color: '#13d49a' },
  { name: 'Funções', value: 10, color: '#ffb01f' },
  { name: 'APIs', value: 6, color: '#6d7b9e' }
];

const projects = [
  {name:'BrisaStore',type:'E-commerce completo',metric:'124.5K',data:'2.4 GB',storage:'45 GB',status:'Produção',icon:Box, tone:'violet'},
  {name:'BrisaApp',type:'Aplicativo mobile',metric:'89.2K',data:'1.8 GB',storage:'28 GB',status:'Desenvolvimento',icon:Zap, tone:'blue'},
  {name:'FoodExpress',type:'Delivery app',metric:'156.8K',data:'3.2 GB',storage:'67 GB',status:'Produção',icon:Utensils, tone:'orange'}
];

const Panel: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-[#16325c] bg-[linear-gradient(145deg,rgba(8,20,42,.96),rgba(4,12,27,.96))] shadow-[0_14px_45px_rgba(0,0,0,.22)] ${className}`}>{children}</div>
);

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [projectView, setProjectView] = useState<'grid' | 'list'>('grid');

  const cycleTimeRange = () => {
    const next = timeRange === '24h' ? '7d' : timeRange === '7d' ? '30d' : '24h';
    setTimeRange(next);
    showToast('Período atualizado', `Dashboard simulado alterado para ${next === '24h' ? 'Últimas 24 horas' : next === '7d' ? 'Últimos 7 dias' : 'Últimos 30 dias'}.`, 'info');
  };

  const resourceAction = (label: string) => {
    if (label === 'Documentação') navigate('/docs');
    else if (label === 'Status') navigate('/usage');
    else showToast('Comunidade BrisaBase', 'Área de comunidade representada no mock. Integração externa ficará para a fase real.', 'info');
  };

  return (
    <div className="dashboard-grid w-full">
      <section className="min-w-0 space-y-4">
        <Panel className="hero-panel relative overflow-hidden p-6 lg:p-8 min-h-[265px] flex items-center">
          <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_85%_45%,rgba(0,124,255,.28),transparent_34%),linear-gradient(110deg,rgba(0,65,180,.30),transparent_58%)]" />
          <div className="relative z-10 max-w-[620px]">
            <h1 className="text-3xl lg:text-[36px] leading-tight font-extrabold tracking-tight text-white">Bem-vindo ao <span className="bg-gradient-to-r from-[#078cff] to-[#16d6f5] bg-clip-text text-transparent">BrisaBase!</span></h1>
            <p className="mt-1 text-xl text-slate-300">Sua base. Seu futuro.</p>
            <p className="mt-5 max-w-lg text-[15px] leading-6 text-slate-300/90">A plataforma completa de backend para criar, escalar e impulsionar seus aplicativos.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => window.dispatchEvent(new Event('brisabase:new-project'))} className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#087cff] to-[#0bbef7] font-semibold text-sm text-white shadow-[0_10px_30px_rgba(0,123,255,.28)] flex items-center gap-2"><Plus className="w-4 h-4"/> Novo Projeto</button>
              <button onClick={()=>navigate('/docs')} className="h-11 px-6 rounded-xl border border-[#27466f] bg-[#0b1831]/80 font-semibold text-sm text-slate-100 flex items-center gap-2 hover:border-cyan-400/50"><BookOpen className="w-4 h-4"/> Documentação</button>
            </div>
          </div>
          <div className="hidden lg:block absolute right-10 top-1/2 -translate-y-1/2">
            <img src={iconB} alt="BrisaBase" className="w-40 h-40 object-contain" />
          </div>
        </Panel>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            ['Projetos Ativos','12','+2 este mês',Box,'#1b69ff'],
            ['Usuários Autenticados','248.5K','+12.4%',Users,'#0ea5ff'],
            ['Requisições (24h)','4.2M','+28.7%',Zap,'#1ed6ff'],
            ['Armazenamento','186.4 GB','+8.2%',Cloud,'#3096ff']
          ].map(([label,val,delta,Icon,accent]:any)=><Panel key={label} className="p-4 min-h-[125px]">
            <div className="flex items-center gap-3 text-xs text-slate-300"><span className="w-9 h-9 rounded-xl bg-blue-500/10 grid place-items-center"><Icon className="w-4 h-4 text-cyan-400"/></span>{label}</div>
            <div className="mt-3 flex items-end justify-between gap-2"><div><div className="text-2xl font-bold">{val}</div><div className="mt-1 text-xs text-emerald-400">↑ {delta}</div></div><div className="h-8 w-20 opacity-90" style={{background:`linear-gradient(135deg,transparent 35%,${accent} 36%,transparent 39%,transparent 50%,${accent} 51%,transparent 54%,transparent 65%,${accent} 66%,transparent 69%)`}}/></div>
          </Panel>)}
        </div>

        <div className="grid xl:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)] gap-3">
          <Panel className="p-4 min-h-[335px]">
            <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><h2 className="font-semibold">Uso em Tempo Real</h2><span className="w-2 h-2 rounded-full bg-emerald-400"/><span className="text-[11px] text-slate-400">Sistema operacional</span></div><button onClick={cycleTimeRange} className="text-xs px-3 py-2 rounded-lg border border-[#20385d] text-slate-300 hover:border-cyan-400/40">{timeRange === '24h' ? 'Últimas 24 horas' : timeRange === '7d' ? 'Últimos 7 dias' : 'Últimos 30 dias'}⌄</button></div>
            <div className="h-[265px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={traffic}><defs><linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0b8cff" stopOpacity={.45}/><stop offset="100%" stopColor="#0b8cff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#16304e" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="t" stroke="#7890b0" fontSize={10} tickLine={false} axisLine={false}/><YAxis stroke="#7890b0" fontSize={10} tickLine={false} axisLine={false}/><Tooltip contentStyle={{background:'#071328',border:'1px solid #24466f',borderRadius:10}}/><Area type="monotone" dataKey="v" stroke="#0793ff" strokeWidth={2.5} fill="url(#trafficFill)" dot={false}/></AreaChart></ResponsiveContainer></div>
          </Panel>
          <Panel className="p-4 min-h-[335px]">
            <h2 className="font-semibold mb-2">Distribuição por Serviço</h2>
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="relative w-[155px] h-[155px]"><ResponsiveContainer><PieChart><Pie data={serviceData} innerRadius={48} outerRadius={66} paddingAngle={0} dataKey="value">{serviceData.map((x,i)=><Cell key={i} fill={x.color}/>)}</Pie></PieChart></ResponsiveContainer><div className="absolute inset-0 grid place-items-center text-center pointer-events-none"><div><div className="font-bold text-xl">4.2M</div><div className="text-[10px] text-slate-400">Requisições</div></div></div></div>
              <div className="space-y-3 text-[11px] min-w-[120px]">{serviceData.map(x=><div key={x.name} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-slate-300"><span className="w-2 h-2 rounded-sm" style={{background:x.color}}/>{x.name}</span><b>{x.value}%</b></div>)}</div>
            </div>
          </Panel>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Seus Projetos</h2><div className="flex items-center gap-2"><button onClick={() => navigate('/projects')} className="text-xs text-cyan-400 px-3">Ver todos →</button><button onClick={() => navigate('/projects')} className="hidden sm:flex h-8 w-64 items-center gap-2 px-3 rounded-lg border border-[#1d385f] bg-[#071329] text-slate-500 hover:text-slate-300 text-xs"><Search className="w-3.5 h-3.5"/> Buscar projetos...</button><button onClick={() => setProjectView('grid')} aria-label="Visualização em grade" className={`w-8 h-8 grid place-items-center rounded-lg border border-[#1d385f] ${projectView === 'grid' ? 'bg-[#0b1831] text-cyan-300' : 'text-slate-400'}`}><Grid2X2 className="w-4 h-4"/></button><button onClick={() => setProjectView('list')} aria-label="Visualização em lista" className={`w-8 h-8 grid place-items-center rounded-lg border border-[#1d385f] ${projectView === 'list' ? 'bg-[#0b1831] text-cyan-300' : 'text-slate-400'}`}><List className="w-4 h-4"/></button></div></div>
          <div className={projectView === 'grid' ? 'grid md:grid-cols-3 gap-3' : 'grid grid-cols-1 gap-3'}>{projects.map((p:any)=>{const I=p.icon;return <Panel key={p.name} className="p-4"><div className="flex items-start justify-between"><div className="flex gap-3"><span className={`w-10 h-10 rounded-xl grid place-items-center ${p.tone==='orange'?'bg-orange-500':'bg-blue-600'} shadow-lg`}><I className="w-5 h-5"/></span><div><div className="font-semibold">{p.name}</div><div className="text-xs text-slate-400">{p.type}</div></div></div><span className={`text-[10px] px-2 py-1 rounded-md border ${p.status==='Produção'?'text-emerald-400 border-emerald-500/30 bg-emerald-500/5':'text-blue-400 border-blue-500/30 bg-blue-500/5'}`}>{p.status}</span></div><div className="mt-4 grid grid-cols-3 divide-x divide-[#173150] text-center text-[10px] text-slate-400"><div><div className="font-semibold text-slate-100 text-xs">{p.metric}</div>usuários</div><div><div className="font-semibold text-slate-100 text-xs">{p.data}</div>dados</div><div><div className="font-semibold text-slate-100 text-xs">{p.storage}</div>storage</div></div><div className="mt-4 text-[10px] text-slate-500">Última atividade: há poucos minutos</div></Panel>})}</div>
        </div>

        <div className="rounded-2xl border border-blue-500/30 bg-[linear-gradient(90deg,rgba(30,80,180,.28),rgba(4,20,45,.94))] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="w-12 h-12 rounded-xl bg-amber-500/15 grid place-items-center"><Crown className="text-amber-400"/></span><div><div className="font-semibold">Desbloqueie ainda mais com o <span className="text-cyan-400">BrisaBase Pro</span></div><div className="text-xs text-slate-400">Mais armazenamento, funções avançadas e suporte prioritário</div></div></div><button onClick={()=>navigate('/billing')} className="px-6 h-10 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2">Fazer Upgrade <ArrowRight className="w-4 h-4"/></button></div>
      </section>

      <aside className="hidden 2xl:block space-y-3 min-w-[285px]">
        <Panel className="p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Atividade Recente</h2><button onClick={() => navigate('/logs')} className="text-xs text-cyan-400">Ver todas</button></div><div className="mt-5 space-y-5">{[[Users,'Novo usuário registrado','usuario@email.com','2 min'],[Cloud,'Arquivo enviado','imagens/produtos/','5 min'],[Code2,'Função executada','sendNotification','12 min'],[CheckCircle2,'Backup concluído','Projeto BrisaStore','1h'],[Activity,'API chamada','products/list','2h']].map(([Icon,t,s,tm]:any)=><div key={t} className="flex gap-3"><span className="w-8 h-8 shrink-0 rounded-full bg-blue-500/15 grid place-items-center"><Icon className="w-4 h-4 text-cyan-400"/></span><div className="min-w-0 flex-1"><div className="text-xs font-medium">{t}</div><div className="text-[11px] text-slate-400 truncate">{s}</div></div><span className="text-[10px] text-slate-500">{tm}</span></div>)}</div></Panel>
        <Panel className="p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Status dos Serviços</h2><span className="text-[10px] text-emerald-400">Todos online</span></div><div className="mt-5 space-y-4">{['Banco de Dados','Autenticação','Armazenamento','Funções','APIs','Console'].map(s=><div className="flex items-center justify-between text-xs" key={s}><span className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-400 rounded-full"/>{s}</span><span className="text-[10px] text-emerald-400">Operacional</span></div>)}</div></Panel>
        <Panel className="p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Recursos</h2><button onClick={() => navigate('/docs')} className="text-xs text-cyan-400">Ver todos</button></div><div className="mt-4 space-y-2">{[[BookOpen,'Documentação','Guias e tutoriais completos'],[Users,'Comunidade','Conecte-se com outros devs'],[Activity,'Status','Status dos serviços']].map(([Icon,t,s]:any)=><button key={t} onClick={() => resourceAction(t)} className="w-full p-3 rounded-xl border border-[#173258] bg-[#09162d] flex items-center gap-3 text-left hover:border-cyan-400/30"><span className="w-9 h-9 rounded-full bg-blue-500/15 grid place-items-center"><Icon className="w-4 h-4 text-cyan-400"/></span><div className="flex-1"><div className="text-xs font-medium">{t}</div><div className="text-[10px] text-slate-400">{s}</div></div><ArrowRight className="w-3.5 h-3.5 text-slate-500"/></button>)}</div></Panel>
      </aside>
    </div>
  );
};
