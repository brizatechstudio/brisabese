# BrisaBase CLI

Cliente oficial de linha de comando do BrisaBase. Durante o beta fechado, instale somente o tarball gerado por um workflow **BrisaBase Production Gate** aprovado e confira o SHA-256 publicado no mesmo artefato de evidências.

```bash
npm install --global ./brisabase-cli-<version>.tgz
brisabase --version
brisabase doctor
```

O CLI usa `brisabase.json` e os perfis/targets documentados em `docs/DEPLOYMENT_PROFILES.md`. A publicação em registro público permanece bloqueada até a escolha e aprovação da licença do projeto.
