#!/bin/bash

INDEX_HTML="/usr/share/selkies/www/index.html"
CUSTOM_CSS='<link rel="stylesheet" crossorigin href="./assets/functions.css">'
CUSTOM_JS='<script type="module" crossorigin src="./assets/functions.js" defer></script>'

if grep -q "functions.css" "$INDEX_HTML"; then
  echo "[html-injector] Already injected. Skipping."
  exit 0
fi

echo "[html-injector] Injecting custom assets into index.html..."
sed -i "/<\/head>/i $CUSTOM_CSS\\n$CUSTOM_JS" "$INDEX_HTML"
