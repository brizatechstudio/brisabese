import express,{Router} from 'express';
import { localBillingEngine } from '../billing/localBillingEngine';

export const billingRouter=Router();
export const billingWebhookRouter=Router();
type BillingRequest=express.Request & { organizationId?: string; user?: { id?: string } };
const organization=(req:BillingRequest)=>{const value=String(req.organizationId||'').trim();if(!value)throw new Error('Organization scope is required.');return value;};
const ctx=(req:BillingRequest)=>({organizationId:organization(req),userId:req.user?.id});
const planId=(value:unknown)=>{const valueString=String(value||'').trim();if(!/^plan_[a-z0-9_-]{2,80}$/i.test(valueString))throw new Error('A valid billing plan is required.');return valueString;};
const boundedString=(value:unknown,max:number,name:string)=>{if(value===undefined||value===null||value==='')return undefined;const result=String(value);if(result.length>max)throw new Error(`${name} is too long.`);return result;};
const fail=(res:express.Response,error:unknown)=>{const message=error instanceof Error?error.message:'Billing operation failed.';const status=/not found/i.test(message)?404:/not configured|disabled/i.test(message)?503:/invalid|required|available|origin|partial|too long/i.test(message)?400:500;res.status(status).json({error:{code:'BILLING_ERROR',message:process.env.NODE_ENV==='production'&&status>=500?'Billing operation failed.':message}});};

billingWebhookRouter.post('/billing/v1/paddle/webhook',express.raw({type:'application/json',limit:'2mb'}),async(req,res)=>{try{const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from(req.body||'');const event=await localBillingEngine.verifyPaddleWebhook(raw,String(req.headers['paddle-signature']||''));await localBillingEngine.applyPaddleEvent(event);return res.json({received:true});}catch(error){return res.status(400).json({error:{code:'INVALID_BILLING_WEBHOOK',message:'Invalid billing webhook.'}});}});

billingRouter.get('/api/billing/plans',async(req,res)=>{try{res.json(await localBillingEngine.plans(organization(req as BillingRequest)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/usage',async(req,res)=>{try{res.json(await localBillingEngine.usage(organization(req as BillingRequest)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/subscription',async(req,res)=>{try{res.json(await localBillingEngine.currentSubscription(organization(req as BillingRequest)));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/subscription',async(req,res)=>{try{const request=req as BillingRequest;res.json(await localBillingEngine.changePlan(organization(request),planId(req.body?.planId)));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/checkout',async(req,res)=>{try{const request=req as BillingRequest;res.status(201).json(await localBillingEngine.createCheckout(ctx(request),{...(req.body||{}),planId:planId(req.body?.planId),checkoutUrl:boundedString(req.body?.checkoutUrl,2048,'Checkout URL')}));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/portal',async(req,res)=>{try{const request=req as BillingRequest;res.json(await localBillingEngine.createPortal(ctx(request),boundedString(req.body?.returnUrl,2048,'Return URL')));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/subscription/cancel',async(req,res)=>{try{const request=req as BillingRequest;res.json(await localBillingEngine.cancelSubscription(ctx(request),Boolean(req.body?.immediate)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/invoices',async(req,res)=>{try{res.json(await localBillingEngine.invoices(organization(req as BillingRequest)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/refunds',async(req,res)=>{try{res.json(await localBillingEngine.refunds(organization(req as BillingRequest)));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/invoices/:invoiceId/refund',async(req,res)=>{try{const request=req as BillingRequest;const invoiceId=String(req.params.invoiceId||'');if(!/^[A-Za-z0-9_-]{3,160}$/.test(invoiceId))throw new Error('Invalid invoice id.');const amount=req.body?.amountCents===undefined?undefined:Number(req.body.amountCents);if(amount!==undefined&&!Number.isSafeInteger(amount))throw new Error('Invalid refund amount.');res.status(201).json(await localBillingEngine.refund(ctx(request),invoiceId,amount,boundedString(req.body?.reason,255,'Refund reason')));}catch(error){fail(res,error);}});