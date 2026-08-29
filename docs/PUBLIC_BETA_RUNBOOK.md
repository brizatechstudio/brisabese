# Runbook — beta público gratuito

Este runbook é o procedimento operacional mínimo para abrir o cadastro público do BrisaBase. Ele complementa `docs/GO_LIVE_CHECKLIST.md` e não substitui revisão jurídica nem credenciais de provedores externos.

## 1. Congelar o candidato

- usar um SHA da `main` com CI, CodeQL e **BrisaBase Production Gate** verdes no mesmo commit;
- confirmar `npm run release:manifest:verify`;
- confirmar `BILLING_PROVIDER=disabled`;
- registrar o SHA, versão, horário, operador e links das evidências;
- não alterar código, configuração versionada ou artefatos depois do gate sem criar novo candidato.

## 2. Configuração do ambiente real

Executar `BRISABASE_ENV_FILE=.env.production npm run production:validate` antes do deploy. O arquivo real não deve ser commitado.

Confirmar no mínimo:

- `APP_URL` e `API_URL` públicos em HTTPS;
- `REALTIME_PUBLIC_URL` em WSS;
- CORS restrito às origens reais;
- PostgreSQL com usuário de aplicação não administrativo e credenciais fortes;
- Redis autenticado/TLS quando gerenciado;
- storage externo/MinIO com identidade de aplicação distinta da identidade root;
- JWT, encryption key, bootstrap token, operations token e backup key fortes, independentes e não reutilizados;
- imagens imutáveis por digest quando o perfil self-hosted for usado;
- `SMTP_ENABLED=false` enquanto e-mail externo não for necessário/configurado;
- `PITR_ENABLED=false` enquanto o provedor PITR não estiver certificado;
- `BILLING_PROVIDER=disabled` e credenciais Paddle live ausentes durante o beta gratuito.

Para o procedimento detalhado de cada credencial/provedor, seguir `docs/EXTERNAL_CREDENTIALS_IMPLEMENTATION.md`.

## 3. DNS, TLS e conectividade

Antes de abrir cadastro externo:

1. apontar os domínios reais para o ambiente de produção;
2. confirmar resolução DNS pública a partir de mais de uma rede/resolvedor;
3. validar certificado TLS, hostname e cadeia completa;
4. confirmar redirecionamento HTTP -> HTTPS quando aplicável;
5. confirmar health check público sem expor secrets;
6. validar conexão WSS/realtime pelo domínio público;
7. validar upload/download pelo domínio de storage quando separado.

Não considerar apenas a emissão do certificado como aprovação: o smoke test precisa usar as mesmas URLs que os usuários usarão.

## 4. Smoke test antes da abertura

Usar uma conta de teste sem privilégios especiais e validar no domínio público:

- cadastro e login;
- persistência de sessão e logout;
- recuperação de senha somente quando SMTP estiver configurado; caso contrário, manter o fluxo indisponível com mensagem clara;
- criação/abertura de projeto e operações de banco permitidas;
- isolamento entre organizações/projetos/ambientes;
- storage, realtime e Functions somente quando habilitados;
- limites/rate limiting e respostas de erro sem detalhes sensíveis;
- responsividade das rotas públicas e administrativas necessárias ao beta;
- página de billing mostrando beta gratuito e sem checkout ativo.

Registrar data, SHA, domínio testado e resultado.

## 5. Backup e restore drill

Antes de aceitar dados externos:

1. confirmar `BACKUP_ENABLED=true`, bucket dedicado, criptografia e retenção;
2. disparar ou aguardar um backup real e registrar o identificador/horário;
3. verificar que o objeto de backup existe no storage e que a política de retenção está ativa;
4. restaurar uma cópia em ambiente isolado/destrutível — nunca sobre produção como primeiro teste;
5. validar integridade mínima: migrations, organizações/projetos de teste e leitura de dados conhecidos;
6. registrar a evidência do drill e somente então marcar a certificação operacional de restore conforme o mecanismo da implantação.

O Production Gate valida o mecanismo em stack descartável. O go-live exige adicionalmente um drill no provedor/storage que será usado em produção.

## 6. Rollback

Antes da abertura pública, selecionar e registrar o último candidato conhecido como bom.

Para aplicação:

- manter o artefato/imagem/tag anterior imutável disponível;
- testar a capacidade de voltar o tráfego/deployment para esse candidato;
- após rollback, executar health check e smoke test de login/leitura;
- não reverter migrations destrutivamente sem um plano de banco específico.

Para banco:

- preferir migrations compatíveis para frente;
- em corrupção/perda de dados, seguir restore/PITR em vez de executar downgrade SQL improvisado;
- registrar RPO/RTO observados no drill, sem prometer SLA público durante o beta gratuito.

## 7. Operação e incidentes

Antes de abrir cadastro:

- definir um responsável operacional primário e um contato de contingência;
- definir onde chegam alertas de indisponibilidade/erro;
- testar pelo menos um alerta sintético ou webhook quando alerting externo estiver habilitado;
- publicar o canal privado de suporte/privacidade;
- confirmar que vulnerabilidades podem ser enviadas pelo Security Advisory privado;
- manter P0/P1 com rota de escalonamento clara, ainda que sem SLA público.

## 8. Legal e privacidade

Os arquivos em `docs/legal/` são modelos e não devem ser apresentados como documentos jurídicos aprovados. Antes do cadastro público, a versão publicada deve refletir a entidade operadora, jurisdição, subprocessadores realmente utilizados, retenção, direitos do titular e canais de contato.

O beta gratuito não elimina obrigações de privacidade ou termos aplicáveis.

## 9. Decisão de abertura

O cadastro público pode ser habilitado somente quando todos forem verdadeiros:

- SHA final com Production Gate verde;
- ambiente real validado por `production:validate`;
- DNS/TLS/WSS aprovados;
- smoke test público aprovado;
- backup real e restore drill do ambiente aprovados;
- rollback testado;
- suporte/operação mínimos publicados;
- Termos e Privacidade aplicáveis publicados após revisão;
- `BILLING_PROVIDER=disabled` confirmado.

Depois da aprovação, criar a tag/release beta no **mesmo SHA aprovado**, arquivar evidências e então abrir o cadastro. Se qualquer item crítico falhar, manter ou retornar o cadastro ao estado restrito até a correção.
