# Suporte — beta público gratuito

O suporte do beta público gratuito é prestado em regime de **melhor esforço, sem SLA de resposta ou resolução**. Bugs reproduzíveis podem ser enviados pelo formulário de issue do repositório, sempre sem tokens, credenciais, dados pessoais, dados de clientes ou outras informações sensíveis.

Vulnerabilidades usam exclusivamente o Security Advisory privado do repositório. Incidentes de uma implantação real devem seguir o runbook e a escala de plantão definidos pelo operador daquele ambiente; uma issue pública não é canal de incidente.

## Canais mínimos antes da abertura do cadastro

Antes de aceitar usuários externos, o operador deve publicar e testar:

- um canal privado de suporte e privacidade acessível aos usuários;
- o responsável operacional primário e um contato de contingência;
- a rota de escalonamento para incidentes P0/P1;
- os horários e idiomas efetivamente suportados;
- o canal privado de segurança indicado acima.

Esses dados são configuração operacional da implantação e não devem ser inventados ou preenchidos com placeholders na versão pública.

## Severidade

- **P0** — indisponibilidade ampla, perda/corrupção de dados ou incidente crítico de segurança.
- **P1** — degradação importante sem workaround aceitável.
- **P2** — falha funcional com workaround.
- **P3** — dúvida, melhoria ou problema cosmético.

No beta público gratuito, essa matriz é usada para triagem e **não representa compromisso contratual**. SLAs de resposta ou resolução só devem ser publicados quando houver capacidade operacional e contrato/plano que os sustentem.

## Dados de teste

O beta não deve ser usado para dados sensíveis, regulados ou cuja perda cause impacto material. Usuários devem ser orientados a manter cópias próprias de qualquer dado importante durante a fase de validação.
