import React, { FormEvent, useEffect, useState } from 'react';
import { BellRing, Send, RefreshCw, Smartphone, Clock3, XCircle } from 'lucide-react';
import { messagingService, MessagingDevice, MessagingMessage, MessagingStatus } from '../services/platformCompletionService';
import { advancedPlatformService } from '../services/advancedPlatformService';

export const MessagingPage: React.FC = () => {
  const [status, setStatus] = useState<MessagingStatus>({ provider: 'fcm', configured: false });
  const [devices, setDevices] = useState<MessagingDevice[]>([]);
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [platform, setPlatform] = useState<'all'|'web'|'android'|'ios'>('all');
  const [scheduledAt, setScheduledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [campaigns,setCampaigns]=useState<any[]>([]);
  const [templates,setTemplates]=useState<any[]>([]);
  const [segments,setSegments]=useState<any[]>([]); const [segmentId,setSegmentId]=useState('');
  const [campaignName,setCampaignName]=useState('');
  const [templateName,setTemplateName]=useState('');
  const [campaignChannel,setCampaignChannel]=useState<'push'|'email'|'sms'>('push');
  const [error, setError] = useState<string|null>(null);

  const load = async () => {
    setError(null);
    try {
      const [provider, deviceList, messageList, campaignList, templateList, segmentList] = await Promise.all([messagingService.status(), messagingService.listDevices(), messagingService.listMessages(), advancedPlatformService.messaging.campaigns(), advancedPlatformService.messaging.templates(), advancedPlatformService.segments.list()]);
      setStatus(provider); setDevices(deviceList); setMessages(messageList); setCampaigns(campaignList); setTemplates(templateList); setSegments(segmentList);
    } catch(cause:any){ setError(cause?.message||'Não foi possível carregar Messaging.'); }
  };
  useEffect(()=>{ void load(); },[]);

  const create = async(event:FormEvent)=>{
    event.preventDefault(); if(!body.trim())return; setBusy(true); setError(null);
    try {
      await messagingService.createMessage({ title:title.trim()||undefined, body:body.trim(), audience:platform==='all'?{}:{platform}, scheduledAt:scheduledAt?new Date(scheduledAt).toISOString():undefined });
      setTitle(''); setBody(''); setScheduledAt(''); await load();
    } catch(cause:any){ setError(cause?.message||'Falha ao criar mensagem.'); }
    finally{setBusy(false);}
  };

  const send = async(item:MessagingMessage)=>{ setBusy(true); setError(null); try{ await messagingService.send(item.id); await load(); }catch(cause:any){setError(cause?.message||'Falha ao enviar push.');}finally{setBusy(false);} };
  const cancel = async(item:MessagingMessage)=>{ if(!confirm('Cancelar esta mensagem agendada?'))return; setBusy(true); try{await messagingService.cancel(item.id); await load();}catch(cause:any){setError(cause?.message||'Falha ao cancelar mensagem.');}finally{setBusy(false);} };



  const createTemplate = async () => {
    if(!templateName.trim()||!body.trim())return;
    setBusy(true); setError(null);
    try{await advancedPlatformService.messaging.saveTemplate({name:templateName.trim(),channel:campaignChannel,subject:title.trim()||undefined,body:body.trim()});setTemplateName('');await load();}
    catch(cause:any){setError(cause?.message||'Falha ao salvar template.');}finally{setBusy(false);}
  };

  const createCampaign = async () => {
    if(!campaignName.trim()||!body.trim())return;
    setBusy(true); setError(null);
    try{
      await advancedPlatformService.messaging.createCampaign({name:campaignName.trim(),channel:campaignChannel,subject:title.trim()||undefined,body:body.trim(),audience:{...(platform==='all'?{}:{platform}),...(segmentId?{segmentId}:{})},scheduledAt:scheduledAt?new Date(scheduledAt).toISOString():undefined});
      setCampaignName(''); setTitle(''); setBody(''); setScheduledAt(''); await load();
    }catch(cause:any){setError(cause?.message||'Falha ao criar campanha.');}finally{setBusy(false);}
  };

  const activeDevices=devices.filter((item)=>item.status==='active').length;
  const delivered=messages.reduce((sum,item)=>sum+item.deliveredCount,0);

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><BellRing className="h-5 w-5 text-purple-400"/>Messaging / Push</h1><p className="mt-1 text-xs text-slate-400">Notificações Web, Android e iOS via FCM, com dispositivos, audiência e agendamento.</p></div>
      <div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status.configured?'bg-emerald-950 text-emerald-300':'bg-amber-950 text-amber-300'}`}>FCM {status.configured?'configurado':'aguardando credencial'}</span><button onClick={()=>void load()} disabled={busy} className="rounded-xl border border-slate-700 p-2.5 text-slate-300 hover:bg-slate-800"><RefreshCw className="h-4 w-4"/></button></div>
    </div>
    {error&&<div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">{error}</div>}
    {!status.configured&&<div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs text-amber-200">O módulo está implementado, mas o envio real fica bloqueado até configurar <code>FCM_SERVICE_ACCOUNT_JSON</code> ou <code>FCM_SERVICE_ACCOUNT_BASE64</code>. Nenhuma credencial Firebase é colocada no frontend.</div>}

    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Dispositivos ativos</span><div className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-100"><Smartphone className="h-5 w-5 text-cyan-400"/>{activeDevices}</div></div><div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Mensagens</span><div className="mt-2 text-2xl font-bold text-purple-300">{messages.length}</div></div><div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Entregas confirmadas pelo provider</span><div className="mt-2 text-2xl font-bold text-emerald-300">{delivered}</div></div></div>

    <form onSubmit={create} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="grid gap-4 md:grid-cols-2"><label className="space-y-1.5 text-xs text-slate-400">Título<input value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={255} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100"/></label><label className="space-y-1.5 text-xs text-slate-400">Audiência<select value={platform} onChange={(e)=>setPlatform(e.target.value as any)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100"><option value="all">Todos os dispositivos</option><option value="web">Web</option><option value="android">Android</option><option value="ios">iOS</option></select></label></div><label className="block space-y-1.5 text-xs text-slate-400">Mensagem<textarea value={body} onChange={(e)=>setBody(e.target.value)} maxLength={4000} rows={4} className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"/></label><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="space-y-1.5 text-xs text-slate-400">Agendar (opcional)<input type="datetime-local" value={scheduledAt} onChange={(e)=>setScheduledAt(e.target.value)} className="block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100"/></label><button disabled={busy||!body.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-40"><Send className="h-4 w-4"/>{scheduledAt?'Agendar':'Enviar agora'}</button></div></form>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"><div><h2 className="text-sm font-bold text-slate-100">Campanhas multicanal</h2><p className="mt-1 text-xs text-slate-500">Push usa FCM; e-mail usa SMTP; SMS usa Twilio. O envio só acontece quando o provider correspondente está realmente configurado.</p></div><div className="grid gap-3 md:grid-cols-6"><input value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder="Nome da campanha" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100"/><input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Nome do template" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100"/><select value={campaignChannel} onChange={e=>setCampaignChannel(e.target.value as any)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100"><option value="push">Push</option><option value="email">E-mail</option><option value="sms">SMS</option></select><select value={segmentId} onChange={e=>setSegmentId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100"><option value="">Todos / filtros básicos</option>{segments.map(item=><option key={item.id} value={item.id}>Segmento: {item.name}</option>)}</select><div className="flex gap-2 self-center"><span className="text-xs text-slate-500">{templates.length} templates</span><button type="button" onClick={()=>void createTemplate()} disabled={busy||!templateName.trim()||!body.trim()} className="text-xs font-semibold text-cyan-400 disabled:opacity-40">Salvar template</button></div><button type="button" onClick={()=>void createCampaign()} disabled={busy||!campaignName.trim()||!body.trim()} className="rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">Criar campanha</button></div><div className="grid gap-2 lg:grid-cols-2">{campaigns.slice(0,8).map(item=><div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs"><div className="flex items-center justify-between"><span className="font-semibold text-slate-200">{item.name}</span><span className="uppercase text-cyan-400">{item.channel} · {item.status}</span></div><div className="mt-1 text-slate-500">{item.deliveredCount||0}/{item.attemptedCount||0} entregues · {item.failedCount||0} falhas</div></div>)}</div></div>

    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40"><table className="w-full text-left text-xs"><thead className="border-b border-slate-800 bg-slate-950/70 text-slate-500"><tr><th className="px-4 py-3">Mensagem</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Tentativas</th><th className="px-4 py-3">Entregues</th><th className="px-4 py-3">Falhas</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-800/70">{messages.length===0?<tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nenhuma mensagem.</td></tr>:messages.map((item)=><tr key={item.id}><td className="max-w-sm px-4 py-3"><div className="font-semibold text-slate-200">{item.title||'Sem título'}</div><div className="mt-1 truncate text-slate-500">{item.body}</div>{item.scheduledAt&&<div className="mt-1 flex items-center gap-1 text-[10px] text-cyan-400"><Clock3 className="h-3 w-3"/>{new Date(item.scheduledAt).toLocaleString('pt-BR')}</div>}</td><td className="px-4 py-3 uppercase text-slate-300">{item.status}</td><td className="px-4 py-3 text-slate-400">{item.attemptedCount}</td><td className="px-4 py-3 text-emerald-400">{item.deliveredCount}</td><td className="px-4 py-3 text-red-400">{item.failedCount}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{item.status==='queued'&&<button onClick={()=>void send(item)} disabled={busy||!status.configured} className="rounded-lg border border-slate-700 p-2 text-emerald-300 disabled:opacity-30"><Send className="h-3.5 w-3.5"/></button>}{item.status==='queued'&&<button onClick={()=>void cancel(item)} disabled={busy} className="rounded-lg border border-slate-700 p-2 text-red-300"><XCircle className="h-3.5 w-3.5"/></button>}</div></td></tr>)}</tbody></table></div>
  </div>;
};
