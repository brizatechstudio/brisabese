# Segurança do BrisaBase 1.0

## Controles técnicos
- isolamento por organização/projeto/ambiente e RLS;
- sessões administrativas, MFA/TOTP, passkeys e Enterprise SSO;
- RBAC, custom roles, IP allowlist e audit logs;
- secrets criptografados e rotação de chaves;
- proteção SSRF para integrações externas;
- rate limiting e limites de payload/query;
- backups criptografados, recovery drills e PITR condicionado à certificação;
- executor de Functions em plano de execução privado;
- imagens de produção imutáveis e validação de configuração.

## Relato de vulnerabilidade
Use o [Security Advisory privado](https://github.com/brizatechstudio/brisabese/security/advisories/new). A política completa está em `SECURITY.md` e o build publica `public/.well-known/security.txt`. Não divulgue detalhes exploráveis publicamente antes de haver mitigação coordenada.

## Compliance
O Compliance Center produz evidências técnicas. Ele **não representa certificação jurídica ou auditoria SOC 2/GDPR** por si só.
