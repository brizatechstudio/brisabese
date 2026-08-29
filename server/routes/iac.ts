import {Router} from 'express';
import {iacEngine} from '../iac/iacEngine';
export const iacRouter=Router();
function ctx(req:any){if(!req.organizationId||!req.projectId||!req.environmentId||!req.user?.id||!req.user?.role)throw new Error('IaC requires organization, project, environment and user scope.');return{organizationId:req.organizationId,projectId:req.projectId,environmentId:req.environmentId,userId:req.user.id,role:req.user.role};}
function fail(res:any,e:any){const m=String(e?.message||'IaC operation failed.');res.status(/invalid|required|access/i.test(m)?400:500).json({error:{code:'IAC_ERROR',message:process.env.NODE_ENV==='production'&&!/invalid|required|access/i.test(m)?'IaC operation failed.':m}});}
iacRouter.get('/api/iac/export',async(req,res)=>{try{const provider=String(req.query.provider||'json')==='terraform'?'terraform':'json';res.json(await iacEngine.export(ctx(req),provider));}catch(e){fail(res,e);}});
iacRouter.get('/api/iac/history',async(req,res)=>{try{res.json(await iacEngine.history(ctx(req)));}catch(e){fail(res,e);}});
iacRouter.post('/api/iac/diff',async(req,res)=>{try{res.json(await iacEngine.diff(ctx(req),req.body?.manifest||req.body));}catch(e){fail(res,e);}});
