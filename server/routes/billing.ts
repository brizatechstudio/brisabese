import express,{Router} from 'express';
import { localBillingEngine } from '../billing/localBillingEngine';

export const billingRouter=Router();
export const billingWebhookRouter=Router();
const organization=(req:any)=>req.organizationId||String(req.headers['x-organization-id']||'');
const ctx=(req:any)=>({organizationId:organization(req),userId:req.user?.id});
const fail=(res:any,error:any)=>res.status(/not found/i.test(error?.message||'')?404:/not configured|disabled/i.test(error?.message||'')?503:/invalid|required|available|origin|partial/i.test(error?.message||'')?400:500).json({error:{code:'BILLING_ERROR',message:process.env.NODE_ENV==='production'&&!/not configured|not found|invalid|required|available|partial/i.test(error?.message||'')?'Billing operation failed.':error?.message||'Billing operation failed.'}});

billingWebhookRouter.post('/billing/v1/paddle/webhook',express.raw({type:'application/json',limit:'2mb'}),async(req:any,res)=>{try{const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from(req.body||'');const event=await localBillingEngine.verifyPaddleWebhook(raw,String(req.headers['paddle-signature']||''));await localBillingEngine.applyPaddleEvent(event);return res.json({received:true});}catch(error){return res.status(400).json({error:{code:'INVALID_BILLING_WEBHOOK',message:'Invalid billing webhook.'}});}});

billingRouter.get('/api/billing/plans',async(req,res)=>{try{res.json(await localBillingEngine.plans(organization(req)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/usage',async(req,res)=>{try{res.json(await localBillingEngine.usage(organization(req)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/subscription',async(req,res)=>{try{res.json(await localBillingEngine.currentSubscription(organization(req)));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/subscription',async(req,res)=>{try{res.json(await localBillingEngine.changePlan(organization(req),String(req.body?.planId||'')));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/checkout',async(req,res)=>{try{res.status(201).json(await localBillingEngine.createCheckout(ctx(req),req.body||{}));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/portal',async(req,res)=>{try{res.json(await localBillingEngine.createPortal(ctx(req),req.body?.returnUrl));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/subscription/cancel',async(req,res)=>{try{res.json(await localBillingEngine.cancelSubscription(ctx(req),Boolean(req.body?.immediate)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/invoices',async(req,res)=>{try{res.json(await localBillingEngine.invoices(organization(req)));}catch(error){fail(res,error);}});
billingRouter.get('/api/billing/refunds',async(req,res)=>{try{res.json(await localBillingEngine.refunds(organization(req)));}catch(error){fail(res,error);}});
billingRouter.post('/api/billing/invoices/:invoiceId/refund',async(req,res)=>{try{res.status(201).json(await localBillingEngine.refund(ctx(req),req.params.invoiceId,req.body?.amountCents,req.body?.reason));}catch(error){fail(res,error);}});
