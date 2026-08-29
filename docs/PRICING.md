# Pricing — estado do beta

A implementação contém quatro tiers técnicos: **Free, Pro, Team e Enterprise**. Durante o beta público, `BILLING_PROVIDER=disabled` é obrigatório e os valores exibidos são referências técnicas, não uma oferta comercial. Checkout, cobrança e overage pagos permanecem desativados até a validação dos objetivos do beta.

- **Free**: plano efetivo do beta público, sem cobrança externa.
- **Pro**: referência para futura cobrança recorrente e limites ampliados.
- **Team**: referência para futura colaboração e limites maiores.
- **Enterprise**: referência para limites contratuais, SSO, SCIM, SIEM, políticas e suporte negociado.

Quando `BILLING_PROVIDER=disabled`, o BrisaBase opera sem processamento externo de pagamentos. A integração comercial planejada é Paddle. Depois do beta, a ativação segue `PADDLE_ENVIRONMENT=sandbox` para homologação e só então `PADDLE_ENVIRONMENT=live` com credenciais Live.

O BrisaBase não armazena dados completos de cartão. Checkout e portal de cliente são hospedados pelo provedor. Pricing, impostos, ciclo, cancelamento, reembolso, limites, tratamento de excedentes e canal de suporte devem ser aprovados antes de cobrança real.
