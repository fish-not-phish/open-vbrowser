#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE=".env"

# Directories for image selection
CONTAINERS_DIR="../docker/containers-update"
VBROWSERS_DIR="$CONTAINERS_DIR/vbrowsers"
UNUSED_DIR="$CONTAINERS_DIR/unused"

# Default browser images
default_images=(chrome terminal remnux mullvad tor)

# Ensure unused folder exists
mkdir -p "$UNUSED_DIR"

# Prompt to choose default or custom images
echo "Default images: ${default_images[*]}"
read -p "Use default images? [Y/n]: " use_default
use_default=${use_default:-Y}

if [[ "$use_default" =~ ^[Yy]$ ]]; then
  selected_images=("${default_images[@]}")
else
  read -p "Enter desired image names (comma-separated): " input_list
  # Split input by comma and trim whitespace
  IFS=',' read -ra raw <<< "$input_list"
  selected_images=()
  for img in "${raw[@]}"; do
    img_trimmed=$(echo "$img" | xargs)
    [[ -n "$img_trimmed" ]] && selected_images+=("$img_trimmed")
  done
fi

echo "Selected images: ${selected_images[*]}"

# Restore any selected images from 'unused/' back into 'vbrowsers/'
for img in "${selected_images[@]}"; do
  if [[ -d "$UNUSED_DIR/$img" ]]; then
    echo "Restoring '$img' from unused → vbrowsers/"
    mv -f "$UNUSED_DIR/$img" "$VBROWSERS_DIR/"
  fi
done

# Move truly unused images out of vbrowsers/ into unused/
for dir in "$VBROWSERS_DIR"/*; do
  img_name=$(basename "$dir")
  # Skip non-directories
  [[ -d "$dir" ]] || continue

  # If img_name not in selected_images, move it
  if [[ ! " ${selected_images[@]} " =~ " $img_name " ]]; then
    echo "Moving unused image '$img_name' → $UNUSED_DIR/"
    mv -f "$dir" "$UNUSED_DIR/"
  fi
done

# Generate Terraform variables for selected images
echo "Updating terraform.tfvars with selected images..."
docker_images_var="docker_images = ["
for img in "${selected_images[@]}"; do
  docker_images_var="$docker_images_var\n  \"$img\","
done
docker_images_var="$docker_images_var\n]"

# Update the docker_images variable in terraform.tfvars
if [[ -f "terraform.tfvars" ]]; then
  echo "→ Replacing docker_images in terraform.tfvars"
  TMP_FILE=$(mktemp)

  awk '
    BEGIN {in_block=0}
    /^docker_images = \[/ {in_block=1; print "docker_images = ["; next}
    in_block && /^\]/ {
      in_block=0;
      # Insert selected images from ENV
      while ((getline img < "/dev/stdin") > 0) print "  \"" img "\","; 
      print "]"; next
    }
    !in_block {print}
  ' terraform.tfvars <<< "$(printf '%s\n' "${selected_images[@]}")" > "$TMP_FILE"

  mv "$TMP_FILE" terraform.tfvars
else
  echo "Warning: terraform.tfvars not found. Using default values."
fi

SECRET_KEY=$( \
  openssl rand -base64 64 | tr -d '/+=' | cut -c1-50 \
)

# Variables the script will prompt for
vars=(
  DEBUG
  CUSTOM_DOMAIN
  DB_NAME
  DB_USER
  DB_PASSWORD
  DB_HOST
  DB_PORT
  REDIS_URL
  LOGGER_ENABLED
  DEFAULT_IDLE_THRESHOLD
  DJANGO_SUPERUSER_USERNAME
  DJANGO_SUPERUSER_EMAIL
  DJANGO_SUPERUSER_PASSWORD
  CF_Zone_ID
  CF_Token
  AWS_DEFAULT_REGION
)

# Default values
declare -A defaults=(
  [DEBUG]="False"
  [CUSTOM_DOMAIN]="domain.tld"
  [DB_NAME]="vbrowserdb"
  [DB_USER]="admin"
  [DB_PASSWORD]="adminpass"
  [DB_HOST]="postgres"
  [DB_PORT]="5432"
  [REDIS_URL]="redis://redis:6379/0"
  [LOGGER_ENABLED]="False"
  [DEFAULT_IDLE_THRESHOLD]="10"
  [DJANGO_SUPERUSER_USERNAME]="admin"
  [DJANGO_SUPERUSER_EMAIL]="admin@domain.tld"
  [DJANGO_SUPERUSER_PASSWORD]="SuperSecretPassword123!"
  [CF_Zone_ID]="xxxx"
  [CF_Token]="xxxx"
  [AWS_DEFAULT_REGION]="us-east-1"
)

# Start fresh
: > "$ENV_FILE"
echo "Generating $ENV_FILE..."

echo "SECRET_KEY=${SECRET_KEY}" >> "$ENV_FILE"

# Track values for reuse
CUSTOM_DOMAIN_VALUE=""
DJANGO_SUPERUSER_EMAIL_VALUE=""
AWS_DEFAULT_REGION_VALUE=""

# Prompt loop
for key in "${vars[@]}"; do
  default="${defaults[$key]}"
  read -p "Enter ${key} [${default}]: " input
  value="${input:-$default}"
  echo "${key}=${value}" >> "$ENV_FILE"

  if [ "$key" = "CUSTOM_DOMAIN" ]; then
    CUSTOM_DOMAIN_VALUE="$value"
  elif [ "$key" = "DJANGO_SUPERUSER_EMAIL" ]; then
    DJANGO_SUPERUSER_EMAIL_VALUE="$value"
  elif [ "$key" = "AWS_DEFAULT_REGION" ]; then
    AWS_DEFAULT_REGION_VALUE="$value"
    export AWS_DEFAULT_REGION="$value"
  fi
done

# Auto-generated entries
echo "ALLOWED_HOSTS=${CUSTOM_DOMAIN_VALUE},api.${CUSTOM_DOMAIN_VALUE}" >> "$ENV_FILE"
echo "USER_EMAIL=${DJANGO_SUPERUSER_EMAIL_VALUE}" >> "$ENV_FILE"
echo "AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION_VALUE}" >> "$ENV_FILE"

echo ""
echo "✅  $ENV_FILE created with these contents:"
sed -e 's/^/   /' "$ENV_FILE"
echo ""

# Update terraform.tfvars with AWS region
if [[ -f "terraform.tfvars" ]]; then
  sed -i "s/^aws_region = .*/aws_region = \"${AWS_DEFAULT_REGION_VALUE}\"/" terraform.tfvars
  echo "→ Updated aws_region in terraform.tfvars"
fi

# Initialize and apply Terraform
echo "🚀 Initializing Terraform..."
terraform init

echo "🏗️  Applying Terraform configuration..."
terraform apply -auto-approve

# Remove empty lines from .env
sed -i '/^[[:space:]]*$/d' "$ENV_FILE"

# Copy .env into the docker-related folders
for dest in "../django" "../docker/containers-update" "../docker/vbrowser-stack"; do
  if [ -d "$dest" ]; then
    cp -f "$ENV_FILE" "$dest/.env"
    echo "📦  Copied $ENV_FILE → $dest/.env"
  else
    echo "⚠️  Directory '$dest' not found; skipping copy."
  fi
done

# Build Docker image in ../django
if [ -d "../django" ]; then
  echo ""
  echo "🚧  Building 'vbrowser' image in ../django..."
  pushd ../django >/dev/null
    docker build -t vbrowser .
  popd >/dev/null
else
  echo "⚠️  ../django not found; skipping vbrowser build."
fi

# Build Docker image in ../docker/containers-update
if [ -d "../docker/containers-update" ]; then
  echo ""
  echo "🚧  Building 'containers-update' image in ../docker/containers-update..."
  pushd ../docker/containers-update >/dev/null
    docker build -t containers-updater .
  popd >/dev/null
else
  echo "⚠️  ../docker/containers-update not found; skipping containers-update build."
fi

echo -e "\n🚀  Starting Docker Compose stacks…"
for stack in "containers-update" "vbrowser-stack"; do
  STACK_DIR="$BASE_DIR/docker/$stack"
  if [ -d "$STACK_DIR" ]; then
    echo "   • $stack → running docker compose up -d"
    pushd "$STACK_DIR" >/dev/null
      docker compose up -d
    popd >/dev/null
  else
    echo "⚠️  Stack directory not found: $STACK_DIR"
  fi
done

echo -e "\n🎉  All done! Your services are up and running.\n"