-- BrisaBase Phase 8: Billing, Enterprise, IaC and 1.0 launch controls.

ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS provider_customer_id VARCHAR(255);
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(255);
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS provider_invoice_id VARCHAR(255);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS provider_payment_intent_id VARCHAR(255);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS hosted_invoice_url TEXT;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS invoice_pdf_url TEXT;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS tax_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS billing_customers (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  provider_customer_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  tax_country CHAR(2),
  tax_id_type VARCHAR(64),
  tax_id_value VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_customer_id)
);

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id VARCHAR(64) NOT NULL REFERENCES billing_plans(id),
  provider VARCHAR(32) NOT NULL,
  provider_session_id VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  checkout_url TEXT,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_session_id)
);

CREATE TABLE IF NOT EXISTS billing_refunds (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id VARCHAR(64) REFERENCES billing_invoices(id) ON DELETE SET NULL,
  provider VARCHAR(32) NOT NULL,
  provider_refund_id VARCHAR(255),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(32) NOT NULL,
  reason VARCHAR(255),
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_usage_ledger (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric VARCHAR(128) NOT NULL,
  quantity BIGINT NOT NULL CHECK(quantity >= 0),
  source VARCHAR(128) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_billing_usage_ledger_scope_time ON billing_usage_ledger(organization_id,metric,occurred_at DESC);

CREATE TABLE IF NOT EXISTS enterprise_domains (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  verification_token VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','failed')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,domain)
);

CREATE TABLE IF NOT EXISTS enterprise_sso_connections (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain_id VARCHAR(64) REFERENCES enterprise_domains(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  protocol VARCHAR(32) NOT NULL CHECK(protocol IN ('oidc','saml_gateway')),
  issuer TEXT,
  authorization_endpoint TEXT,
  token_endpoint TEXT,
  userinfo_endpoint TEXT,
  client_id VARCHAR(255),
  client_secret_encrypted TEXT,
  saml_gateway_url TEXT,
  saml_gateway_secret_encrypted TEXT,
  scopes TEXT NOT NULL DEFAULT 'openid email profile',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enforced BOOLEAN NOT NULL DEFAULT FALSE,
  jit_provisioning BOOLEAN NOT NULL DEFAULT TRUE,
  default_role VARCHAR(32) NOT NULL DEFAULT 'developer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enterprise_sso_org ON enterprise_sso_connections(organization_id,enabled);

CREATE TABLE IF NOT EXISTS enterprise_scim_tokens (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  token_prefix VARCHAR(32) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enterprise_ip_allowlist (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cidr VARCHAR(64) NOT NULL,
  label VARCHAR(255),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,cidr)
);

CREATE TABLE IF NOT EXISTS enterprise_policies (
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key VARCHAR(128) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,key)
);

CREATE TABLE IF NOT EXISTS enterprise_siem_sinks (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  endpoint TEXT NOT NULL,
  token_encrypted TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_delivery_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_evidence (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework VARCHAR(64) NOT NULL,
  control_key VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL CHECK(status IN ('pass','warn','fail','manual')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,framework,control_key)
);

CREATE TABLE IF NOT EXISTS iac_exports (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
  environment_id VARCHAR(64) REFERENCES project_environments(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL CHECK(provider IN ('terraform','json')),
  checksum CHAR(64) NOT NULL,
  manifest JSONB NOT NULL,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iac_exports_scope ON iac_exports(organization_id,project_id,environment_id,created_at DESC);

ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS auth_method VARCHAR(64) NOT NULL DEFAULT 'password';
ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS organization_id VARCHAR(64) REFERENCES organizations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS enterprise_roles (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id,key),
  CHECK (key ~ '^[a-z][a-z0-9_-]{1,31}$')
);
