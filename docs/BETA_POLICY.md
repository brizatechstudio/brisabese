# Política do beta BrisaBase

## Estado de lançamento

O BrisaBase pode operar como **beta público gratuito** quando os gates técnicos do mesmo SHA estiverem verdes e os itens legais e operacionais aplicáveis do `docs/GO_LIVE_CHECKLIST.md` estiverem aprovados. Durante essa fase, cadastro público pode ser habilitado, mas cobrança real permanece bloqueada.

## Compromissos do beta público gratuito

- disponibilidade e suporte em melhor esforço, sem SLA;
- `BILLING_PROVIDER=disabled` obrigatório no beta e nenhuma cobrança real;
- Paddle é o provedor comercial planejado, mas credenciais, checkout e webhooks live permanecem inativos até validação dos objetivos do beta;
- somente releases identificadas por tag imutável e aprovadas no mesmo SHA pelo **BrisaBase Production Gate**;
- registro de SBOM, manifesto SHA-256, imagens por digest e evidências de teste por candidato;
- incidentes de segurança enviados por Security Advisory privado;
- mudanças incompatíveis e limitações conhecidas descritas nas notas de release.

## Limitações conhecidas

- Self-Hosted é single-host e não oferece HA por si só;
- PITR e restore parcial dependem do provedor/infraestrutura e de certificação operacional;
- Functions Enterprise exige executor externo isolado quando habilitado;
- SDKs marcados como `preview` não possuem garantia de estabilidade;
- o beta não deve receber dados sensíveis, regulados ou cuja perda cause impacto material.

## Critério para ativar cobrança

A cobrança só pode ser ativada depois que os objetivos do beta forem validados e pricing, impostos, cancelamento, refunds, suporte e operação estiverem aprovados. A ativação deve ocorrer primeiro em Paddle Sandbox e só depois com credenciais Paddle Live.
