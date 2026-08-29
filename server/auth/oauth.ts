import crypto from 'node:crypto';
import { config } from '../config';

export interface OAuthIdentity {
  provider: 'google' | 'github' | 'apple' | 'microsoft' | 'discord';
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export interface OAuthProvider {
  getAuthorizationUrl(state: string, redirectUri: string): Promise<string>;
  handleCallback(code: string, redirectUri: string): Promise<OAuthIdentity>;
}

abstract class ConfiguredOAuthProvider implements OAuthProvider {
  protected constructor(protected readonly provider: OAuthIdentity['provider'], protected readonly clientId: string, protected readonly clientSecret: string) {}
  protected assertConfigured(): void { if (!this.clientId || !this.clientSecret) throw new Error('OAuth provider not configured.'); }
  protected testIdentity(): OAuthIdentity { return { provider: this.provider, providerUserId: `${this.provider}_test_user`, email: `${this.provider}.test@brisabase.local`, emailVerified: true, displayName: `${this.provider} test user` }; }
  abstract getAuthorizationUrl(state: string, redirectUri: string): Promise<string>;
  abstract handleCallback(code: string, redirectUri: string): Promise<OAuthIdentity>;
}

async function formJson(url: string, values: Record<string,string>, headers:Record<string,string>={}): Promise<any> {
  const response = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json', ...headers }, body:new URLSearchParams(values) });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(body.error_description || body.error?.message || body.error || 'OAuth token exchange failed.');
  return body;
}

function decodeJwtPart(token:string, index:number):any {
  const part=token.split('.')[index]; if(!part) throw new Error('Invalid identity token.');
  return JSON.parse(Buffer.from(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'='),'base64').toString('utf8'));
}

export class GoogleOAuthProvider extends ConfiguredOAuthProvider {
  constructor(clientId='', clientSecret='') { super('google', clientId, clientSecret); }
  async getAuthorizationUrl(state:string, redirectUri:string):Promise<string>{ this.assertConfigured(); const params=new URLSearchParams({client_id:this.clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid email profile',state,access_type:'offline',prompt:'select_account'}); return `https://accounts.google.com/o/oauth2/v2/auth?${params}`; }
  async handleCallback(code:string, redirectUri:string):Promise<OAuthIdentity>{ if(config.testMode)return this.testIdentity(); this.assertConfigured(); const token=await formJson('https://oauth2.googleapis.com/token',{code,client_id:this.clientId,client_secret:this.clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code'}); const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`}}); const profile=await response.json() as any; if(!response.ok||!profile.sub||!profile.email||profile.email_verified!==true) throw new Error('Google returned an unverified identity.'); return {provider:'google',providerUserId:String(profile.sub),email:profile.email,emailVerified:true,displayName:profile.name||profile.email,avatarUrl:profile.picture,metadata:{locale:profile.locale}}; }
}

export class GitHubOAuthProvider extends ConfiguredOAuthProvider {
  constructor(clientId='', clientSecret=''){super('github',clientId,clientSecret);}
  async getAuthorizationUrl(state:string,redirectUri:string):Promise<string>{this.assertConfigured();const p=new URLSearchParams({client_id:this.clientId,redirect_uri:redirectUri,scope:'read:user user:email',state});return `https://github.com/login/oauth/authorize?${p}`;}
  async handleCallback(code:string,redirectUri:string):Promise<OAuthIdentity>{if(config.testMode)return this.testIdentity();this.assertConfigured();const token=await formJson('https://github.com/login/oauth/access_token',{client_id:this.clientId,client_secret:this.clientSecret,code,redirect_uri:redirectUri});const headers={Authorization:`Bearer ${token.access_token}`,Accept:'application/vnd.github+json','User-Agent':'BrisaBase'};const [pr,er]=await Promise.all([fetch('https://api.github.com/user',{headers}),fetch('https://api.github.com/user/emails',{headers})]);const profile=await pr.json() as any;const emails=await er.json() as any[];const primary=Array.isArray(emails)?emails.find(x=>x.primary&&x.verified):undefined;if(!pr.ok||!profile.id||!primary?.email)throw new Error('GitHub did not return a verified primary email.');return{provider:'github',providerUserId:String(profile.id),email:primary.email,emailVerified:true,displayName:profile.name||profile.login||primary.email,avatarUrl:profile.avatar_url,metadata:{login:profile.login}};}
}

export class MicrosoftOAuthProvider extends ConfiguredOAuthProvider {
  constructor(clientId='',clientSecret=''){super('microsoft',clientId,clientSecret);}
  async getAuthorizationUrl(state:string,redirectUri:string):Promise<string>{this.assertConfigured();const p=new URLSearchParams({client_id:this.clientId,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:'openid profile email User.Read',state});return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`;}
  async handleCallback(code:string,redirectUri:string):Promise<OAuthIdentity>{if(config.testMode)return this.testIdentity();this.assertConfigured();const token=await formJson('https://login.microsoftonline.com/common/oauth2/v2.0/token',{client_id:this.clientId,client_secret:this.clientSecret,code,redirect_uri:redirectUri,grant_type:'authorization_code',scope:'openid profile email User.Read'});const response=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{Authorization:`Bearer ${token.access_token}`}});const profile=await response.json() as any;const email=profile.mail||profile.userPrincipalName;if(!response.ok||!profile.id||!email)throw new Error('Microsoft profile did not include an email address.');return{provider:'microsoft',providerUserId:String(profile.id),email,emailVerified:true,displayName:profile.displayName||email,metadata:{tenant:'common'}};}
}

export class DiscordOAuthProvider extends ConfiguredOAuthProvider {
  constructor(clientId='',clientSecret=''){super('discord',clientId,clientSecret);}
  async getAuthorizationUrl(state:string,redirectUri:string):Promise<string>{this.assertConfigured();const p=new URLSearchParams({client_id:this.clientId,response_type:'code',redirect_uri:redirectUri,scope:'identify email',state,prompt:'consent'});return `https://discord.com/oauth2/authorize?${p}`;}
  async handleCallback(code:string,redirectUri:string):Promise<OAuthIdentity>{if(config.testMode)return this.testIdentity();this.assertConfigured();const token=await formJson('https://discord.com/api/oauth2/token',{client_id:this.clientId,client_secret:this.clientSecret,grant_type:'authorization_code',code,redirect_uri:redirectUri});const response=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});const profile=await response.json() as any;if(!response.ok||!profile.id||!profile.email||profile.verified!==true)throw new Error('Discord returned an unverified email identity.');return{provider:'discord',providerUserId:String(profile.id),email:profile.email,emailVerified:true,displayName:profile.global_name||profile.username||profile.email,avatarUrl:profile.avatar?`https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`:undefined,metadata:{username:profile.username}};}
}

let appleKeys:{keys:any[];expires:number}|null=null;
async function verifyAppleIdentityToken(token:string,clientId:string):Promise<any>{
  const header=decodeJwtPart(token,0);const payload=decodeJwtPart(token,1);const now=Math.floor(Date.now()/1000);
  if(payload.iss!=='https://appleid.apple.com'||payload.aud!==clientId||!payload.sub||!payload.email||payload.exp<=now)throw new Error('Apple identity token claims are invalid.');
  if(!appleKeys||appleKeys.expires<Date.now()){const r=await fetch('https://appleid.apple.com/auth/keys');if(!r.ok)throw new Error('Unable to retrieve Apple signing keys.');appleKeys={...(await r.json() as any),expires:Date.now()+3600_000};}
  const jwk=appleKeys.keys.find((k:any)=>k.kid===header.kid&&k.alg===header.alg);if(!jwk)throw new Error('Apple signing key not found.');
  const [h,p,s]=token.split('.');const verifier=crypto.createVerify('RSA-SHA256');verifier.update(`${h}.${p}`);verifier.end();const sig=Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='),'base64');if(!verifier.verify(crypto.createPublicKey({key:jwk,format:'jwk'}),sig))throw new Error('Apple identity token signature is invalid.');
  return payload;
}
export class AppleOAuthProvider extends ConfiguredOAuthProvider {
  constructor(clientId='',clientSecret=''){super('apple',clientId,clientSecret);}
  async getAuthorizationUrl(state:string,redirectUri:string):Promise<string>{this.assertConfigured();const p=new URLSearchParams({client_id:this.clientId,redirect_uri:redirectUri,response_type:'code',response_mode:'query',scope:'name email',state});return `https://appleid.apple.com/auth/authorize?${p}`;}
  async handleCallback(code:string,redirectUri:string):Promise<OAuthIdentity>{if(config.testMode)return this.testIdentity();this.assertConfigured();const token=await formJson('https://appleid.apple.com/auth/token',{client_id:this.clientId,client_secret:this.clientSecret,code,redirect_uri:redirectUri,grant_type:'authorization_code'});if(!token.id_token)throw new Error('Apple did not return an identity token.');const claims=await verifyAppleIdentityToken(token.id_token,this.clientId);return{provider:'apple',providerUserId:String(claims.sub),email:claims.email,emailVerified:claims.email_verified===true||claims.email_verified==='true',displayName:claims.email,metadata:{is_private_email:claims.is_private_email}};}
}

export function getOAuthProvider(provider:string,clientId='',clientSecret=''):OAuthProvider{switch(provider.toLowerCase()){case'google':return new GoogleOAuthProvider(clientId,clientSecret);case'github':return new GitHubOAuthProvider(clientId,clientSecret);case'microsoft':return new MicrosoftOAuthProvider(clientId,clientSecret);case'discord':return new DiscordOAuthProvider(clientId,clientSecret);case'apple':return new AppleOAuthProvider(clientId,clientSecret);default:throw new Error(`OAuth provider '${provider}' is not supported.`);}}
