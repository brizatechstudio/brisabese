# Governança do repositório

Estas regras são parte do gate de beta, mas precisam ser aplicadas por um administrador no GitHub; arquivos no repositório não substituem a proteção da branch.

## Regra obrigatória para `main`

- exigir pull request e uma aprovação;
- invalidar aprovações quando novos commits forem enviados;
- exigir resolução de todas as conversas;
- exigir branch atualizada antes do merge;
- exigir os checks `validate` e `Analyze JavaScript and TypeScript`;
- bloquear force-push e deleção;
- aplicar as regras também a administradores;
- restringir push direto e, se a operação suportar, exigir commits assinados.

Depois de salvar a regra, confirme pela API/UI que `main` aparece como protegida e arquive uma captura ou exportação da configuração junto às evidências da release.

## Regra de release

Uma tag beta só pode ser criada para um SHA da `main` cujo **BrisaBase Production Gate** esteja concluído com sucesso. A tag não pode ser movida ou reutilizada. O inventário de Code Scanning, Dependabot Alerts e Secret Scanning precisa estar sem alerta Critical/High não aceito, com qualquer exceção registrada nas notas da release.
