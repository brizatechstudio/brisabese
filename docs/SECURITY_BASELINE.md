# BrisaBase Security Baseline

This document defines technical controls expected from each deployment profile. It is an engineering baseline, not a legal compliance certification.

## Controls already enforced by the runtime

- organization/project/environment scoping and Row-Level Security;
- signed JWTs with issuer/audience/expiry validation and secret rotation support;
- refresh-session persistence and revocation;
- memory-hard password hashing for real HTTP authentication with legacy-hash compatibility;
- MFA/TOTP, passkeys/WebAuthn and Enterprise SSO capabilities;
- Redis-backed authentication throttling in real admin/application auth routes;
- strict CORS allowlists in production;
- CSP, HSTS on secure production requests, frame denial, MIME sniffing protection, referrer and permissions policies;
- cookie-backed application refresh rejects untrusted browser origins while explicit token clients remain supported;
- administrative refresh rejects browser requests explicitly marked `Sec-Fetch-Site: cross-site`, while CLI/server clients without browser Fetch Metadata remain compatible;
- encrypted application secrets with key rotation support;
- isolated Functions execution plane in bundled Hobby/Self-Hosted deployments;
- backup encryption, recovery certification and optional PITR;
- production configuration validation and immutable release identifiers;
- non-privileged application database role in the bundled production topology;
- Enterprise migration credentials isolated into a short-lived migration container rather than the long-running application runtime;
- audit logs, IP allowlists, custom roles and SIEM-oriented Enterprise controls.

## Hobby

Hobby is safe for local learning because host services bind to loopback. It is not an internet production profile.

Required:
- keep `NODE_ENV=development`;
- keep the stack on `127.0.0.1`;
- do not reuse Hobby credentials anywhere else;
- do not publish PostgreSQL, Redis, MinIO or Mailpit ports through router/NAT rules.

## Self-Hosted

Self-Hosted is a production profile for one server.

Required:
- HTTPS at the edge;
- strong unique PostgreSQL, Redis, JWT, encryption, bootstrap, backup and executor secrets;
- authenticated Redis;
- application-specific PostgreSQL user;
- immutable dependency images/digests;
- secure cookies;
- production CORS allowlist;
- encrypted backups;
- private Functions plane;
- observability enabled;
- restore certification before destructive restore is enabled.

`deployment init self-hosted` generates the BrisaBase-owned secret material automatically. Domains, immutable image digests and operator-owned external credentials must still be reviewed before `doctor` can pass.

Do not describe the bundled Compose as HA. A single host remains a single failure domain.

## Enterprise

Enterprise externalizes stateful infrastructure so organizations can apply their own availability, networking and compliance controls.

Required:
- external PostgreSQL with TLS and separate application/migration roles;
- `DATABASE_MIGRATION_URL` available only to the one-shot migration service, never the application container;
- external authenticated Redis with TLS;
- external S3-compatible object storage over HTTPS;
- immutable BrisaBase image;
- corporate ingress/WAF or the optional hardened edge profile;
- centralized monitoring/alerting for production services;
- controlled secret rotation and backup/recovery runbooks;
- `BRISABASE_DEPLOYMENT_MODE=managed` and `BRISABASE_PRODUCTION_TIER=ha`.

Managed/HA Functions are intentionally not supplied as a single bundled executor. Keep `FUNCTIONS_ENABLED=false` until the organization deploys a separate HTTPS Functions service with its own immutable images, horizontal scaling/private networking controls and a unique executor token. When enabled, the runtime requires the executor to use a different HTTPS origin from the BrisaBase callback origin.

Recommended for regulated environments:
- external secret manager instead of long-lived `.env` files;
- mTLS/private networking between application and managed infrastructure where available;
- SIEM export and immutable audit retention;
- SSO + MFA enforcement for administrative users;
- scheduled vulnerability scanning of images and dependencies;
- SBOM retention for every release;
- regular recovery drills and documented RTO/RPO;
- independent penetration testing before compliance claims.

## Rate limiting

Real BrisaBase authentication routes use the shared Redis runtime for counters. This matters for horizontally scaled deployments: limits must be shared across replicas rather than stored in a process-local map.

Any new internet-facing authentication or sensitive-action route must use a distributed limiter or an equivalent shared enforcement point. Process-local limiters are acceptable only for tests/legacy compatibility and must not be introduced into production auth routes.

## CSRF and browser credential boundaries

The normal admin/control plane uses explicit Bearer credentials. Application refresh also supports an HttpOnly refresh cookie for browser sessions. When the cookie fallback is used, the request origin must belong to the configured application/CORS allowlist; a remote origin cannot rotate the session cookie. Non-browser clients that send the refresh token explicitly continue to work without a browser Origin header.

Administrative refresh has an additional Fetch Metadata boundary: a browser request marked by the user agent as cross-site is rejected before token rotation. This is defense in depth and does not replace the CORS/origin policy or secure SameSite/HttpOnly cookie configuration.

New state-changing endpoints that rely on ambient browser credentials must implement equivalent Origin/CSRF enforcement. Do not treat CORS alone as CSRF protection.

## Software supply chain

The normal BrisaBase CI now treats supply-chain evidence as part of the release contract:
- production dependencies are checked with `npm audit --omit=dev --audit-level=high`;
- a CycloneDX SBOM is generated from the locked npm dependency graph;
- the SBOM is uploaded as a CI artifact so a build has reviewable component evidence;
- Dependabot monitors npm and GitHub Actions updates on a scheduled basis;
- immutable image digests remain required by the production/Enterprise validators.

A clean audit is not a substitute for SAST, container scanning or penetration testing. Organizations with stronger requirements should add those controls to their own release policy and retain the generated SBOM alongside deployed image digests.

## Local target state

Named CLI targets contain endpoint URLs only and are kept in `brisabase.targets.json`. This file is ignored by Git so machine-specific local/remote target selection does not leak into source control. Authentication tokens remain in the CLI session store rather than the target file.

## Security claims

Do not publish benchmark, compliance, penetration-test or availability claims unless the corresponding evidence exists and is reproducible. The Compliance Center and automated security gates produce technical evidence; they are not substitutes for SOC 2, ISO 27001, GDPR/LGPD legal analysis or an independent audit.
