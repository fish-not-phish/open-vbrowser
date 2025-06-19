#!/bin/bash

set -euo pipefail

cron

# require these env vars to be set (even if empty)
: "${CUSTOM_DOMAIN?}"
: "${DEFAULT_IDLE_THRESHOLD?}"
: "${USER_EMAIL?}"
: "${CF_Zone_ID?}"
: "${CF_Token?}"

for dir in /vbrowsers/*; do
  [[ -d $dir ]] || continue
  file="$dir/1-app.sh"
  [[ -f $file ]] || continue

  echo "Updating $file …"
  sed -i \
    -e "s|^export CF_API_TOKEN=.*|export CF_API_TOKEN=\"${CF_Token}\"|" \
    -e "s|^export CF_ZONE_ID=.*|export CF_ZONE_ID=\"${CF_Zone_ID}\"|" \
    -e "s|^export CUSTOM_DOMAIN=.*|export CUSTOM_DOMAIN=\"${CUSTOM_DOMAIN}\"|" \
    -e "s|^export DEFAULT_IDLE_THRESHOLD=.*|export DEFAULT_IDLE_THRESHOLD=\"${DEFAULT_IDLE_THRESHOLD}\"|" \
    -e "s|^export USER_EMAIL=.*|export USER_EMAIL=\"${USER_EMAIL}\"|" \
    "$file"
done

for dir in /vbrowsers/*; do
  [[ -d $dir ]] || continue
  file="$dir/functions.js"
  [[ -f $file ]] || continue

  # convert minutes → seconds
  threshold_sec=$(( DEFAULT_IDLE_THRESHOLD * 60 ))

  echo "Updating $file …"
  sed -i \
    -e "s|{{CUSTOM_DOMAIN}}|${CUSTOM_DOMAIN}|g" \
    -e "s|{{DEFAULT_IDLE_THRESHOLD}}|${threshold_sec}|g" \
    "$file"
done

automated_file=/automated/update.sh
sed -i \
    -e "s|{{CUSTOM_DOMAIN}}|${CUSTOM_DOMAIN}|g" \
    -e "s|{{USER_EMAIL}}|${USER_EMAIL}|g" \
    "$automated_file"

bash /automated/update.sh
cd /terraform
bash generate_images.sh
echo "All done."
sleep infinity