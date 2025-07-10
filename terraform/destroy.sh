#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TERRAFORM_CONTAINER="containers-updater"
TF_WORKDIR="/terraform"

echo "→ Initializing Terraform inside '$TERRAFORM_CONTAINER'…"
docker exec -w "$TF_WORKDIR" "$TERRAFORM_CONTAINER" \
  terraform init -input=false -upgrade

echo "→ Destroying Terraform in '$TERRAFORM_CONTAINER'…"
docker exec -w "$TF_WORKDIR" "$TERRAFORM_CONTAINER" \
  terraform destroy \
    -input=false \
    -auto-approve \
    -var-file=images.auto.tfvars.json

echo "→ Destroying main infrastructure..."
terraform destroy -input=false -auto-approve

echo "✓ Terraform destroy complete."

echo -e "\n🚀  Destroying Docker Compose stacks and volumes…"
for stack in "containers-update" "vbrowser-stack"; do
  STACK_DIR="$BASE_DIR/docker/$stack"
  if [ -d "$STACK_DIR" ]; then
    echo "   • $stack → running docker compose down -v"
    pushd "$STACK_DIR" >/dev/null
      docker compose down -v
    popd >/dev/null
  else
    echo "⚠️  Stack directory not found: $STACK_DIR"
  fi
done

echo "✓ All done."