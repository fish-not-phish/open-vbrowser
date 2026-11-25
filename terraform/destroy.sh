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
echo "→ Deleting orphaned S3 Files access points (created at runtime by the app)..."
FILE_SYSTEM_IDS="$(terraform -chdir="$SCRIPT_DIR" output -raw s3files_file_system_id 2>/dev/null || true)"
if [[ -n "$FILE_SYSTEM_IDS" ]]; then
  for FS_ID in $FILE_SYSTEM_IDS; do
    APS=$(aws s3files list-access-points --file-system-id "$FS_ID" --query 'accessPoints[].accessPointId' --output text 2>/dev/null || true)
    for AP in $APS; do
      echo "  deleting access point $AP"
      aws s3files delete-access-point --access-point-id "$AP" || true
    done
  done
else
  echo "  No file system output found; skipping."
fi

echo ""
echo "→ Destroying Terraform infrastructure..."
terraform -chdir="$SCRIPT_DIR" destroy -input=false -auto-approve

echo "✓ All done."
