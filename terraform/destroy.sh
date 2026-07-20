#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$BASE_DIR/docker"

echo "→ Stopping Docker Compose stack..."
if [[ -f "$DOCKER_DIR/docker-compose.yml" ]]; then
  docker compose -f "$DOCKER_DIR/docker-compose.yml" down -v || true
  echo "✓ Docker Compose stack stopped."
else
  echo "⚠️  No docker-compose.yml found at $DOCKER_DIR; skipping."
fi

echo ""
echo "→ Destroying Terraform infrastructure..."
terraform -chdir="$SCRIPT_DIR" destroy -input=false -auto-approve

echo "✓ All done."
