import React, { useEffect, useState } from 'react';
import { Braces, Code2, FileClock, Package, RefreshCw, Terminal } from 'lucide-react';
import { CodeBlock } from '../components/common/CodeBlock';

type Tab = 'SDK' | 'CLI' | 'OpenAPI' | 'Types' | 'History';
type Artifact = { id: string; kind: 'openapi' | 'typescript'; checksum: string; generatedBy: string; generatedAt: string; metadata?: { bytes?: number } };

async function request(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(path, init);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
  if (!response.ok) throw new Error(body?.error?.message || `Developer tooling request failed (${response.status}).`);
  return body;
}

export const DeveloperPlatformPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('SDK');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [openapi, setOpenapi] = useState<any>(null);
  const [types, setTypes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const tabs: Tab[] = ['SDK', 'CLI', 'OpenAPI', 'Types', 'History'];

  const refreshHistory = async () => {
    try { setArtifacts(await request('/api/developer/artifacts')); }
    catch (error: any) { setMessage(error?.message || 'Could not load developer artifacts.'); }
  };
  useEffect(() => { void refreshHistory(); }, []);

  const generateOpenApi = async () => {
    setBusy(true); setMessage('');
    try { setOpenapi(await request('/api/developer/openapi')); setMessage('OpenAPI generated from the current PostgreSQL schema.'); await refreshHistory(); }
    catch (error: any) { setMessage(error?.message || 'Could not generate OpenAPI.'); }
    finally { setBusy(false); }
  };
  const generateTypes = async () => {
    setBusy(true); setMessage('');
    try { setTypes(String(await request('/api/developer/typescript'))); setMessage('TypeScript types generated from the current PostgreSQL schema.'); await refreshHistory(); }
    catch (error: any) { setMessage(error?.message || 'Could not generate TypeScript types.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6 pb-12">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row sm:items-center">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-100"><Code2 className="h-5 w-5 text-purple-400"/>Developer Tools</h1><p className="mt-1 text-xs text-slate-400">Official <code>@brisabase/js</code>, CLI, schema-derived OpenAPI and TypeScript types. Marketplace and multi-language SDK generators remain preview features and are not presented as published packages.</p></div>
      <button onClick={() => void refreshHistory()} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><RefreshCw className="h-4 w-4"/>Refresh</button>
    </div>
    <div className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-2">{tabs.map((item)=><button key={item} onClick={()=>setTab(item)} className={`rounded-md px-3 py-2 text-sm ${tab===item?'bg-purple-600 text-white':'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{item}</button>)}</div>
    {message&&<div className="rounded-lg border border-purple-800 bg-purple-950/40 p-3 text-sm text-purple-200">{message}</div>}

    {tab==='SDK'&&<Panel title="Official JavaScript / TypeScript SDK" icon={Package}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><Info label="Package" value="@brisabase/js"/><Info label="Release" value="1.0.0"/><Info label="Status" value="Official"/></div>
      <CodeBlock language="bash" title="Install" code="npm install @brisabase/js" />
      <div className="mt-4"><CodeBlock language="typescript" title="Quickstart" code={`import { createClient } from '@brisabase/js';\n\nconst brisabase = createClient({\n  url: 'https://your-brisabase.example',\n  projectId: 'project-id',\n  environmentId: 'environment-id',\n  apiKey: process.env.BRISABASE_PUBLIC_KEY,\n});\n\nconst products = await brisabase.from('products').select('*').limit(20).get();`} /></div>
    </Panel>}

    {tab==='CLI'&&<Panel title="BrisaBase CLI 1.0.0" icon={Terminal}>
      <CodeBlock language="bash" title="Database + Functions workflow" code={`brisabase login --token <admin-jwt>\nbrisabase db pull\nbrisabase db diff\nbrisabase migration create add_orders\nbrisabase db push\nbrisabase functions health\nbrisabase functions deploy <function-id>\nbrisabase types pull\nbrisabase openapi pull\nbrisabase doctor`} />
      <p className="mt-3 text-xs text-slate-400">The CLI uses real project/environment-scoped control-plane endpoints. It never accepts account passwords or administrative service secrets.</p>
    </Panel>}

    {tab==='OpenAPI'&&<Panel title="OpenAPI 3.0.3" icon={Braces}>
      <button disabled={busy} onClick={()=>void generateOpenApi()} className="mb-4 rounded bg-purple-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Generate from current schema</button>
      <pre className="max-h-[34rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">{openapi?JSON.stringify(openapi,null,2):'Generate the artifact to preview it here.'}</pre>
    </Panel>}

    {tab==='Types'&&<Panel title="Generated TypeScript types" icon={Code2}>
      <button disabled={busy} onClick={()=>void generateTypes()} className="mb-4 rounded bg-purple-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Generate from current schema</button>
      <pre className="max-h-[34rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-cyan-200">{types||'Generate the artifact to preview it here.'}</pre>
    </Panel>}

    {tab==='History'&&<Panel title="Artifact history" icon={FileClock}>
      <div className="space-y-2">{artifacts.length?artifacts.map((artifact)=><div key={artifact.id} className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-medium text-slate-100">{artifact.kind}</p><p className="text-[11px] text-slate-500">{new Date(artifact.generatedAt).toLocaleString()} · {artifact.generatedBy}</p></div><code className="break-all text-[10px] text-cyan-300">sha256:{artifact.checksum}</code></div>):<p className="text-sm text-slate-500">No generated artifacts yet.</p>}</div>
    </Panel>}
  </div>;
};

const Panel: React.FC<{title:string;icon:any;children:React.ReactNode}> = ({title,icon:Icon,children}) => <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-100"><Icon className="h-4 w-4 text-purple-300"/>{title}</h2>{children}</section>;
const Info: React.FC<{label:string;value:string}> = ({label,value}) => <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-mono text-sm text-slate-100">{value}</p></div>;
