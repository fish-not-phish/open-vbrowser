#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$BASE_DIR/docker"
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR/frontend"
ENV_FILE="$DOCKER_DIR/.env"

# ── Browser image selection ───────────────────────────────────────────────────
all_images=(brave chrome edge firefox floorp kali librewolf mullvad palemoon pulse tor vivaldi waterfox zen)

echo "Available browser images: ${all_images[*]}"
read -p "Install all images? [Y/n]: " use_all
use_all=${use_all:-Y}

if [[ "$use_all" =~ ^[Yy]$ ]]; then
  selected_images=("${all_images[@]}")
else
  read -p "Enter image names to install (comma-separated, e.g. kali,mullvad,chrome): " input_list
  IFS=',' read -ra raw <<< "$input_list"
  selected_images=()
  for img in "${raw[@]}"; do
    img_trimmed=$(echo "$img" | xargs)
    [[ -n "$img_trimmed" ]] && selected_images+=("$img_trimmed")
  done
  if [[ ${#selected_images[@]} -eq 0 ]]; then
    echo "No images selected. Exiting."
    exit 1
  fi
fi

echo "Selected images: ${selected_images[*]}"

# ── Ensure terraform.tfvars exists ───────────────────────────────────────────
TFVARS="$SCRIPT_DIR/terraform.tfvars"
TFVARS_EXAMPLE="$SCRIPT_DIR/terraform.tfvars.example"
if [[ ! -f "$TFVARS" ]]; then
  if [[ -f "$TFVARS_EXAMPLE" ]]; then
    cp "$TFVARS_EXAMPLE" "$TFVARS"
    echo "→ Created terraform.tfvars from example"
  else
    echo "Error: terraform.tfvars not found and no example file to copy from." >&2
    exit 1
  fi
fi

# ── Update terraform.tfvars with selected images ──────────────────────────────
if [[ -f "$TFVARS" ]]; then
  echo "→ Replacing docker_images in terraform.tfvars"
  TMP_FILE=$(mktemp)
  awk '
    BEGIN {in_block=0}
    /^docker_images = \[/ {in_block=1; print "docker_images = ["; next}
    in_block && /^\]/ {
      in_block=0
      while ((getline img < "/dev/stdin") > 0) print "  \"" img "\","
      print "]"
      next
    }
    !in_block {print}
  ' "$TFVARS" <<< "$(printf '%s\n' "${selected_images[@]}")" > "$TMP_FILE"
  mv "$TMP_FILE" "$TFVARS"
else
  echo "Warning: terraform.tfvars not found; skipping image update."
fi

# ── Generate .env ─────────────────────────────────────────────────────────────
SECRET_KEY=$(openssl rand -base64 64 | tr -d '/+=\n\r' | cut -c1-50)

vars=(
  CUSTOM_DOMAIN DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT
  REDIS_URL
  DEFAULT_IDLE_THRESHOLD
  DJANGO_SUPERUSER_EMAIL DJANGO_SUPERUSER_PASSWORD
  CF_Zone_ID CF_Token
  AWS_REGION
)

declare -A defaults=(
  [CUSTOM_DOMAIN]="domain.tld"
  [DB_NAME]="ovb"
  [DB_USER]="ovb"
  [DB_PASSWORD]="changeme"
  [DB_HOST]="ovb_postgres"
  [DB_PORT]="5432"
  [REDIS_URL]="redis://ovb_redis:6379/0"
  [DEFAULT_IDLE_THRESHOLD]="10"
  [DJANGO_SUPERUSER_EMAIL]="admin@domain.tld"
  [DJANGO_SUPERUSER_PASSWORD]="SuperSecretPassword123!"
  [CF_Zone_ID]="xxxx"
  [CF_Token]="xxxx"
  [AWS_REGION]="us-east-1"
)

: > "$ENV_FILE"
echo "Generating $ENV_FILE..."
echo "DJANGO_SECRET_KEY=\"${SECRET_KEY}\"" >> "$ENV_FILE"
echo "DEBUG=0" >> "$ENV_FILE"
echo "DEV_MODE=0" >> "$ENV_FILE"

CUSTOM_DOMAIN_VALUE=""
DJANGO_SUPERUSER_EMAIL_VALUE=""
AWS_REGION_VALUE=""

for key in "${vars[@]}"; do
  default="${defaults[$key]}"
  read -p "Enter ${key} [${default}]: " input
  value="${input:-$default}"
  echo "${key}=${value}" >> "$ENV_FILE"

  if [[ "$key" == "CUSTOM_DOMAIN" ]]; then
    CUSTOM_DOMAIN_VALUE="$value"
  elif [[ "$key" == "DJANGO_SUPERUSER_EMAIL" ]]; then
    DJANGO_SUPERUSER_EMAIL_VALUE="$value"
  elif [[ "$key" == "AWS_REGION" ]]; then
    AWS_REGION_VALUE="$value"
    export AWS_DEFAULT_REGION="$value"   # Terraform SDK reads AWS_DEFAULT_REGION
  fi
done

# Derived vars
echo "ALLOWED_HOSTS=${CUSTOM_DOMAIN_VALUE},api.${CUSTOM_DOMAIN_VALUE}" >> "$ENV_FILE"
echo "NEXT_PUBLIC_BASE_URL=https://${CUSTOM_DOMAIN_VALUE}/api/" >> "$ENV_FILE"
echo "NEXT_PUBLIC_BASE_URL_ACCOUNTS=https://${CUSTOM_DOMAIN_VALUE}/" >> "$ENV_FILE"
echo 'APP_NAME="Open vBrowser"' >> "$ENV_FILE"
echo "EMAIL_ENABLED=0" >> "$ENV_FILE"
echo "SECURE_SSL_REDIRECT=1" >> "$ENV_FILE"
echo "SESSION_COOKIE_SECURE=1" >> "$ENV_FILE"
echo "CSRF_COOKIE_SECURE=1" >> "$ENV_FILE"
echo "LOGGER_ENABLED=0" >> "$ENV_FILE"
echo "TIME_ZONE=UTC" >> "$ENV_FILE"
echo "VBROWSERS_PATH=/app/vbrowsers" >> "$ENV_FILE"
echo "FARGATE_VCPU_PER_HOUR_USD=0.04048" >> "$ENV_FILE"
echo "FARGATE_MEMORY_GB_PER_HOUR_USD=0.004445" >> "$ENV_FILE"
echo "FARGATE_SPOT_DISCOUNT=0.70" >> "$ENV_FILE"

# AWS vars will be appended by Terraform after apply (ECR_REGISTRY, SUBNET_ID, etc.)

sed -i '/^[[:space:]]*$/d' "$ENV_FILE"

echo ""
echo "✅  $ENV_FILE created:"
sed 's/^/   /' "$ENV_FILE"
echo ""

# ── Update aws_region in terraform.tfvars ─────────────────────────────────────
if [[ -f "$TFVARS" ]]; then
  sed -i "s/^aws_region[[:space:]]*=.*/aws_region = \"${AWS_REGION_VALUE}\"/" "$TFVARS"
  echo "→ Updated aws_region in terraform.tfvars"
fi

# ── Terraform init + apply ────────────────────────────────────────────────────
echo "🚀 Initializing Terraform..."
terraform -chdir="$SCRIPT_DIR" init

echo "🏗️  Applying Terraform configuration..."
terraform -chdir="$SCRIPT_DIR" apply -auto-approve

# At this point main.tf (local_file.env_append) has written ECR_REGISTRY, SUBNET_ID, etc. to $ENV_FILE

# ── Build + push browser images to ECR ───────────────────────────────────────
echo ""
echo "🚧  Building and pushing browser images to ECR..."
# build_browsers.sh reads AWS_REGION, ECR_REGISTRY, CF_Token, CF_Zone_ID,
# CUSTOM_DOMAIN, DEFAULT_IDLE_THRESHOLD, and DJANGO_SUPERUSER_EMAIL from .env.
# Pass the selected images as arguments so only chosen ones are built.
bash "$DOCKER_DIR/build_browsers.sh" "${selected_images[@]}"

# ── Build + start Docker Compose stack ───────────────────────────────────────
if [[ -f "$DOCKER_DIR/docker-compose.yml" ]]; then
  echo ""
  echo "🔨  Building backend and frontend Docker images..."
  # --no-cache ensures the latest code and migrations are baked in.
  # docker/.env is auto-loaded by Compose since it sits alongside docker-compose.yml.
  docker compose -f "$DOCKER_DIR/docker-compose.yml" build --no-cache

  echo ""
  echo "🚀  Starting Docker Compose stack..."
  docker compose -f "$DOCKER_DIR/docker-compose.yml" up -d
fi

echo -e "\n🎉  All done! Your services are up and running.\n"
