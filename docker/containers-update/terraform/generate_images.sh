#!/bin/bash
set -euo pipefail

images=()
for dir in /vbrowsers/*; do
  [[ -d $dir ]] || continue
  images+=( "$(basename "$dir")" )
done

images_json=$(printf '"%s",' "${images[@]}" | sed 's/,$//')

cat > images.auto.tfvars.json <<EOF
{
  "docker_images": [${images_json}],
  "ecr_registry": "${ECR_REGISTRY}"
}
EOF

echo "→ images.auto.tfvars.json created with ${#images[@]} images."

terraform init
terraform apply -auto-approve
