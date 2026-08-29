# BrisaBase — External Credentials & Production Provider Implementation Guide

This document is the operational source of truth for provisioning the **external accounts, credentials, domains and secrets** required to turn a green BrisaBase codebase into a real production deployment.

It is intentionally provider-aware but does not contain real secrets. Never paste live credentials into this repository, issues, pull requests, screenshots or chat logs.

## 1. Deployment principle

BrisaBase supports two production shapes:

- **self-hosted / single-host** — Docker Compose with PostgreSQL, Redis, MinIO, Caddy and the Functions executor bundled around the application;
- **managed / HA-oriented** — BrisaBase runs against external PostgreSQL, Redis and S3-compatible storage. Functions, telemetry and other components can be external services.

The real production environment must be validated using:

```bash
BRISABASE_ENV_FILE=.env.production npm run production:validate
```

The validator intentionally rejects missing provider credentials, weak secrets, insecure managed endpoints, public URLs using non-TLS schemes, wildcard CORS, pooled migration URLs and placeholder production values.

## 2. Golden rules for secrets

1. **Never commit `.env.production` or exported provider secrets.**
2. Use different credentials for development, preview/staging, sandbox and production.
3. Never reuse one random secret for two BrisaBase security roles.
4. Give external service credentials the minimum permissions required.
5. Prefer expiring/rotatable credentials where the provider supports them.
6. Store secrets in the deployment platform's secret/environment-variable store.
7. Never expose backend credentials through a `VITE_` variable. Vite-prefixed values may be shipped to browsers.
8. Rotate immediately after accidental disclosure and audit provider activity.
9. Keep a credential register containing only metadata: owner, provider, purpose, creation date, expiry/rotation date and secret-store location — never the value itself.
10. A configuration change that affects runtime behavior must be smoke-tested after redeploy.

## 3. Priority map

### P0 — required before a real public beta

- public app/API domain and HTTPS;
- public storage domain/URL when storage is enabled;
- public realtime WSS URL;
- production PostgreSQL credentials;
- production Redis credentials;
- S3-compatible application storage credentials;
- unique BrisaBase cryptographic/platform secrets;
- real backup destination and encryption key;
- production environment variables in the deployment platform;
- real backup + isolated restore drill;
- public smoke test and rollback procedure.

### P1 — required when the related feature is enabled

- SMTP credentials for password reset/email delivery;
- Functions executor URL/token in managed mode;
- alert webhook token/destination;
- OTLP exporter endpoint;
- Caddy/custom-domain authorization token;
- WebAuthn origins/RP ID;
- Twilio SMS credentials;
- Neon API key/project ID if PITR is enabled.

### P2 — commercial / later phase

- Paddle Sandbox credentials and catalog for paid-flow certification;
- Paddle Live credentials/catalog/webhook after account and website approval;
- enterprise identity/integration credentials when those modules are sold/enabled.

The **free beta must keep `BILLING_PROVIDER=disabled`**. Paddle Live is not a prerequisite for the free beta.

---

# 4. Public URLs, DNS and TLS

## Required variables

```env
APP_DOMAIN=brisabase.example.com
STORAGE_DOMAIN=storage.brisabase.example.com
ACME_EMAIL=ops@example.com
APP_URL=https://brisabase.example.com
API_URL=https://brisabase.example.com
STORAGE_PUBLIC_URL=https://storage.brisabase.example.com
REALTIME_PUBLIC_URL=wss://brisabase.example.com/realtime/v1/websocket
CORS_ALLOWED_ORIGINS=https://brisabase.example.com
```

For managed deployments, `APP_DOMAIN`, `STORAGE_DOMAIN` and `ACME_EMAIL` may be edge/provider-specific, but `APP_URL`, `API_URL`, `STORAGE_PUBLIC_URL`, `REALTIME_PUBLIC_URL` and CORS remain part of the runtime contract.

## Procedure

1. Choose the final public hostname for the BrisaBase app/control plane.
2. Choose the public storage hostname if storage is exposed through a separate host.
3. Add the domains to the hosting/edge provider.
4. Create the DNS records exactly as the provider requests.
5. Wait for public resolution.
6. Confirm the certificate is valid for the exact hostname.
7. Confirm HTTP redirects to HTTPS where appropriate.
8. Confirm the realtime endpoint upgrades through `wss://`.
9. Set `CORS_ALLOWED_ORIGINS` to exact trusted HTTPS origins. Never use `*` in production.
10. Run smoke tests from an external network, not only from inside the deployment network.

## Acceptance checks

- `APP_URL` and `API_URL` are public `https://` URLs;
- `STORAGE_PUBLIC_URL` is `https://` when storage is enabled;
- `REALTIME_PUBLIC_URL` is public `wss://`;
- no URL contains embedded username/password;
- CORS entries contain only public HTTPS origins;
- browser login, API calls, storage and realtime operate through the final domains.

---

# 5. Vercel project and environment variables

If Vercel is used for the public application/control plane, create a **new production project** and explicitly assign environment variables by scope.

Vercel environments are normally separated into Production, Preview and Development. Production secrets should not be copied into Preview unless the preview environment is intentionally allowed to use production infrastructure.

## Recommended Vercel procedure

1. Create/link the Vercel project from the approved repository/branch.
2. Under **Settings → Environment Variables**, add only the variables required by the chosen deployment profile.
3. Use **Production** values for the production deployment.
4. Use separate Preview/Development credentials and databases where practical.
5. Mark sensitive production values as sensitive where the Vercel UI offers that option.
6. Add the production custom domain under project Domains.
7. After environment variable changes, trigger a fresh production deployment because environment-variable changes do not retroactively modify an already-built deployment.
8. Record the deployed immutable Git SHA.

## Important realtime/runtime note

Vercel has introduced WebSocket support for Vercel Functions with Fluid compute, but a WebSocket connection is still bound to a Function instance and closes when that Function reaches its maximum execution duration. BrisaBase also contains restore, backup, Functions-executor and infrastructure assumptions that are naturally suited to persistent or managed services.

Therefore, **do not assume that “the frontend deploys on Vercel” automatically certifies the complete BrisaBase backend topology**. For a Vercel-hosted control plane, explicitly verify:

- Express/runtime compatibility;
- WebSocket reconnect behavior and connection-duration constraints;
- external PostgreSQL;
- external Redis;
- external S3 storage;
- no requirement for local Docker daemons or persistent filesystem state;
- Functions executor placement;
- backup job execution model;
- load and timeout behavior.

If those constraints are not satisfactory, keep Vercel for the web/frontend edge and place API/realtime/Functions on persistent managed compute.

Official references:

- Vercel environment variables: `https://vercel.com/docs/environment-variables`
- Vercel domains: `https://vercel.com/docs/domains`
- Vercel Functions/WebSockets guidance: `https://vercel.com/i/websocket-vs-server-sent-events`

---

# 6. PostgreSQL

## Required variables

Managed mode:

```env
DATABASE_URL=postgresql://brisabase_app:STRONG_PASSWORD@host:5432/brisabase?sslmode=require
DATABASE_MIGRATION_URL=postgresql://brisabase_migrator:DIFFERENT_PASSWORD@direct-host:5432/brisabase?sslmode=require
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=50
```

Self-hosted additionally uses:

```env
POSTGRES_USER=brisabase_admin
POSTGRES_PASSWORD=...
DATABASE_APP_USER=brisabase_app
DATABASE_APP_PASSWORD=...
```

## Credential model

Use separate roles where the provider allows it:

- **bootstrap/admin role** — provider/database administration only;
- **application role** — runtime API access, minimum required grants;
- **migration role** — schema changes through a direct database endpoint.

Do not run the application using the provider's superuser/bootstrap role.

## Requirements enforced by BrisaBase

- URL must include database, username and password;
- production passwords must not be placeholders and must contain at least 16 bytes of secret material;
- managed deployment must use TLS (`sslmode=require`, `verify-ca`, `verify-full`, or `DATABASE_SSL=true`);
- `DATABASE_MIGRATION_URL` must use a **direct** PostgreSQL endpoint, not a provider pooler endpoint with `-pooler` in the hostname;
- application pool minimum cannot exceed maximum.

## Provisioning steps

1. Create the production project/database.
2. Create the application and migration roles.
3. Copy connection strings to the secret store, not to Git.
4. Require TLS.
5. Configure connection limits appropriate for the provider plan.
6. Apply migrations using the migration endpoint.
7. Test RLS/tenant isolation with two organizations/projects.
8. Run a real backup and isolated restore drill before public signup.

## Neon as PostgreSQL/PITR provider

If Neon is selected, keep the database connection credentials separate from the **Neon management API** credentials used for PITR. The PITR integration additionally expects:

```env
PITR_ENABLED=true
PITR_PROVIDER=neon
NEON_PROJECT_ID=...
NEON_API_KEY=...
BRISABASE_PITR_OPERATOR_TOKEN=...
```

Create the Neon API key from the Neon account's developer/API settings and obtain the project ID from the project settings/API. The API key is a management credential and should not be exposed to the BrisaBase frontend.

Do not enable PITR until an isolated recovery rehearsal has been completed.

Official Neon reference: `https://neon.com/docs/introduction/point-in-time-restore`

---

# 7. Redis

## Variables

```env
REDIS_URL=rediss://:STRONG_PASSWORD@redis.example.net:6380
REDIS_TLS=true
REDIS_PREFIX=brisabase
```

## Requirements

- authenticated `redis://` or `rediss://` URL;
- production password at least 16 bytes and non-placeholder;
- managed production should use `rediss://` or `REDIS_TLS=true`;
- use a dedicated database/namespace or prefix for BrisaBase.

## Acceptance test

- application health succeeds;
- rate limiting/coordination works across more than one app process when running horizontally;
- TLS certificate validation succeeds;
- reconnect behavior is observed during a controlled Redis restart/failover if the provider supports it.

---

# 8. S3-compatible object storage

BrisaBase accepts S3-compatible providers such as AWS S3, Cloudflare R2, Backblaze B2 or managed MinIO-compatible services.

## Variables

```env
STORAGE_ENABLED=true
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://s3.example.net
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=brisabase
S3_FORCE_PATH_STYLE=false
S3_USE_SSL=true
STORAGE_PUBLIC_URL=https://storage.example.com
```

## Permissions

Create a dedicated application identity. Grant only the object/bucket operations BrisaBase needs for its assigned bucket/prefix. Do not use root/account-owner credentials.

For self-hosted MinIO, the application identity must be distinct from `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`; BrisaBase explicitly validates this separation.

## Recommended bucket layout

- application bucket: `brisabase` (or environment-specific equivalent);
- backup bucket: `brisabase-backups`;
- use separate production and non-production buckets;
- enable provider-side encryption/versioning/retention where appropriate;
- prevent public listing unless explicitly required.

## Acceptance test

1. upload object;
2. read object through authorized path;
3. create/use a signed URL where the product expects it;
4. verify unauthorized tenant access is denied;
5. delete object;
6. verify a backup object can be written/read by the backup subsystem;
7. confirm production application credentials cannot administer the entire provider account.

---

# 9. Internal BrisaBase cryptographic secrets

These are not third-party credentials, but they must be provisioned externally through the deployment secret store.

Generate strong independent values with:

```bash
npm run secrets:generate
```

Core variables include:

```env
JWT_SECRET=...
JWT_SECRET_PREVIOUS=
AUTH_ENCRYPTION_KEY=...
AUTH_ENCRYPTION_KEY_PREVIOUS=
ADMIN_BOOTSTRAP_TOKEN=...
BRISABASE_OPERATIONS_TOKEN=...
BACKUP_ENCRYPTION_KEY=...
BRISABASE_PITR_OPERATOR_TOKEN=...
FUNCTIONS_EXECUTOR_TOKEN=...
HOSTING_CADDY_ASK_TOKEN=...
ALERT_WEBHOOK_TOKEN=...
```

Do not reuse values. The production validator rejects several cases of secret reuse.

## Rotation

### JWT

1. move current value into `JWT_SECRET_PREVIOUS`;
2. generate a new `JWT_SECRET`;
3. deploy;
4. allow the old token window to expire;
5. remove `JWT_SECRET_PREVIOUS` in a later deploy.

### Auth encryption key

Use the corresponding `AUTH_ENCRYPTION_KEY_PREVIOUS` transition mechanism. Test decryption/read compatibility before removing the previous key.

For provider credentials, use the provider's dual-key/rotation mechanism when available and avoid a single-step revoke-before-deploy if that would cause downtime.

---

# 10. SMTP / transactional email

SMTP is optional only while email-dependent features remain intentionally unavailable. Password reset, welcome/security mail and any verification mail require a functioning provider.

## Variables

For standard STARTTLS on port 587:

```env
SMTP_ENABLED=true
SMTP_HOST=smtp.provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=no-reply@yourdomain.com
```

For implicit TLS on port 465:

```env
SMTP_PORT=465
SMTP_SECURE=true
```

BrisaBase passes `SMTP_SECURE` directly to Nodemailer. For most providers, **port 587 should use `SMTP_SECURE=false`** so Nodemailer starts normally and upgrades with STARTTLS; port 465 normally uses `true` for TLS from connection start.

## Provider setup

1. choose a transactional email provider;
2. verify the sending domain;
3. publish the provider's SPF and DKIM DNS records;
4. publish an appropriate DMARC record;
5. create an SMTP credential dedicated to production BrisaBase;
6. set an approved `SMTP_FROM` address;
7. store the credential in the deployment secret store;
8. enable SMTP;
9. run the application mail health check;
10. perform a real password-reset email test to more than one mailbox provider.

Do not disable TLS certificate validation in production.

Official Nodemailer SMTP reference: `https://nodemailer.com/smtp`

---

# 11. Functions executor

Self-hosted Compose can use the bundled executor service. Managed mode should provision Functions as a distinct service boundary.

## Variables

```env
FUNCTIONS_ENABLED=true
FUNCTIONS_EXECUTOR_URL=https://functions.example.com
FUNCTIONS_EXECUTOR_TOKEN=UNIQUE_48_PLUS_BYTE_SECRET
FUNCTIONS_RPC_CALLBACK_ORIGIN=https://brisabase.example.com
FUNCTIONS_EXECUTION_TIMEOUT_MS=30000
FUNCTIONS_MEMORY_LIMIT_MB=256
FUNCTIONS_MAX_CONCURRENT_EXECUTIONS=20
```

## Requirements

- executor URL must be a valid separate HTTPS service in managed production;
- it must not be the same origin as the main BrisaBase API;
- callback origin must be the correct BrisaBase public HTTPS origin;
- executor token must be unique and must not equal JWT/auth/bootstrap secrets;
- apply network controls so only intended callers can reach sensitive executor endpoints.

Acceptance: execute a safe test Function, verify logs/timeout behavior, verify invalid executor token is rejected, then confirm concurrency limits.

---

# 12. Backup and restore

## Variables

```env
BACKUP_ENABLED=true
BACKUP_ENCRYPTION_KEY=UNIQUE_SECRET
BACKUP_STORAGE_BUCKET=brisabase-backups
BACKUP_SCHEDULE=0 3 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_RESTORE_CERTIFIED=false
```

`BACKUP_RESTORE_CERTIFIED=false` should remain false until the **real provider** has passed a restore rehearsal. The Production Gate proves the mechanism on a disposable stack; it cannot prove that your actual account, bucket, IAM and provider retention are correct.

## Real certification procedure

1. deploy with backup enabled;
2. create known test data;
3. trigger/await a real backup;
4. confirm the backup object exists in the provider;
5. restore into a separate isolated database/environment;
6. verify migrations and known test rows;
7. record backup ID, timestamps, observed RPO/RTO and operator;
8. only then set operational certification evidence;
9. repeat on a defined schedule and after major storage/database changes.

---

# 13. Neon PITR

PITR is optional and should remain disabled until the provider integration is deliberately configured.

```env
PITR_ENABLED=false
PITR_PROVIDER=neon
NEON_PROJECT_ID=
NEON_API_KEY=
BRISABASE_PITR_OPERATOR_TOKEN=UNIQUE_SECRET
```

When enabling:

1. create a dedicated Neon management API key with the minimum available scope;
2. capture the exact Neon project ID;
3. generate a unique BrisaBase PITR operator token;
4. set `PITR_ENABLED=true` only in the environment that actually uses Neon;
5. perform point-in-time restoration into a safe branch/environment;
6. verify data and recovery timing;
7. record evidence.

Never expose `NEON_API_KEY` to frontend code.

---

# 14. Paddle billing

## 14.1 Free public beta

Use:

```env
BILLING_PROVIDER=disabled
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_PRICE_PRO=
PADDLE_PRICE_TEAM=
PADDLE_PRICE_ENTERPRISE=
```

This is intentional. The free beta does not need Paddle Live credentials and should not accidentally charge users.

## 14.2 Paddle Sandbox

Paddle Sandbox and Live are separate environments with separate accounts/data/credentials/catalogs.

### Create credentials

In Paddle Sandbox:

1. open **Developer tools → Authentication**;
2. create a server-side API key;
3. store it as `PADDLE_API_KEY`;
4. create products/prices for Pro and Team (and Enterprise if self-service Enterprise is intended);
5. store their `pri_...` IDs in the matching variables;
6. configure a default payment link/approved checkout setup;
7. create a notification destination pointing to the BrisaBase webhook endpoint;
8. store that destination's secret as `PADDLE_WEBHOOK_SECRET`.

Sandbox example:

```env
BILLING_PROVIDER=paddle
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=pdl_sdbx_apikey_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_PRICE_PRO=pri_...
PADDLE_PRICE_TEAM=pri_...
PADDLE_PRICE_ENTERPRISE=pri_...
```

BrisaBase production validation requires the API-key prefix to match the selected environment and validates Paddle price-ID prefixes.

### Webhook endpoint

Configure the provider notification destination for:

```text
https://YOUR_APP_DOMAIN/billing/v1/paddle/webhook
```

The server verifies Paddle's `Paddle-Signature` using the raw request body and HMAC-SHA256. Paddle's standard verification model signs `timestamp:rawBody`, and the BrisaBase implementation enforces the same five-second timestamp tolerance used by Paddle SDK helpers.

Subscribe to the billing events required for the lifecycle you want to support. The current engine handles subscription events, transaction events and adjustment/refund events and deduplicates events by Paddle event ID.

### Sandbox acceptance scenarios

Run all of these before Live:

1. Pro checkout succeeds;
2. Team checkout succeeds;
3. customer/organization mapping is correct;
4. subscription webhook creates/updates the correct organization subscription;
5. transaction paid/completed creates the invoice state;
6. failed payment state is represented correctly;
7. portal session opens for the correct customer;
8. cancel-at-period-end works;
9. immediate cancellation behavior is understood/tested if exposed;
10. full refund succeeds;
11. duplicate webhook delivery does not duplicate state;
12. invalid webhook signature is rejected;
13. sandbox price IDs cannot accidentally be used against Live.

**Current product limitation:** BrisaBase intentionally rejects self-service partial Paddle refunds because Paddle adjustments require line-item allocation. Use a full refund or the Paddle dashboard until partial-refund allocation is explicitly implemented.

## 14.3 Paddle Live

Do not simply change `sandbox` to `live`. Paddle Live has separate approval, credentials, catalog objects and notification destinations.

Live procedure:

1. complete Paddle business/account verification;
2. obtain website/domain approval required for checkout;
3. configure the real default payment link/checkout domain;
4. recreate/mirror products and prices in Live;
5. create a new Live API key with least privileges and rotation enabled if appropriate;
6. create a new Live notification destination and secret;
7. set Live `pri_...` price IDs;
8. deploy with `PADDLE_ENVIRONMENT=live` and Live secrets;
9. run a controlled low-value real transaction if business policy permits;
10. verify webhook, invoice, cancellation, portal and refund state;
11. verify taxes/pricing/refund policy with commercial/legal owners;
12. only then expose paid plans broadly.

Official Paddle references:

- API authentication: `https://developer.paddle.com/api-reference/about/authentication`
- Sandbox: `https://developer.paddle.com/sdks/sandbox`
- Webhook verification: `https://developer.paddle.com/webhooks/about/signature-verification`
- Go-live checklist: `https://developer.paddle.com/build/go-live-checklist`

Paddle API keys are server-side secrets. If a future UI integrates Paddle.js directly, create a separate **client-side token**; never send `PADDLE_API_KEY` to the browser.

---

# 15. Alerting and telemetry

## Alert webhook

```env
ALERT_WEBHOOK_ENABLED=true
ALERT_WEBHOOK_URL=https://alerts.example.com/brisabase
ALERT_WEBHOOK_TOKEN=UNIQUE_32_PLUS_BYTE_SECRET
```

Requirements:

- HTTPS URL;
- unique token not shared with auth/platform secrets;
- test at least one synthetic alert;
- document the on-call recipient and escalation path.

If `ALERT_WEBHOOK_ENABLED=false`, do not leave URL/token values configured; the production validator treats contradictory configuration as an error.

## OpenTelemetry exporter

```env
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
```

Use a public HTTPS endpoint accepted by the deployment architecture. If the chosen vendor requires an auth header/API key that is not currently represented by a BrisaBase environment variable, add that integration explicitly rather than inventing an undocumented variable.

---

# 16. WebAuthn / passkeys

Optional production variables:

```env
AUTH_WEBAUTHN_RP_ID=brisabase.example.com
AUTH_WEBAUTHN_RP_NAME=BrisaBase
AUTH_WEBAUTHN_ORIGINS=https://brisabase.example.com
```

Use the real registrable/RP domain and only public HTTPS origins. Changing RP ID later can invalidate credential usability, so select it deliberately before broad passkey enrollment.

---

# 17. Twilio SMS

Twilio is optional. If any Twilio variable is configured, BrisaBase expects all three together:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

Use a production messaging identity/number authorized for the target countries and store the auth token as a backend secret. Test rate limits, opt-out/compliance behavior and delivery before enabling SMS-dependent security flows.

---

# 18. Custom domain authorization / Caddy

When the BrisaBase custom-domain hosting feature is enabled:

```env
HOSTING_ENABLED=true
HOSTING_CUSTOM_DOMAINS_ENABLED=true
HOSTING_CADDY_ASK_TOKEN=UNIQUE_32_PLUS_BYTE_SECRET
```

The ask token is a security boundary. It must be unique and secret. Test a permitted and rejected domain before public availability.

For self-hosted Caddy edge TLS, also provide:

```env
APP_DOMAIN=...
STORAGE_DOMAIN=...
ACME_EMAIL=...
```

---

# 19. AI provider allowlist

```env
AI_PROVIDER_ALLOWED_HOSTS=api.openai.com,openrouter.ai,api.groq.com,api.mistral.ai
```

This variable is a **host allowlist, not a credential**. Do not add provider API keys to random new environment variables unless the corresponding BrisaBase integration explicitly defines and consumes them. Provider secrets must remain server-side or in the product's secure integration store.

---

# 20. GitHub administrative controls

These are not runtime credentials but remain external release controls:

- enable `main` branch protection/rulesets;
- require appropriate CI/CodeQL checks before merge;
- prevent force pushes/deletion where appropriate;
- keep GitHub Actions permissions least-privileged;
- enable Private Vulnerability Reporting/Security Advisories;
- restrict who can create production tags/releases.

A green CI run is not a substitute for repository governance.

---

# 21. Recommended order of implementation

## Phase A — infrastructure foundation

1. choose managed vs self-hosted topology;
2. create production domain/DNS plan;
3. provision PostgreSQL;
4. provision Redis;
5. provision S3-compatible storage and backup bucket;
6. generate BrisaBase internal secrets;
7. create deployment project/compute and configure environment variables;
8. deploy with SMTP/PITR/Paddle/alerts disabled unless already provisioned;
9. run `production:validate`.

## Phase B — core production smoke

1. run DB migrations/status check;
2. create admin/test organization;
3. validate login/session/logout;
4. validate database isolation;
5. validate storage upload/read/delete;
6. validate realtime WSS;
7. validate Functions only if enabled;
8. verify logs/health endpoints;
9. test rollback to previous immutable candidate.

## Phase C — data protection

1. enable scheduled backup;
2. produce a real provider backup;
3. restore into isolated environment;
4. record evidence and RPO/RTO;
5. optionally enable/test Neon PITR.

## Phase D — communications/operations

1. configure SMTP and real password reset;
2. configure alert webhook/telemetry;
3. define support, privacy and security channels;
4. run synthetic incident/alert test.

## Phase E — commercial billing later

1. Paddle Sandbox;
2. catalog and default payment link;
3. webhook destination;
4. checkout/subscription/portal/cancel/refund tests;
5. Live account approval;
6. Live catalog/credentials/webhook;
7. controlled production transaction;
8. enable paid plans only after commercial/legal approval.

---

# 22. Pre-deploy validation commands

From the exact candidate source:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run release:manifest:verify
BRISABASE_ENV_FILE=.env.production npm run production:validate
```

For the release candidate, use the project's official CI/Production Gate rather than replacing it with ad-hoc commands.

Useful deployment/security commands already provided by the repository include:

```bash
npm run secrets:generate
npm run images:lock
npm run release:validate:docker
npm run phase8:verify
```

Do not run destructive restore/drill tooling against the only production database. Use a controlled disposable/isolated recovery target.

---

# 23. Go-live external acceptance checklist

The real service is ready for public signup only when all applicable items are true:

- [ ] final code SHA has CI, CodeQL and Production Gate green;
- [ ] environment passes `production:validate`;
- [ ] production domain resolves publicly;
- [ ] HTTPS certificate/chain is valid;
- [ ] WSS realtime works through the public hostname;
- [ ] CORS contains only approved HTTPS origins;
- [ ] PostgreSQL app and migration credentials are distinct/least privilege;
- [ ] managed PostgreSQL uses TLS;
- [ ] Redis authentication/TLS validated;
- [ ] S3 app identity and bucket policies validated;
- [ ] no root S3/MinIO credentials are exposed to the app;
- [ ] unique JWT/auth/bootstrap/operations/backup secrets installed;
- [ ] real backup exists;
- [ ] isolated restore drill passed;
- [ ] rollback to previous candidate tested;
- [ ] SMTP password-reset flow passed if email is enabled;
- [ ] alert/on-call path tested if alerts are enabled;
- [ ] Functions executor test passed if Functions are enabled;
- [ ] PITR drill passed if PITR is enabled;
- [ ] `BILLING_PROVIDER=disabled` for free beta;
- [ ] or Paddle Sandbox/Live acceptance completed before paid launch;
- [ ] GitHub branch governance enabled;
- [ ] final Terms/Privacy/subprocessor information published;
- [ ] support/privacy/security contacts published;
- [ ] public-domain smoke test recorded with SHA/date/operator;
- [ ] release tag is created only from the exact final approved SHA.

---

# 24. Incident response for leaked credentials

If any credential is exposed:

1. assume compromise;
2. revoke/rotate it at the provider immediately;
3. deploy the replacement through the secret store;
4. inspect provider audit/access logs;
5. determine exposure window and affected resources;
6. rotate dependent credentials if lateral access was possible;
7. invalidate sessions/tokens if an auth secret was affected;
8. remove the secret from source/history where applicable, but do not treat Git history removal as a substitute for rotation;
9. document the incident and preventive control.

For a Paddle API key accidentally committed to a public repository, Paddle performs secret scanning and may automatically revoke high-risk exposed keys. Treat any exposure as compromised regardless of automatic provider action.

---

# 25. Definition of done

External provisioning is complete when the team can answer **yes** to all of these:

- Can a clean deployment start without placeholder credentials?
- Does `production:validate` pass using the real production environment?
- Can a non-privileged user sign in through the final domain?
- Can two tenants prove isolation?
- Can storage/realtime/Functions (if enabled) operate through real public endpoints?
- Can a real backup be restored into an isolated target?
- Can the service roll back safely?
- Can operators receive and respond to a critical alert?
- Are credentials owned, rotated and stored outside Git?
- Is billing explicitly disabled for free beta, or fully certified in Paddle for paid launch?
- Are legal/support/security contact requirements published?
- Is the final release tied to one immutable, green SHA?

When these are true, the remaining gap between “green code” and “production-ready service” is closed.
