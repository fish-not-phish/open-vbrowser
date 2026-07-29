#!/usr/bin/env bash
# build_browsers.sh — Build each browser Docker image and push it to ECR.
#
# DNS record creation is handled by the backend (sessions.tasks.
# upsert_dns_record) — no Cloudflare credentials are needed in the images.
# Each image is just `FROM vbrowser/<name>:latest` with no customization,
# so no per-browser Dockerfile or build context directory is needed.
#
# Usage:
#   ./build_browsers.sh                  # build every image in ALL_BROWSER_IMAGES
#   ./build_browsers.sh chrome mullvad   # build specific images only
#
# Reads from ../.env automatically if it exists. Required env vars:
#   ECR_REGISTRY, AWS_REGION (or AWS_DEFAULT_REGION)
#   CUSTOM_DOMAIN
#   DEFAULT_IDLE_THRESHOLD (minutes)
#   USER_EMAIL (or DJANGO_SUPERUSER_EMAIL as fallback)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
LOG_FILE="$SCRIPT_DIR/build_browsers.log"

# ── Browser image catalogue ──────────────────────────────────────────────────
# Add or remove entries here to control which images are built/pushed.
# The ECR tag matches the name in this list (e.g. ECR_REGISTRY:chrome).
ALL_BROWSER_IMAGES=(
  brave
  chrome
  code-server
  edge
  firefox
  floorp
  kali
  librewolf
  mullvad
  palemoon
  pulse
  telegram
  terminal
  tor
  ubuntu
  vivaldi
  waterfox
  zen
)

# Load .env if it exists and vars aren't already set in the environment
if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
fi

# AWS_REGION takes precedence; fall back to AWS_DEFAULT_REGION (Terraform SDK name)
AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"

# USER_EMAIL falls back to DJANGO_SUPERUSER_EMAIL
USER_EMAIL="${USER_EMAIL:-${DJANGO_SUPERUSER_EMAIL:-}}"

# ── Validate required vars ────────────────────────────────────────────────────
: "${ECR_REGISTRY:?ECR_REGISTRY is not set}"
: "${AWS_REGION:?AWS_REGION is not set}"
: "${CUSTOM_DOMAIN:?CUSTOM_DOMAIN is not set}"
: "${DEFAULT_IDLE_THRESHOLD:?DEFAULT_IDLE_THRESHOLD is not set}"
: "${USER_EMAIL:?USER_EMAIL (or DJANGO_SUPERUSER_EMAIL) is not set}"

# ── Which images to build ─────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  selected=("$@")
else
  selected=("${ALL_BROWSER_IMAGES[@]}")
fi

touch "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — build_browsers.sh START [${selected[*]}]" | tee -a "$LOG_FILE"

# ── ECR login ─────────────────────────────────────────────────────────────────
echo ""
echo "→ Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
echo "→ Docker login succeeded."

# ── Build each image ──────────────────────────────────────────────────────────
# Each image is a trivial single-FROM Dockerfile piped via stdin — no
# per-browser build context directory is needed.
failed=()

for name in "${selected[@]}"; do
  echo ""
  echo "===================="
  echo "Building '$name'..."
  echo "===================="

  echo "FROM vbrowser/${name}:latest" | docker build --no-cache --pull -t "$name" -f - "$SCRIPT_DIR"
  rc=$?

  if [[ $rc -ne 0 ]]; then
    echo "❌ Build failed for '$name' (exit code $rc)."
    failed+=("$name")
    echo "$(date '+%Y-%m-%d %H:%M:%S') — Build failed: $name (rc=$rc)" >> "$LOG_FILE"
  else
    echo "✅ Built '$name'."
  fi
done

# ── Retry failures once ───────────────────────────────────────────────────────
if (( ${#failed[@]} > 0 )); then
  echo ""
  echo "============================================"
  echo "Retrying ${#failed[@]} failed build(s)..."
  echo "============================================"
  still_failed=()
  for name in "${failed[@]}"; do
    echo ""
    echo "🔄 Retrying '$name'..."
    echo "FROM vbrowser/${name}:latest" | docker build --no-cache --pull -t "$name" -f - "$SCRIPT_DIR"
    rc=$?
    if [[ $rc -ne 0 ]]; then
      echo "❌ Still failed on retry: $name"
      echo "$(date '+%Y-%m-%d %H:%M:%S') — Retry failed: $name (rc=$rc)" >> "$LOG_FILE"
      still_failed+=("$name")
    else
      echo "✅ Built '$name' on retry."
    fi
  done
  failed=("${still_failed[@]}")
fi

# ── Prune dangling images and build cache ─────────────────────────────────────
echo ""
echo "============================================="
echo "Cleaning up dangling images and build cache."
echo "============================================="
docker image prune -f
docker builder prune -f

# ── Tag and push to ECR ───────────────────────────────────────────────────────
echo ""
echo "→ Tagging and pushing images to ECR..."
for name in "${selected[@]}"; do
  # Skip anything that failed even after retry
  if printf '%s\n' "${failed[@]}" | grep -qx "$name"; then
    echo "⏭  Skipping push for failed image: $name"
    continue
  fi

  docker tag "$name" "${ECR_REGISTRY}:${name}"
  docker push "${ECR_REGISTRY}:${name}"
  echo "→ Pushed $name"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') — build_browsers.sh DONE" | tee -a "$LOG_FILE"
if (( ${#failed[@]} > 0 )); then
  echo "⚠  Failed images: ${failed[*]}" | tee -a "$LOG_FILE"
  exit 1
fi
echo "All images built and pushed successfully."
