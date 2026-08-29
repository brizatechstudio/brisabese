const fs=require('fs');const path=require('path');const root=path.resolve(__dirname,'../..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');const assert=(v,m)=>{if(!v)throw new Error(m);};
const migration=read('server/db/migrations/023_billing_enterprise_iac_phase8.sql');
for(const t of ['billing_customers','billing_checkout_sessions','billing_refunds','billing_usage_ledger','enterprise_domains','enterprise_sso_connections','enterprise_scim_tokens','enterprise_ip_allowlist','enterprise_policies','enterprise_siem_sinks','compliance_evidence','enterprise_roles','iac_exports'])assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${t}`),`${t} persistence missing`);
assert(migration.includes('UNIQUE(organization_id, idempotency_key)'),'usage ledger must be idempotent');
assert(migration.includes('CHECK(amount_cents > 0)'),'refund amounts must be positive');
assert(migration.includes("CHECK(protocol IN ('oidc','saml_gateway'))"),'enterprise SSO protocol constraint missing');
assert(migration.includes('token_hash CHAR(64) NOT NULL UNIQUE'),'SCIM tokens must be hash-persisted');

const billing=read('server/billing/localBillingEngine.ts');const billingRoutes=read('server/routes/billing.ts');const storageMigration=read('server/db/migrations/004_storage_metadata_persistence.sql');
assert(/\bsize BIGINT NOT NULL\b/.test(storageMigration),'canonical storage object size column missing');
assert(billing.includes('sum(o.size)'),'billing storage usage must use canonical storage_objects.size');
assert(!billing.includes('sum(o.size_bytes)'),'billing must not use legacy storage_objects.size_bytes');
assert(billingRoutes.includes("/billing/v1/paddle/webhook")&&billingRoutes.includes("express.raw({type:'application/json'"),'Paddle webhook must receive raw bytes');
assert(billing.includes("crypto.createHmac('sha256',secret)")&&billing.includes("`${timestamp}:${rawBody.toString('utf8')}`"),'Paddle webhook signature verification missing');
assert(billing.includes('timingSafeHex'),'Paddle webhook signature compare must be timing-safe');
assert(billing.includes("redirect:'error'")&&billing.includes('AbortSignal.timeout(20_000)'),'Paddle calls must reject redirects and have timeouts');
assert(billing.includes("FOR UPDATE")&&billing.includes("status IN ('pending','succeeded')"),'refund reservation must be transaction/race safe');
assert(billing.includes('String(event.event_id)')&&billing.includes('ON CONFLICT(id) DO NOTHING'),'Paddle webhook processing must deduplicate event ids');
assert(billing.includes('assertEnterpriseAccess'),'Enterprise entitlements must be enforced by billing/control-plane policy');
assert(billing.includes('billing_usage_ledger')&&billing.includes('overageEnabled'),'usage/overage accounting missing');

const auth=read('server/middleware/auth.ts');
assert(auth.includes("/^\\/api\\/billing(?:\\/|$)/")&&auth.includes("return 'billing'"),'billing mutations must require billing permission');
assert(auth.includes('enterpriseEngine.customRoleAllows'),'custom enterprise role permissions must participate in authorization');
assert(auth.includes('await localBillingEngine.assertEnterpriseAccess(organizationId)'),'Enterprise routes must enforce Enterprise entitlement');
assert(auth.includes('IP_NOT_ALLOWED')&&auth.includes('SSO_REQUIRED')&&auth.includes('ADMIN_MFA_REQUIRED'),'Enterprise access policies must be enforced centrally');

const enterprise=read('server/enterprise/enterpriseEngine.ts');
assert(enterprise.includes('dns.resolveTxt(`_brisabase.${row.domain}`)'),'enterprise domain ownership must use DNS TXT proof');
assert(enterprise.includes("url.protocol!=='https:'")&&enterprise.includes('addresses.some(item=>privateIp(item.address))'),'enterprise outbound endpoints must be HTTPS and SSRF-protected');
assert(enterprise.includes('encryptSecret(String(input.clientSecret))')&&enterprise.includes('encryptSecret(String(input.samlGatewaySecret))'),'SSO secrets must be encrypted');
assert(enterprise.includes('token_hash')&&enterprise.includes('hashToken(raw)'),'SCIM bearer tokens must be hashed at rest');
assert(enterprise.includes('code_challenge_method')&&enterprise.includes("'S256'"),'OIDC enterprise SSO must use PKCE S256');
assert(enterprise.includes('profile.email_verified!==true'),'OIDC identity must require a verified email');
assert(enterprise.includes("crypto.createHmac('sha256',decryptSecret(connection.saml_gateway_secret_encrypted))"),'SAML gateway identity must be signed');
assert(enterprise.includes('JIT provisioning is disabled'),'SSO JIT policy must be enforceable');
assert(enterprise.includes('Compliance Center provides technical evidence and does not constitute legal certification.'),'Compliance Center must not claim legal certification');

const iac=read('server/iac/iacEngine.ts');const cli=read('developer/cli/brisabase.mjs');
assert(iac.includes("filter(key=>key!=='generatedAt')"),'IaC checksum must exclude generatedAt');
assert(cli.includes("key !== 'generatedAt'"),'CLI IaC checksum must use the same canonicalization');
assert(iac.includes('manifest_sha256')&&iac.includes('terraform_data'),'Terraform bridge must pin manifest checksum');
assert(iac.includes('drift:differences.length>0'),'IaC drift detection missing');
assert(iac.includes("authProviders:providers.map((x:any)=>({...x,client_id:x.client_id?'configured':null}))"),'IaC export must not expose auth provider client ids verbatim');

const validator=read('scripts/validate-production-env.cjs');
assert(validator.includes("BILLING_PROVIDER must be disabled or paddle"),'billing provider allowlist missing');
assert(validator.includes('PADDLE_WEBHOOK_SECRET')&&validator.includes("startsWith('pdl_ntfset_')"),'Paddle signing secret validation missing');
assert(validator.includes('PADDLE_PRICE_PRO')&&validator.includes('PADDLE_PRICE_TEAM'),'paid plan price configuration validation missing');
assert(!billing.includes('STRIPE_')&&!billingRoutes.includes('/stripe/'),'Stripe billing references must be removed from the runtime');
console.log('Billing + Enterprise + IaC Phase 8 contract: PASS');
