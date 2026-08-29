# Política de segurança

## Como relatar uma vulnerabilidade

Use exclusivamente o formulário privado de [Security Advisories do BrisaBase](https://github.com/brizatechstudio/brisabese/security/advisories/new). Não abra uma issue pública com detalhes exploráveis, credenciais, dados pessoais ou dados de clientes.

Inclua, quando possível:

- componente e versão ou SHA afetado;
- impacto e pré-condições;
- passos mínimos para reprodução;
- prova de conceito sem dados reais;
- mitigação sugerida.

O projeto fará triagem em regime de melhor esforço durante o beta. Um prazo de correção só será informado depois que impacto e reprodutibilidade forem confirmados. A divulgação coordenada deve aguardar uma correção ou mitigação acordada.

## Versões suportadas

Até a primeira release beta pública, somente o SHA candidato mais recente aprovado pelo workflow **BrisaBase Production Gate** recebe correções de segurança. Depois da publicação, esta seção deve listar explicitamente as versões suportadas.

## Escopo

São relevantes vulnerabilidades no servidor, console, SDK, CLI, imagens, manifests de implantação e isolamento entre organizações/projetos/ambientes. Relatos que dependam exclusivamente de configuração insegura já proibida pelo validador de produção podem ser tratados como hardening ou documentação.
