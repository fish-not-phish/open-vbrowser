#!/usr/bin/env bash
# build_browsers.sh — Stamp secrets into each browser's 1-app.sh, build the
# Docker image, push it to ECR, then prune old ECR manifests.
#
# Usage:
#   ./build_browsers.sh                  # build every image under vbrowsers/
#   ./build_browsers.sh chrome mullvad   # build specific images only
#
# Reads from ../.env automatically if it exists. Required env vars:
#   ECR_REGISTRY, AWS_REGION (or AWS_DEFAULT_REGION)
#   CF_Token, CF_Zone_ID, CUSTOM_DOMAIN
#   DEFAULT_IDLE_THRESHOLD (minutes)
#   USER_EMAIL (or DJANGO_SUPERUSER_EMAIL as fallback)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VBROWSERS_DIR="$SCRIPT_DIR/vbrowsers"
ENV_FILE="$SCRIPT_DIR/.env"
LOG_FILE="$SCRIPT_DIR/build_browsers.log"
ECR_REPO="ovb-browsers"

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
: "${CF_Token:?CF_Token is not set}"
: "${CF_Zone_ID:?CF_Zone_ID is not set}"
: "${CUSTOM_DOMAIN:?CUSTOM_DOMAIN is not set}"
: "${DEFAULT_IDLE_THRESHOLD:?DEFAULT_IDLE_THRESHOLD is not set}"
: "${USER_EMAIL:?USER_EMAIL (or DJANGO_SUPERUSER_EMAIL) is not set}"

# ── Which images to build ─────────────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  # Specific images passed as arguments
  selected=("$@")
else
  # Build everything present in vbrowsers/
  selected=()
  for subdir in "$VBROWSERS_DIR"/*/; do
    [[ -d "$subdir" ]] || continue
    name=$(basename "$subdir")
    [[ "$name" == .* ]] && continue
    selected+=("$name")
  done
fi

touch "$LOG_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') — build_browsers.sh START [${selected[*]}]" | tee -a "$LOG_FILE"

# ── Stamp secrets into every 1-app.sh ────────────────────────────────────────
# This mirrors what update_containers.sh did. We work on the checked-in files
# directly so the Dockerfile COPY picks them up correctly.
echo ""
echo "→ Stamping secrets into 1-app.sh files..."
for name in "${selected[@]}"; do
  dir="$VBROWSERS_DIR/$name"
  file="$dir/1-app.sh"
  [[ -d "$dir" ]] || { echo "⚠  No directory for '$name' — skipping."; continue; }
  [[ -f "$file" ]] || { echo "⚠  No 1-app.sh for '$name' — skipping."; continue; }

  sed -i \
    -e "s|^export CF_API_TOKEN=.*|export CF_API_TOKEN=\"${CF_Token}\"|" \
    -e "s|^export CF_ZONE_ID=.*|export CF_ZONE_ID=\"${CF_Zone_ID}\"|" \
    -e "s|^export CUSTOM_DOMAIN=.*|export CUSTOM_DOMAIN=\"${CUSTOM_DOMAIN}\"|" \
    -e "s|^export DEFAULT_IDLE_THRESHOLD=.*|export DEFAULT_IDLE_THRESHOLD=\"${DEFAULT_IDLE_THRESHOLD}\"|" \
    -e "s|^export USER_EMAIL=.*|export USER_EMAIL=\"${USER_EMAIL}\"|" \
    "$file"

  echo "  ✓ $name"
done

# ── ECR login ─────────────────────────────────────────────────────────────────
echo ""
echo "→ Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
echo "→ Docker login succeeded."

# ── Build each image ──────────────────────────────────────────────────────────
failed=()

for name in "${selected[@]}"; do
  subdir="$VBROWSERS_DIR/$name"
  [[ -d "$subdir" ]] || continue
  [[ "$name" == .* ]] && continue

  echo ""
  echo "===================="
  echo "Building '$name'..."
  echo "===================="

  (
    cd "$subdir"
    docker build --no-cache --build-arg CACHEBUST="$(date +%s)" -t "$name" .
  )
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
    (
      cd "$VBROWSERS_DIR/$name"
      docker build --no-cache --build-arg CACHEBUST="$(date +%s)" -t "$name" .
    )
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
  [[ -d "$VBROWSERS_DIR/$name" ]] || continue
  # Skip anything that failed even after retry
  if printf '%s\n' "${failed[@]}" | grep -qx "$name"; then
    echo "⏭  Skipping push for failed image: $name"
    continue
  fi

  docker tag "$name" "${ECR_REGISTRY}:${name}"
  docker push "${ECR_REGISTRY}:${name}"
  echo "→ Pushed $name"
done

# ── Prune ECR images older than 2 days ───────────────────────────────────────
echo ""
echo "→ Pruning ECR images older than 2 days..."
cutoff_iso=$(date -u -d '2 days ago' +'%Y-%m-%dT%H:%M:%SZ')

old_digests=$(aws ecr describe-images \
  --repository-name "$ECR_REPO" \
  --region "$AWS_REGION" \
  --query "imageDetails[?imagePushedAt<'$cutoff_iso'].imageDigest" \
  --output text 2>/dev/null || true)

if [[ -n "$old_digests" ]]; then
  read -r -a all_digests <<< "$old_digests"
  total=${#all_digests[@]}
  echo "→ Found $total manifest(s) older than 2 days. Deleting in batches of 100..."

  for (( i=0; i<total; i+=100 )); do
    chunk=( "${all_digests[@]:i:100}" )
    image_ids=()
    for digest in "${chunk[@]}"; do
      image_ids+=(imageDigest="$digest")
    done
    aws ecr batch-delete-image \
      --repository-name "$ECR_REPO" \
      --region "$AWS_REGION" \
      --image-ids "${image_ids[@]}" \
      --output text 2>&1 || echo "  ⚠  batch-delete-image failed for this chunk (non-fatal)"
  done
  echo "→ Done."
else
  echo "→ No old manifests found."
fi

# ── Scrub secrets from 1-app.sh files ────────────────────────────────────────
# Reset the three credential lines back to placeholder values so real secrets
# are never left sitting in source-controlled files after a build.
echo ""
echo "→ Scrubbing secrets from 1-app.sh files..."
for name in "${selected[@]}"; do
  file="$VBROWSERS_DIR/$name/1-app.sh"
  [[ -f "$file" ]] || continue
  sed -i \
    -e 's|^export CF_API_TOKEN=.*|export CF_API_TOKEN="CF_API_TOKEN"|' \
    -e 's|^export CF_ZONE_ID=.*|export CF_ZONE_ID="CF_ZONE_ID"|' \
    -e 's|^export CUSTOM_DOMAIN=.*|export CUSTOM_DOMAIN="CUSTOM_DOMAIN"|' \
    -e 's|^export DEFAULT_IDLE_THRESHOLD=.*|export DEFAULT_IDLE_THRESHOLD="DEFAULT_IDLE_THRESHOLD"|' \
    -e 's|^export USER_EMAIL=.*|export USER_EMAIL="USER_EMAIL"|' \
    "$file"
  echo "  ✓ $name"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "$(date '+%Y-%m-%d %H:%M:%S') — build_browsers.sh DONE" | tee -a "$LOG_FILE"
if (( ${#failed[@]} > 0 )); then
  echo "⚠  Failed images: ${failed[*]}" | tee -a "$LOG_FILE"
  exit 1
fi
echo "All images built and pushed successfully."
