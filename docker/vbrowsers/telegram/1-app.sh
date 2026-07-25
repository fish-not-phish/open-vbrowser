#!/bin/bash

set -e
set -u

export CF_API_TOKEN="CF_API_TOKEN"
export CF_ZONE_ID="CF_ZONE_ID"
export CUSTOM_DOMAIN="CUSTOM_DOMAIN"

# Bypass any proxy configured by mitmproxy (init-selkies-config writes
# /config/.curlrc and sets http_proxy env vars before s6 longruns start,
# so mitmproxy is not yet listening when this script runs).
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY

# ── Failure handler ──────────────────────────────────────────────────────────
notify_failure() {
  local exit_code=$?
  local line=$1
  echo "[1-app] FAILED at line $line with exit code $exit_code"

  if [ -n "${UUID:-}" ] && [ -n "${SESSION_TOKEN:-}" ]; then
    echo "[1-app] Notifying backend to close session $UUID..."
    curl -s --noproxy "*" --max-time 10 -X POST \
      "https://${CUSTOM_DOMAIN}/api/v1/sessions/${UUID}/close/?session_token=${SESSION_TOKEN}" \
      || echo "[1-app] Warning: failed to notify backend (curl error $?)"
    echo "[1-app] Backend notified."
  else
    echo "[1-app] UUID or SESSION_TOKEN not set — cannot notify backend."
  fi

  exit $exit_code
}

trap 'notify_failure $LINENO' ERR

# ── Startup ──────────────────────────────────────────────────────────────────

echo "Starting script execution."

echo "Checking required environment variables..."
if [ -z "${UUID:-}" ]; then
  echo "UUID is not set."
  exit 1
fi
if [ -z "${SESSION_TOKEN:-}" ]; then
  echo "SESSION_TOKEN is not set."
  exit 1
fi
echo "Environment variables are set."

echo "Saving UUID variable to /config/environment..."
# echo "UUID=$UUID" >> /config/environment
echo "UUID variable saved."

echo "Generating random string based on UUID..."
RANDOM_STRING=$(echo "$UUID" | md5sum | cut -d' ' -f1)
echo "Generated random string: $RANDOM_STRING"

DOMAIN="browser-$RANDOM_STRING.$CUSTOM_DOMAIN"
echo "Generated domain name: $DOMAIN"

# ── Public IP ────────────────────────────────────────────────────────────────

echo "Fetching public IP address..."
echo "  [net] routes:"
ip route show 2>/dev/null || echo "  [net] ip route failed"
echo "  [net] DNS:"
cat /etc/resolv.conf 2>/dev/null || echo "  [net] resolv.conf unreadable"

set +e
CURL_OUT=$(curl -s --noproxy "*" --max-time 10 http://checkip.amazonaws.com 2>&1)
CURL_EXIT=$?
set -e

echo "  [curl] exit code: $CURL_EXIT"
echo "  [curl] output: $CURL_OUT"

if [ $CURL_EXIT -ne 0 ]; then
  echo "curl failed with exit $CURL_EXIT — cannot determine public IP."
  exit $CURL_EXIT
fi

PUBLIC_IP=$(echo "$CURL_OUT" | tr -d '[:space:]')
if [ -z "$PUBLIC_IP" ]; then
  echo "Public IP response was empty."
  exit 1
fi
echo "Public IP address: $PUBLIC_IP"

# ── Cloudflare DNS upsert ────────────────────────────────────────────────────

CF_API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"

echo "Looking up existing Cloudflare DNS record for $DOMAIN..."
CF_LOOKUP=$(curl -s --noproxy "*" --max-time 10 -X GET "${CF_API}?type=A&name=${DOMAIN}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json")
echo "  [cf lookup] response: $CF_LOOKUP"

RECORD_ID=$(echo "$CF_LOOKUP" | jq -r '.result[0].id // empty')

if [ -z "$RECORD_ID" ]; then
  echo "No existing record found. Creating new A record..."
  CF_RESP=$(curl -s --noproxy "*" --max-time 10 -X POST "${CF_API}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{
      "type":"A",
      "name":"'"${DOMAIN}"'",
      "content":"'"${PUBLIC_IP}"'",
      "ttl":300,
      "proxied":true
    }')
  echo "  [cf create] response: $CF_RESP"
else
  echo "Updating existing record (ID: $RECORD_ID)..."
  CF_RESP=$(curl -s --noproxy "*" --max-time 10 -X PUT "${CF_API}/${RECORD_ID}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{
      "type":"A",
      "name":"'"${DOMAIN}"'",
      "content":"'"${PUBLIC_IP}"'",
      "ttl":300,
      "proxied":true
    }')
  echo "  [cf update] response: $CF_RESP"
fi

echo "Cloudflare DNS record upsert complete for $DOMAIN ($PUBLIC_IP)."
echo "Script execution completed."
