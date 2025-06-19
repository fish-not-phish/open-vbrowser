#!/bin/bash

# nginx Path
NGINX_CONFIG=/etc/nginx/conf.d/default.conf

UUID="${UUID}"
echo "got UUID"
echo "$UUID"

sed -i "s|{{UUID}}|$UUID|g" $NGINX_CONFIG

