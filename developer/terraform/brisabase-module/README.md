# BrisaBase Terraform bridge

BrisaBase 1.0 exports a checksum-pinned environment manifest and a Terraform `terraform_data` bridge. It deliberately does **not** pretend to be a native Terraform provider plugin: Terraform calls the official `brisabase` CLI to verify drift against the live control plane.

1. `brisabase iac export brisabase.manifest.json`
2. Save the emitted `main.tf` next to the manifest.
3. Configure `BRISABASE_URL` and an admin token using Terraform variables/secrets.
4. `terraform plan` / `terraform apply` verifies that the checked-in manifest still matches the live environment.

A future native provider can consume the same `/api/iac/*` API without changing the manifest contract.
