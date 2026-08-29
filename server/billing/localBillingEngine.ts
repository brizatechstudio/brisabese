import crypto from 'node:crypto';
import { config } from '../config';
import { postgres } from '../db/postgres';

export type BillingPlan = {
  id: string; name: string; priceMonthly: number; description: string; isCurrentPlan?: boolean; isPopular?: boolean;
  features: string[]; dbLimitGb: number | null; storageLimitGb: number | null; bandwidthLimitGb: number | null;
  functionsInvocationsLimit: number | null; apiRequestsLimit: number | null; overageEnabled: boolean; paddlePriceId?: string;
};

type BillingContext = { organizationId: string; userId?: string };
const id=(prefix:string)=>`${prefix}_${crypto.randomUUID().replace(/-/g,'').slice(0,24)}`;
const provider=()=>String(process.env.BILLING_PROVIDER||'disabled').toLowerCase();
const paddleApiKey=()=>process.env.PADDLE_API_KEY||'';
const paddleWebhookSecret=()=>process.env.PADDLE_WEBHOOK_SECRET||'';
const paddleEnvironment=()=>String(process.env.PADDLE_ENVIRONMENT||'sandbox').toLowerCase();
const paddleApiBase=()=>paddleEnvironment()==='live'?'https://api.paddle.com':'https://sandbox-api.paddle.com';

function plansFromEnv(): BillingPlan[] {
  return [
    { id:'plan_free',name:'Free',priceMonthly:0,description:'Beta público gratuito para validação do produto.',features:['500 MB Database','1 GB Storage','2 GB Bandwidth','50K Functions','100K API requests'],dbLimitGb:0.5,storageLimitGb:1,bandwidthLimitGb:2,functionsInvocationsLimit:50_000,apiRequestsLimit:100_000,overageEnabled:false },
    { id:'plan_pro',name:'Pro',priceMonthly:29,description:'Produção individual com recursos ampliados.',isPopular:true,features:['8 GB Database','100 GB Storage','250 GB Bandwidth','2M Functions','5M API requests'],dbLimitGb:8,storageLimitGb:100,bandwidthLimitGb:250,functionsInvocationsLimit:2_000_000,apiRequestsLimit:5_000_000,overageEnabled:true,paddlePriceId:process.env.PADDLE_PRICE_PRO||undefined },
    { id:'plan_team',name:'Team',priceMonthly:99,description:'Equipes, ambientes e operação colaborativa.',features:['32 GB Database','500 GB Storage','1 TB Bandwidth','10M Functions','25M API requests'],dbLimitGb:32,storageLimitGb:500,bandwidthLimitGb:1024,functionsInvocationsLimit:10_000_000,apiRequestsLimit:25_000_000,overageEnabled:true,paddlePriceId:process.env.PADDLE_PRICE_TEAM||undefined },
    { id:'plan_enterprise',name:'Enterprise',priceMonthly:0,description:'SSO, SCIM, SIEM, políticas e limites contratados.',features:['Limites contratados','Enterprise SSO','SCIM','SIEM','Compliance Center','Suporte Enterprise'],dbLimitGb:null,storageLimitGb:null,bandwidthLimitGb:null,functionsInvocationsLimit:null,apiRequestsLimit:null,overageEnabled:true,paddlePriceId:process.env.PADDLE_PRICE_ENTERPRISE||undefined },
  ];
}

function safeReturnUrl(input:string|undefined,fallbackPath:string):string{
  const fallback=new URL(fallbackPath,config.appUrl||'http://localhost:3000').toString();
  if(!input)return fallback;
  try{const candidate=new URL(input);const base=new URL(config.appUrl);if(candidate.origin!==base.origin)throw new Error('origin');return candidate.toString();}catch{return fallback;}
}

async function paddleJson(path:string,body:Record<string,unknown>|undefined={},method:'GET'|'POST'|'PATCH'='POST'):Promise<any>{
  if(provider()!=='paddle'||!paddleApiKey())throw new Error('Paddle billing is not configured.');
  const response=await fetch(`${paddleApiBase()}${path}`,{
    method,
    headers:{Authorization:`Bearer ${paddleApiKey()}`,'Content-Type':'application/json','Paddle-Version':'1'},
    ...((method==='POST'||method==='PATCH')?{body:JSON.stringify(body||{})}:{}),
    redirect:'error',
    signal:AbortSignal.timeout(20_000),
  });
  const payload=await response.json().catch(()=>({})) as any;
  if(!response.ok)throw new Error(payload?.error?.detail||payload?.error?.code||`Paddle request failed (${response.status}).`);
  return payload?.data??payload;
}

function timingSafeHex(a:string,b:string):boolean{
  if(!/^[a-f0-9]{64}$/i.test(a)||!/^[a-f0-9]{64}$/i.test(b))return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}

function paddleStatus(status:string):string{
  if(status==='completed'||status==='paid')return 'paid';
  if(status==='past_due'||status==='payment_failed')return 'open';
  return status||'open';
}

export class LocalBillingEngine {
  private plansReady:Promise<void>|null=null;
  public async ensurePlans():Promise<void>{
    if(!this.plansReady)this.plansReady=(async()=>{for(const plan of plansFromEnv())await postgres.execute('INSERT INTO billing_plans(id,name,limits,active) VALUES($1,$2,$3,true) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,limits=EXCLUDED.limits,active=true',[plan.id,plan.name,JSON.stringify(plan)]);})();
    try{await this.plansReady;}catch(error){this.plansReady=null;throw error;}
  }
  public async plans(organizationId:string):Promise<BillingPlan[]>{await this.ensurePlans();const current=provider()==='disabled'?'plan_free':(await postgres.query<{plan_id:string}>('SELECT plan_id FROM billing_subscriptions WHERE organization_id=$1 AND status IN ($2,$3) ORDER BY started_at DESC LIMIT 1',[organizationId,'active','trialing']))[0]?.plan_id||'plan_free';const rows=await postgres.query<{limits:BillingPlan}>('SELECT limits FROM billing_plans WHERE active=true ORDER BY CASE id WHEN \'plan_free\' THEN 1 WHEN \'plan_pro\' THEN 2 WHEN \'plan_team\' THEN 3 ELSE 4 END');return rows.map(row=>({...row.limits,isCurrentPlan:row.limits.id===current}));}
  public async currentSubscription(organizationId:string):Promise<any|null>{if(provider()==='disabled')return null;return(await postgres.query<any>('SELECT s.*,p.name AS plan_name,p.limits FROM billing_subscriptions s LEFT JOIN billing_plans p ON p.id=s.plan_id WHERE s.organization_id=$1 AND s.status IN ($2,$3,$4) ORDER BY s.started_at DESC LIMIT 1',[organizationId,'active','trialing','past_due']))[0]||null;}
  public async changePlan(organizationId:string,planId:string):Promise<BillingPlan>{if(config.production)throw new Error('Direct local plan changes are disabled in production. Use checkout or an enterprise contract.');await this.ensurePlans();const plan=(await postgres.query<{limits:BillingPlan}>('SELECT limits FROM billing_plans WHERE id=$1 AND active=true',[planId]))[0];if(!plan)throw new Error('Billing plan not found.');await postgres.execute("UPDATE billing_subscriptions SET status='inactive',updated_at=now() WHERE organization_id=$1 AND status='active'",[organizationId]);await postgres.execute('INSERT INTO billing_subscriptions(id,organization_id,plan_id,status,provider) VALUES($1,$2,$3,$4,$5)',[id('sub'),organizationId,planId,'active','local']);await this.event(organizationId,'subscription.changed',{planId,provider:'local',paymentProcessing:'disabled'});return{...plan.limits,isCurrentPlan:true};}
  private async event(organizationId:string,event:string,metadata:any,eventId?:string):Promise<boolean>{const rowId=eventId?`evt_${crypto.createHash('sha256').update(eventId).digest('hex').slice(0,24)}`:id('bill');const rows=await postgres.query<{id:string}>('INSERT INTO billing_events(id,organization_id,event,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id',[rowId,organizationId,event,JSON.stringify(metadata||{})]);return rows.length>0;}
  private async ensureCustomer(ctx:BillingContext):Promise<any>{
    let current=(await postgres.query<any>('SELECT * FROM billing_customers WHERE organization_id=$1',[ctx.organizationId]))[0];
    if(current?.provider==='paddle'&&current?.provider_customer_id)return current;
    const org=(await postgres.query<any>('SELECT o.*,u.email AS owner_email,u.name AS owner_name FROM organizations o JOIN users u ON u.id=o.owner_id WHERE o.id=$1',[ctx.organizationId]))[0];
    if(!org)throw new Error('Organization not found.');
    const customer=await paddleJson('/customers',{email:org.owner_email,name:org.name,custom_data:{organization_id:ctx.organizationId}});
    current=(await postgres.query<any>('INSERT INTO billing_customers(id,organization_id,provider,provider_customer_id,email,name) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id) DO UPDATE SET provider=excluded.provider,provider_customer_id=excluded.provider_customer_id,email=excluded.email,name=excluded.name,updated_at=now() RETURNING *',[id('bcus'),ctx.organizationId,'paddle',customer.id,org.owner_email,org.name]))[0];
    return current;
  }
  public async createCheckout(ctx:BillingContext,input:any):Promise<any>{
    await this.ensurePlans();
    if(provider()!=='paddle')throw new Error('Payment processing is not configured.');
    const plan=plansFromEnv().find(item=>item.id===String(input?.planId||''));
    if(!plan||plan.id==='plan_free'||!plan.paddlePriceId)throw new Error('This plan is not available for self-service checkout.');
    const customer=await this.ensureCustomer(ctx);
    const checkoutBase=safeReturnUrl(input?.checkoutUrl,'/billing');
    const transaction=await paddleJson('/transactions',{
      items:[{price_id:plan.paddlePriceId,quantity:1}],
      customer_id:customer.provider_customer_id,
      collection_mode:'automatic',
      custom_data:{organization_id:ctx.organizationId,plan_id:plan.id},
      checkout:{url:checkoutBase},
    });
    const checkoutUrl=String(transaction?.checkout?.url||'');
    if(!checkoutUrl)throw new Error('Paddle did not return a checkout URL. Configure an approved/default payment link before enabling billing.');
    await postgres.execute('INSERT INTO billing_checkout_sessions(id,organization_id,plan_id,provider,provider_session_id,status,checkout_url,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id('bco'),ctx.organizationId,plan.id,'paddle',transaction.id,String(transaction.status||'open'),checkoutUrl,ctx.userId||null,null]);
    await this.event(ctx.organizationId,'checkout.created',{planId:plan.id,transactionId:transaction.id});
    return{provider:'paddle',sessionId:transaction.id,url:checkoutUrl,expiresAt:null};
  }
  public async createPortal(ctx:BillingContext,_returnUrl?:string):Promise<any>{
    const customer=await this.ensureCustomer(ctx);
    const sub=await this.currentSubscription(ctx.organizationId);
    const body=sub?.provider_subscription_id?{subscription_ids:[String(sub.provider_subscription_id)]}:{};
    const portal=await paddleJson(`/customers/${encodeURIComponent(customer.provider_customer_id)}/portal-sessions`,body);
    return{url:portal?.urls?.general?.overview||null};
  }
  public async cancelSubscription(ctx:BillingContext,immediate=false):Promise<any>{
    const sub=await this.currentSubscription(ctx.organizationId);
    if(!sub)throw new Error('Active subscription not found.');
    if(sub.provider!=='paddle'||!sub.provider_subscription_id)throw new Error('This subscription is not managed by Paddle.');
    const remote=await paddleJson(`/subscriptions/${encodeURIComponent(sub.provider_subscription_id)}/cancel`,immediate?{effective_from:'immediately'}:{});
    const scheduled=remote?.scheduled_change?.action==='cancel';
    await postgres.execute('UPDATE billing_subscriptions SET cancel_at_period_end=$2,status=$3,current_period_end=$4,updated_at=now() WHERE id=$1',[sub.id,scheduled,String(remote.status||sub.status),remote?.current_billing_period?.ends_at||sub.current_period_end]);
    await this.event(ctx.organizationId,'subscription.cancel_requested',{subscriptionId:sub.id,immediate});
    return await this.currentSubscription(ctx.organizationId);
  }
  public async invoices(organizationId:string):Promise<any[]>{return postgres.query<any>('SELECT * FROM billing_invoices WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200',[organizationId]);}
  public async refunds(organizationId:string):Promise<any[]>{return postgres.query<any>('SELECT * FROM billing_refunds WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200',[organizationId]);}
  public async refund(ctx:BillingContext,invoiceId:string,amountCents?:number,reason='requested_by_customer'):Promise<any>{
    const requestedReason=String(reason||'requested_by_customer').slice(0,255);
    const reservation=await postgres.transaction(async(client)=>{
      const invoice=(await client.query<any>('SELECT * FROM billing_invoices WHERE id=$1 AND organization_id=$2 FOR UPDATE',[invoiceId,ctx.organizationId])).rows[0];
      if(!invoice||!invoice.provider_payment_intent_id)throw new Error('Refundable invoice was not found.');
      const reserved=(await client.query<{amount:string}>("SELECT coalesce(sum(amount_cents),0)::text AS amount FROM billing_refunds WHERE invoice_id=$1 AND status IN ('pending','succeeded')",[invoice.id])).rows[0];
      const remaining=Math.max(0,Number(invoice.amount_cents)-Number(reserved?.amount||0));
      const amount=amountCents===undefined?remaining:Math.floor(Number(amountCents));
      if(!Number.isInteger(amount)||amount<1||amount>remaining)throw new Error('Refund amount is invalid.');
      if(amount!==remaining)throw new Error('Partial Paddle refunds require line-item allocation and are not enabled. Use a full refund or the Paddle dashboard.');
      const refundId=id('refund');
      const row=(await client.query<any>('INSERT INTO billing_refunds(id,organization_id,invoice_id,provider,amount_cents,currency,status,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[refundId,ctx.organizationId,invoice.id,'paddle',amount,String(invoice.currency||'USD'),'pending',requestedReason,ctx.userId||null])).rows[0];
      return{row,invoice,transactionId:String(invoice.provider_payment_intent_id),amount};
    });
    try{
      const remote=await paddleJson('/adjustments',{action:'refund',type:'full',transaction_id:reservation.transactionId,reason:requestedReason});
      const status=String(remote.status||'pending_approval');
      const normalized=status==='approved'?'succeeded':status==='rejected'?'failed':'pending';
      const row=(await postgres.query<any>('UPDATE billing_refunds SET provider_refund_id=$2,status=$3,updated_at=now() WHERE id=$1 RETURNING *',[reservation.row.id,remote.id||null,normalized]))[0];
      if(normalized==='succeeded')await postgres.execute("UPDATE billing_invoices SET refunded_cents=(SELECT coalesce(sum(amount_cents),0) FROM billing_refunds WHERE invoice_id=$1 AND status='succeeded'),updated_at=now() WHERE id=$1",[reservation.invoice.id]);
      await this.event(ctx.organizationId,'refund.created',{invoiceId:reservation.invoice.id,adjustmentId:remote.id||reservation.row.id,amountCents:reservation.amount,status});
      return row;
    }catch(error){await postgres.execute("UPDATE billing_refunds SET status='failed',updated_at=now() WHERE id=$1",[reservation.row.id]);throw error;}
  }

  public async recordUsage(organizationId:string,metric:string,quantity:number,source:string,idempotencyKey:string,metadata:any={}):Promise<boolean>{if(!organizationId||!metric||!source||!idempotencyKey||!Number.isSafeInteger(quantity)||quantity<0)throw new Error('Invalid billing usage event.');const rows=await postgres.query<{id:string}>('INSERT INTO billing_usage_ledger(id,organization_id,metric,quantity,source,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING id',[id('usage'),organizationId,metric,quantity,source,idempotencyKey,JSON.stringify(metadata||{})]);return rows.length>0;}
  public async refreshUsage(organizationId:string):Promise<Record<string,number>>{const schemas=(await postgres.query<{schema_name:string}>('SELECT r.schema_name FROM project_database_registry r JOIN projects p ON p.id=r.project_id WHERE p.organization_id=$1',[organizationId])).map(x=>x.schema_name);const db=schemas.length?(await postgres.query<{bytes:string}>('SELECT coalesce(sum(pg_total_relation_size(c.oid)),0)::text AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[])',[schemas]))[0]:{bytes:'0'};const storage=(await postgres.query<{bytes:string}>('SELECT coalesce(sum(o.size),0)::text AS bytes FROM storage_objects o JOIN projects p ON p.id=o.project_id WHERE p.organization_id=$1',[organizationId]))[0];const funcs=(await postgres.query<{count:string}>("SELECT count(DISTINCT l.execution_id)::text AS count FROM function_execution_logs l WHERE l.organization_id=$1 AND l.created_at>=date_trunc('month',now())",[organizationId]))[0];const ledger=await postgres.query<{metric:string;value:string}>("SELECT metric,coalesce(sum(quantity),0)::text AS value FROM billing_usage_ledger WHERE organization_id=$1 AND occurred_at>=date_trunc('month',now()) GROUP BY metric",[organizationId]);const values:Record<string,number>={database_bytes:Number(db?.bytes||0),storage_bytes:Number(storage?.bytes||0),function_invocations:Number(funcs?.count||0)};for(const item of ledger)values[item.metric]=(values[item.metric]||0)+Number(item.value||0);for(const [metric,value] of Object.entries(values))await postgres.execute('INSERT INTO billing_usage(organization_id,metric,value,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(organization_id,metric) DO UPDATE SET value=excluded.value,updated_at=now()',[organizationId,metric,value]);return values;}
  public async usage(organizationId:string):Promise<Record<string,unknown>>{const values=await this.refreshUsage(organizationId);const plans=await this.plans(organizationId);const plan=plans.find(item=>item.isCurrentPlan)||plans[0];const limits={database_bytes:plan.dbLimitGb===null?null:plan.dbLimitGb*1024**3,storage_bytes:plan.storageLimitGb===null?null:plan.storageLimitGb*1024**3,bandwidth_bytes:plan.bandwidthLimitGb===null?null:plan.bandwidthLimitGb*1024**3,function_invocations:plan.functionsInvocationsLimit,api_requests:plan.apiRequestsLimit};const detail=Object.fromEntries(Object.entries(limits).map(([metric,limit])=>{const used=Number(values[metric]||0);return[metric,{used,limit,overage:limit===null?0:Math.max(0,used-limit),percent:limit===null?null:Math.round(used/Math.max(limit,1)*10000)/100}];}));return{provider:provider(),paymentProcessing:provider()==='paddle'&&Boolean(paddleApiKey()),billingEnvironment:paddleEnvironment(),betaFree:provider()==='disabled',currentPlan:plan.name,currentPlanId:plan.id,limits:detail,overageEnabled:plan.overageEnabled};}
  public async assertEnterpriseAccess(organizationId:string):Promise<void>{if(provider()!=='paddle')return;const sub=await this.currentSubscription(organizationId);if(String(sub?.plan_id||'plan_free')!=='plan_enterprise'){const error:any=new Error('Enterprise features require an Enterprise subscription in hosted billing mode.');error.code='ENTERPRISE_PLAN_REQUIRED';throw error;}}
  public async entitlement(organizationId:string,metric:'database_bytes'|'storage_bytes'|'bandwidth_bytes'|'function_invocations'|'api_requests',delta=0):Promise<{allowed:boolean;used:number;limit:number|null;overageEnabled:boolean;planId:string;planName:string}> {
    await this.ensurePlans();
    const subscription=await this.currentSubscription(organizationId);
    const planId=String(subscription?.plan_id||'plan_free');
    const plan=plansFromEnv().find(item=>item.id===planId)||plansFromEnv()[0];
    const values=await this.refreshUsage(organizationId);
    const map:Record<string,number|null>={database_bytes:plan.dbLimitGb===null?null:plan.dbLimitGb*1024**3,storage_bytes:plan.storageLimitGb===null?null:plan.storageLimitGb*1024**3,bandwidth_bytes:plan.bandwidthLimitGb===null?null:plan.bandwidthLimitGb*1024**3,function_invocations:plan.functionsInvocationsLimit,api_requests:plan.apiRequestsLimit};
    const limit=map[metric];const used=Number(values[metric]||0);
    return{allowed:limit===null||plan.overageEnabled||used+Math.max(0,delta)<=limit,used,limit,overageEnabled:plan.overageEnabled,planId:plan.id,planName:plan.name};
  }
  public async assertCanConsume(organizationId:string,metric:'database_bytes'|'storage_bytes'|'bandwidth_bytes'|'function_invocations'|'api_requests',delta=0):Promise<void>{const result=await this.entitlement(organizationId,metric,delta);if(!result.allowed){const error:any=new Error(`${result.planName} plan limit exceeded for ${metric}. Upgrade the organization plan or reduce usage.`);error.code='PLAN_LIMIT_EXCEEDED';error.metric=metric;error.used=result.used;error.limit=result.limit;throw error;}}
  public async meterApiRequest(organizationId:string,requestId:string):Promise<void>{let plan:BillingPlan;if(provider()==='disabled'){plan=plansFromEnv()[0];}else{await this.ensurePlans();const subscription=await this.currentSubscription(organizationId);plan=plansFromEnv().find(item=>item.id===String(subscription?.plan_id||'plan_free'))||plansFromEnv()[0];}if(!plan.overageEnabled&&plan.apiRequestsLimit!==null){const row=(await postgres.query<{value:string}>("SELECT coalesce(sum(quantity),0)::text AS value FROM billing_usage_ledger WHERE organization_id=$1 AND metric='api_requests' AND occurred_at>=date_trunc('month',now())",[organizationId]))[0];const used=Number(row?.value||0);if(used+1>plan.apiRequestsLimit){const error:any=new Error(`${plan.name} plan limit exceeded for api_requests. Upgrade the organization plan or reduce usage.`);error.code='PLAN_LIMIT_EXCEEDED';error.metric='api_requests';error.used=used;error.limit=plan.apiRequestsLimit;throw error;}}await this.recordUsage(organizationId,'api_requests',1,'rest_api',`api:${requestId}`,{});}
  public async verifyPaddleWebhook(rawBody:Buffer,signatureHeader:string):Promise<any>{
    const secret=paddleWebhookSecret();
    if(!secret)throw new Error('Paddle webhook is not configured.');
    const parts=signatureHeader.split(';').map(v=>v.trim()).filter(Boolean);
    const timestamp=parts.find(v=>v.startsWith('ts='))?.slice(3)||'';
    const signatures=parts.filter(v=>v.startsWith('h1=')).map(v=>v.slice(3));
    if(!/^\d+$/.test(timestamp)||!signatures.length)throw new Error('Invalid Paddle signature header.');
    if(Math.abs(Date.now()/1000-Number(timestamp))>5)throw new Error('Paddle webhook timestamp is outside the allowed tolerance.');
    const expected=crypto.createHmac('sha256',secret).update(`${timestamp}:${rawBody.toString('utf8')}`).digest('hex');
    if(!signatures.some(sig=>timingSafeHex(sig,expected)))throw new Error('Paddle webhook signature is invalid.');
    return JSON.parse(rawBody.toString('utf8'));
  }
  public async applyPaddleEvent(event:any):Promise<void>{
    const object=event?.data||{};
    let orgId=String(object?.custom_data?.organization_id||'');
    if(!orgId&&String(event?.event_type||'').startsWith('adjustment.')&&object?.transaction_id){
      const invoice=(await postgres.query<any>("SELECT organization_id FROM billing_invoices WHERE provider='paddle' AND provider_payment_intent_id=$1 LIMIT 1",[String(object.transaction_id)]))[0];
      orgId=String(invoice?.organization_id||'');
    }
    if(!orgId)return;
    if(!await this.event(orgId,String(event.event_type||'paddle.event'),{paddleEventId:event.event_id,objectId:object.id,occurredAt:event.occurred_at},String(event.event_id)))return;
    const eventType=String(event.event_type||'');
    if(eventType.startsWith('subscription.')){
      const planId=String(object?.custom_data?.plan_id||'');
      const status=String(object.status||'active');
      const cancelAtPeriodEnd=object?.scheduled_change?.action==='cancel';
      const periodEnd=object?.current_billing_period?.ends_at||null;
      if(eventType==='subscription.created'){
        await postgres.execute("UPDATE billing_subscriptions SET status='inactive',updated_at=now() WHERE organization_id=$1 AND status IN ('active','trialing','past_due')",[orgId]);
        if(planId)await postgres.execute('INSERT INTO billing_subscriptions(id,organization_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,cancel_at_period_end,current_period_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id('sub'),orgId,planId,status,'paddle',String(object.customer_id||''),String(object.id||''),cancelAtPeriodEnd,periodEnd]);
      }else{
        await postgres.execute('UPDATE billing_subscriptions SET status=$2,cancel_at_period_end=$3,current_period_end=$4,updated_at=now() WHERE organization_id=$1 AND provider=$5 AND provider_subscription_id=$6',[orgId,status,cancelAtPeriodEnd,periodEnd,'paddle',String(object.id||'')]);
      }
      return;
    }
    if(eventType.startsWith('transaction.')){
      const transactionId=String(object.id||'');
      await postgres.execute("UPDATE billing_checkout_sessions SET status=$2,updated_at=now() WHERE provider='paddle' AND provider_session_id=$1",[transactionId,String(object.status||eventType.split('.')[1]||'open')]);
      if(!['transaction.paid','transaction.completed','transaction.payment_failed','transaction.past_due'].includes(eventType))return;
      const invoiceId=`inv_${crypto.createHash('sha256').update(transactionId).digest('hex').slice(0,24)}`;
      const providerSubscriptionId=String(object.subscription_id||'');
      const sub=providerSubscriptionId?(await postgres.query<any>("SELECT id FROM billing_subscriptions WHERE organization_id=$1 AND provider='paddle' AND provider_subscription_id=$2",[orgId,providerSubscriptionId]))[0]:null;
      const total=Number(object?.details?.totals?.total||object?.details?.totals?.grand_total||object?.details?.totals?.subtotal||0);
      const tax=Number(object?.details?.totals?.tax||0);
      const paid=eventType==='transaction.paid'||eventType==='transaction.completed';
      await postgres.execute('INSERT INTO billing_invoices(id,organization_id,subscription_id,amount_cents,currency,status,provider,provider_invoice_id,provider_payment_intent_id,hosted_invoice_url,invoice_pdf_url,tax_cents,due_at,paid_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()) ON CONFLICT(id) DO UPDATE SET amount_cents=excluded.amount_cents,status=excluded.status,provider_invoice_id=excluded.provider_invoice_id,hosted_invoice_url=excluded.hosted_invoice_url,tax_cents=excluded.tax_cents,paid_at=excluded.paid_at,updated_at=now()',[invoiceId,orgId,sub?.id||null,total,String(object.currency_code||'USD').toUpperCase(),paddleStatus(String(object.status||eventType.split('.')[1]||'')),'paddle',String(object.invoice_id||transactionId),transactionId,object?.checkout?.url||null,null,tax,null,paid?new Date().toISOString():null]);
      return;
    }
    if(eventType.startsWith('adjustment.')){
      const status=String(object.status||'pending_approval');
      const normalized=status==='approved'?'succeeded':status==='rejected'?'failed':'pending';
      await postgres.execute("UPDATE billing_refunds SET status=$2,provider_refund_id=coalesce(provider_refund_id,$3),updated_at=now() WHERE organization_id=$1 AND provider='paddle' AND (provider_refund_id=$3 OR invoice_id IN (SELECT id FROM billing_invoices WHERE provider_payment_intent_id=$4))",[orgId,normalized,String(object.id||''),String(object.transaction_id||'')]);
    }
  }
}

export const localBillingEngine=new LocalBillingEngine();
