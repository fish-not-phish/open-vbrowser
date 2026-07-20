#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e
# Treat unset variables as an error.
set -u

export CF_API_TOKEN="CF_API_TOKEN"
export CF_ZONE_ID="CF_ZONE_ID"
export CUSTOM_DOMAIN="CUSTOM_DOMAIN"

echo "Starting script execution."

# Check if required environment variables are set
echo "Checking required environment variables..."
if [ -z "${UUID:-}" ]; then
  echo "Required environment variables are not set."
  exit 1
fi
echo "Environment variables are set."

echo "Saving UUID variable to /config/environment..."
# echo "UUID=$UUID" >> /config/environment
echo "UUID variable saved."

# Generate a random string based on the UUID
echo "Generating random string based on UUID..."
if [ -n "$UUID" ]; then
  RANDOM_STRING=$(echo "$UUID" | md5sum | cut -d' ' -f1)
  echo "Generated random string: $RANDOM_STRING"
else
  echo "UUID is empty. Exiting."
  exit 0
fi

DOMAIN="browser-$RANDOM_STRING.$CUSTOM_DOMAIN"
echo "Generated domain name: $DOMAIN"

# Fetch the public IP address of the host machine
echo "Fetching public IP address..."
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com)
echo "Public IP address: $PUBLIC_IP"

if [ -z "$PUBLIC_IP" ]; then
  echo "Failed to retrieve public IP address. Exiting."
  exit 1
fi

echo "$PUBLIC_IP"

CF_API="https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records"

RECORD_ID=$(curl -s -X GET "${CF_API}?type=A&name=${DOMAIN}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  | jq -r '.result[0].id // empty')

if [ -z "$RECORD_ID" ]; then
  echo "No existing record found. Creating new A record..."
  curl -s -X POST "${CF_API}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{
      "type":"A",
      "name":"'"${DOMAIN}"'",
      "content":"'"${PUBLIC_IP}"'",
      "ttl":300,
      "proxied":true
    }'
else
  echo "Updating existing record (ID: $RECORD_ID)..."
  curl -s -X PUT "${CF_API}/${RECORD_ID}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{
      "type":"A",
      "name":"'"${DOMAIN}"'",
      "content":"'"${PUBLIC_IP}"'",
      "ttl":300,
      "proxied":true
    }'
fi

echo "Cloudflare DNS record upsert complete for $DOMAIN ($PUBLIC_IP)."

echo "Script execution completed."
