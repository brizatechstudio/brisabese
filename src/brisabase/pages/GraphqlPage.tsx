import React, { useEffect, useMemo, useState } from 'react';
import { Braces, Copy, RefreshCw, ShieldCheck, Radio, Play, KeyRound, Trash2 } from 'lucide-react';

type PersistedInfo = { hash: string; operation_name?: string; created_at: string; last_used_at?: string; use_count: number };

type SchemaInfo = {
  endpoint: string;
  subscriptionTransport: string;
  version: string;
  tables: Array<{ name: string; columns: Array<{ name: string; type: string; isNullable?: boolean }> }>;
  sdl: string;
};

async function loadSchema(): Promise<SchemaInfo> {
  const response = await fetch('/api/graphql/schema');
  const payload = await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error?.message||`GraphQL schema request failed (${response.status}).`);
  return payload;
}

export const GraphqlPage: React.FC = () => {
  const [schema,setSchema]=useState<SchemaInfo|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState('');
  const [credential,setCredential]=useState('');
  const [queryText,setQueryText]=useState('query { __typename }');
  const [variablesText,setVariablesText]=useState('{}');
  const [result,setResult]=useState<any>(null);
  const [runBusy,setRunBusy]=useState(false);
  const [persistQuery,setPersistQuery]=useState(false);
  const [persistedHash,setPersistedHash]=useState('');
  const [persistedQueries,setPersistedQueries]=useState<PersistedInfo[]>([]);

  const load=async()=>{setBusy(true);setError(null);try{const [nextSchema,persistedResponse]=await Promise.all([loadSchema(),fetch('/api/graphql/persisted')]);setSchema(nextSchema);if(persistedResponse.ok)setPersistedQueries(await persistedResponse.json().catch(()=>[]));}catch(cause:any){setError(cause?.message||'Não foi possível gerar o schema GraphQL.');}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);

  const endpoint=useMemo(()=>`${window.location.origin}${schema?.endpoint||'/graphql/v1'}`,[schema]);
  const example=schema?.tables[0]?.name?`query List${schema.tables[0].name} {\n  ${schema.tables[0].name}(limit: 20) {\n    ${schema.tables[0].columns.slice(0,5).map((column)=>column.name).join('\n    ')}\n  }\n}`:'query { __typename }';

  const copy=async(label:string,value:string)=>{await navigator.clipboard.writeText(value);setCopied(label);window.setTimeout(()=>setCopied(''),1200);};
  const execute=async()=>{
    setRunBusy(true);setError(null);
    try{
      const variables=variablesText.trim()?JSON.parse(variablesText):{};
      const headers:Record<string,string>={'Content-Type':'application/json'};
      const auth=credential.trim();
      if(auth.startsWith('bb_'))headers.apikey=auth;else if(auth)headers.Authorization=`Bearer ${auth}`;
      const body:any={query:queryText,variables};
      if(persistQuery){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(queryText));const hash=Array.from(new Uint8Array(digest)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');body.extensions={persistedQuery:{version:1,sha256Hash:hash}};setPersistedHash(hash);}
      const response=await fetch('/graphql/v1',{method:'POST',headers,body:JSON.stringify(body)});
      const payload=await response.json().catch(()=>null);setResult(payload);
      if(!response.ok)throw new Error(payload?.errors?.[0]?.message||`GraphQL request failed (${response.status}).`);
    }catch(cause:any){setError(cause?.message||'GraphQL execution failed.');}
    finally{setRunBusy(false);}
  };
  const removePersisted=async(hash:string)=>{const response=await fetch(`/api/graphql/persisted/${encodeURIComponent(hash)}`,{method:'DELETE'});if(!response.ok){const payload=await response.json().catch(()=>null);setError(payload?.error?.message||'Não foi possível remover a persisted query.');return;}setPersistedQueries((items)=>items.filter((item)=>item.hash!==hash));};

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><Braces className="h-5 w-5 text-purple-400"/>GraphQL API v1</h1><p className="mt-1 text-xs text-slate-400">Queries e mutations sobre o mesmo PostgreSQL, Auth, RLS e CDC/Reatime da REST API.</p></div><button onClick={()=>void load()} disabled={busy} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"><RefreshCw className="h-4 w-4"/>Atualizar schema</button></div>
    {error&&<div className="rounded-xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">{error}</div>}

    <div className="grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Tabelas expostas</span><div className="mt-2 text-2xl font-bold text-slate-100">{schema?.tables.length??'—'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Segurança</span><div className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-300"><ShieldCheck className="h-5 w-5"/>Mesmo RLS do REST</div></div><div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"><span className="text-xs text-slate-500">Subscriptions</span><div className="mt-2 flex items-center gap-2 text-sm font-semibold text-cyan-300"><Radio className="h-5 w-5"/>Realtime WebSocket</div></div></div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-100">Endpoint do aplicativo</h2><p className="mt-1 text-xs text-slate-500">Use a mesma API key pública ou JWT do usuário final. A sessão administrativa do painel não é enviada ao data plane.</p></div><button onClick={()=>void copy('endpoint',endpoint)} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white"><Copy className="h-4 w-4"/></button></div><pre className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-cyan-300">{endpoint}</pre>{copied==='endpoint'&&<div className="mt-2 text-[10px] text-emerald-400">Copiado.</div>}</div>

    <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-100">Exemplo</h2><button onClick={()=>void copy('example',example)} className="rounded-lg border border-slate-700 p-2 text-slate-400"><Copy className="h-4 w-4"/></button></div><pre className="mt-4 min-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-purple-200">{example}</pre></div><div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="text-sm font-semibold text-slate-100">Schema SDL</h2><pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-300">{schema?.sdl||'Carregando…'}</pre></div></div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><Play className="h-4 w-4 text-purple-400"/>Explorer</h2><p className="mt-1 text-xs text-slate-500">Execute contra o data plane usando uma API key pública/secret ou JWT de usuário. A credencial fica apenas na memória desta página.</p></div><button onClick={()=>void execute()} disabled={runBusy||!credential.trim()} className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{runBusy?'Executando…':'Executar'}</button></div><div className="relative"><KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input value={credential} onChange={(event)=>setCredential(event.target.value)} type="password" autoComplete="off" placeholder="bb_pub_… ou JWT do usuário" className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-xs text-slate-200 outline-none focus:border-purple-500"/></div><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><textarea value={queryText} onChange={(event)=>setQueryText(event.target.value)} className="min-h-56 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-purple-200 outline-none focus:border-purple-500"/><textarea value={variablesText} onChange={(event)=>setVariablesText(event.target.value)} className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-cyan-200 outline-none focus:border-purple-500"/><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={persistQuery} onChange={(event)=>setPersistQuery(event.target.checked)}/>Registrar como persisted query SHA-256</label>{persistedHash&&<code className="block break-all text-[10px] text-slate-500">sha256:{persistedHash}</code>}</div><pre className="min-h-80 max-h-[30rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-emerald-200">{result?JSON.stringify(result,null,2):'O resultado aparecerá aqui.'}</pre></div></div>

    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-100">Persisted queries</h2><p className="mt-1 text-xs text-slate-500">Registros SHA-256 deste projeto/ambiente. Remover um hash exige que o cliente envie o documento novamente para registrá-lo.</p></div><span className="text-xs text-slate-500">{persistedQueries.length}</span></div><div className="mt-4 space-y-2">{persistedQueries.length?persistedQueries.map((item)=><div key={item.hash} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="min-w-0"><p className="truncate font-mono text-[11px] text-cyan-300">{item.hash}</p><p className="mt-1 text-[10px] text-slate-500">{item.operation_name||'anonymous operation'} · {item.use_count||0} usos</p></div><button onClick={()=>void removePersisted(item.hash)} className="rounded-lg p-2 text-slate-500 hover:bg-rose-950/50 hover:text-rose-300" title="Remover persisted query"><Trash2 className="h-4 w-4"/></button></div>):<p className="text-xs text-slate-500">Nenhuma persisted query registrada.</p>}</div></div>

    <div className="rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-xs leading-5 text-blue-200">GraphQL v1 cobre query, busca por ID, insert, update e delete com variáveis, filtros e ordenação. Subscriptions continuam pelo Realtime WebSocket do BrisaBase; fragments/introspection GraphQL completo ficam para uma evolução posterior do protocolo.</div>
  </div>;
};
