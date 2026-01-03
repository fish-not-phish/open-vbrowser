#!/usr/bin/env bash

CUSTOM_DOMAIN="{{CUSTOM_DOMAIN}}"
USER_EMAIL="{{USER_EMAIL}}"

# Path to log file for recording failures
LOG_FILE="/docker_build_failures.log"
LOG_FILE2="/automation_attempts.log"

# Array to collect any images that fail to build
failed=()

# Ensure the log file exists (touch will create it if it doesn't)
touch "$LOG_FILE"
touch "$LOG_FILE2"

echo "$(date '+%Y-%m-%d %H:%M:%S') — combined.sh START" >> "$LOG_FILE2"

# Loop over every subdirectory under /vbrowsers/
for subdir in /vbrowsers/*/; do
  if [[ -d "$subdir" ]]; then
    name=$(basename "$subdir")
    
    # Skip hidden directories (those starting with a dot)
    if [[ "$name" == .* ]]; then
      echo "⏭ Skipping hidden directory '$name'."
      continue
    fi

    echo "===================="
    echo "Building Docker image for '$name'..."
    echo "===================="

    (
      cd "$subdir" || exit 0
      docker build --no-cache --build-arg CACHEBUST=$(date +%s) -t "$name" .
    )
    rc=$?

    if [[ $rc -ne 0 ]]; then
      echo "❌ Build failed for '$name' (exit code $rc). Recording to retry later."
      failed+=("$name")
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Build failed for '$name' (exit code $rc)" >> "$LOG_FILE"
    else
      echo "✅ Successfully built '$name'."
    fi
  fi
done

# If any builds failed, retry them once
if (( ${#failed[@]} > 0 )); then
  echo
  echo "============================================"
  echo "Retrying builds for failed images..."
  echo "============================================"
  for name in "${failed[@]}"; do
    echo
    echo "🔄 Retrying build for '$name'..."
    (
      cd "/vbrowsers/$name" || continue
      docker build --no-cache --build-arg CACHEBUST=$(date +%s) -t "$name" .
    )
    rc=$?
    if [[ $rc -ne 0 ]]; then
      echo "❌ Still failed for '$name' on retry (exit code $rc)."
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Retry build failed for '$name' (exit code $rc)" >> "$LOG_FILE"
    else
      echo "✅ Successfully built '$name' on retry."
    fi
  done
fi

echo
echo "============================================="
echo "Cleaning up dangling images and build cache."
echo "============================================="

# Remove any dangling images (untagged)
docker image prune -f

# Remove build cache
docker builder prune -f

# Authenticate to ECR (docker login)
echo "→ Logging into ECR..."
aws ecr get-login-password --region "$AWS_DEFAULT_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
echo "→ Docker login succeeded."


# Tag & push each local image under /vbrowsers
cd /vbrowsers

ECR_REPO="browsers"

for dir in */; do
  # Strip trailing slash to get folder name
  name="${dir%/}"

  # Double-check: skip anything that isn’t a directory
  [[ -d "$name" ]] || continue

  if [[ "$name" == "terminal" ]]; then
    docker tag terminal \
      "${ECR_REGISTRY}:terminal"
    docker push "${ECR_REGISTRY}:terminal"
  else
    docker tag "$name" \
      "${ECR_REGISTRY}:${name}"
    docker push "${ECR_REGISTRY}:${name}"
  fi

  echo "→ Pushed ${name}"
done

# Delete images older than 2 days in the ECR repo (after pushing)
cutoff_iso=$(date -u -d '2 days ago' +'%Y-%m-%dT%H:%M:%SZ')

old_digests=$(aws ecr describe-images \
  --repository-name "$ECR_REPO" \
  --region "$AWS_DEFAULT_REGION" \
  --query "imageDetails[?imagePushedAt<'$cutoff_iso'].imageDigest" \
  --output text 2>/dev/null)

# If any digests were found, batch‐delete them in chunks of 100
if [[ -n "$old_digests" ]]; then
  # Turn the space-separated list into an array
  read -r -a all_digests <<< "$old_digests"
  total=${#all_digests[@]}

  echo "→ Found $total manifest(s) older than 2 days in ECR/$ECR_REGISTRY. Deleting in batches of 100..."

  # Loop over array in steps of 100
  for (( i=0; i<total; i+=100 )); do
    chunk=( "${all_digests[@]:i:100}" )
    image_ids=()
    for digest in "${chunk[@]}"; do
      image_ids+=(imageDigest="$digest")
    done

    echo "→ Deleting ${#chunk[@]} manifest(s) (digests $((i+1))–$((i+${#chunk[@]})))..."
    aws ecr batch-delete-image \
      --repository-name "$ECR_REPO" \
      --region "$AWS_DEFAULT_REGION" \
      --image-ids "${image_ids[@]}" \
      --output text > /dev/null 2>&1
  done

  echo "→ All old manifests deleted."
else
  echo "→ No manifests older than 2 days found in ECR/$ECR_REPO."
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Ran automous update successfully!" >> "$LOG_FILE2"