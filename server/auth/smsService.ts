import { config } from '../config';

function normalizePhone(phone:string):string {
  const cleaned=String(phone||'').trim().replace(/[\s()-]/g,'');
  if(!/^\+[1-9]\d{7,14}$/.test(cleaned)) throw new Error('Phone number must use E.164 format, for example +5511999999999.');
  return cleaned;
}

export class SmsService {
  public normalize(phone:string):string{return normalizePhone(phone);}
  public isConfigured():boolean{return Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_FROM_NUMBER);}
  public async sendMessage(phone:string,body:string):Promise<void>{
    const to=normalizePhone(phone);const sid=process.env.TWILIO_ACCOUNT_SID||'';const token=process.env.TWILIO_AUTH_TOKEN||'';const from=process.env.TWILIO_FROM_NUMBER||'';
    const message=String(body||'').trim(); if(!message||message.length>1600) throw new Error('SMS body is required and must be at most 1600 characters.');
    if(!sid||!token||!from) throw new Error('[BRISABASE SMS ERROR] Twilio SMS is not configured.');
    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,From:from,Body:message}),redirect:'error',signal:AbortSignal.timeout(10_000)});
    if(!response.ok){const responseBody=await response.text().catch(()=> '');throw new Error(`SMS delivery failed (${response.status})${config.testMode?`: ${responseBody.slice(0,200)}`:''}`);}
  }
  public async sendOtp(phone:string,code:string):Promise<void>{await this.sendMessage(phone,`Seu código BrisaBase é ${code}. Ele expira em 10 minutos.`);}
}
export const smsService=new SmsService();
