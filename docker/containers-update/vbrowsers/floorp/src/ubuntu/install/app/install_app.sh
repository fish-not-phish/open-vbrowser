#!/usr/bin/env bash

set -ex

REPO="Floorp-Projects/Floorp"
ASSET_REGEX='(?i)linux.*(x86_64|amd64).*\.(tar\.bz2|tbz2)$'   # case-insensitive match
PER_PAGE=20
MAX_PAGES=5
API_BASE="https://api.github.com/repos/${REPO}/releases"

PRINT_MODE="${1:-}"  # --print-exports | --print-fish | empty

command -v jq >/dev/null 2>&1 || { echo "jq is required (apt-get install -y jq)" >&2; exit 1; }

FLOORP_VERSION=""
FLOORP_URL=""
ASSET_NAME=""

# 1) Try /releases/latest (non-prerelease)
if JSON="$(curl -fsSL "${API_BASE}/latest")"; then
  readarray -t hits < <(jq -r --arg re "$ASSET_REGEX" '
    .assets[]? | select(.name|test($re)) |
    [.name, .browser_download_url] | @tsv
  ' <<<"$JSON")
  if ((${#hits[@]} > 0)); then
    TAG_RAW="$(jq -r '.tag_name' <<<"$JSON")"
    FLOORP_VERSION="${TAG_RAW#v}"
    ASSET_NAME="$(cut -f1 <<<"${hits[0]}")"
    FLOORP_URL="$(cut -f2 <<<"${hits[0]}")"
  fi
fi

# 2) If not found, walk back through /releases pages (includes prereleases)
page=1
while [[ -z "$FLOORP_URL" && $page -le $MAX_PAGES ]]; do
  JSON="$(curl -fsSL "${API_BASE}?per_page=${PER_PAGE}&page=${page}")"
  while IFS=$'\t' read -r tag url name; do
    if [[ -n "$tag" && -n "$url" ]]; then
      FLOORP_VERSION="${tag#v}"
      FLOORP_URL="$url"
      ASSET_NAME="$name"
      break
    fi
  done < <(jq -r --arg re "$ASSET_REGEX" '
      .[] |
      . as $rel |
      ($rel.assets[]? | select(.name|test($re)) |
        [$rel.tag_name, .browser_download_url, .name] | @tsv)
    ' <<<"$JSON")
  (( page++ ))
done

if [[ -z "$FLOORP_URL" ]]; then
  echo "❌ Could not find a Linux x86_64 .tar.bz2 asset in the last $MAX_PAGES pages of releases." >&2
  exit 1
fi

echo "✅ Found Floorp ${FLOORP_VERSION}"
echo "Asset: ${ASSET_NAME}"
echo "URL  : ${FLOORP_URL}"

wget -q -O /tmp/floorp.tar.bz2 "${FLOORP_URL}"
mkdir -p /usr/lib/floorp
tar -xvf /tmp/floorp.tar.bz2 -C /usr/lib/floorp --strip-components=1
rm /tmp/floorp.tar.bz2

# Create a symbolic link for easy launching of Floorp
ln -sf /usr/lib/floorp/floorp /usr/bin/startfloorp

# Create a desktop entry for Floorp
cat <<EOF > /tmp/floorp.desktop
[Desktop Entry]
Version=1.0
Name=Floorp
Comment=Firefox-based Browser
Exec=/usr/lib/floorp/floorp %u
Icon=/usr/lib/floorp/browser/chrome/icons/default/default48.png
Terminal=false
Type=Application
Categories=Network;WebBrowser;
StartupWMClass=floorp
EOF

# Move the desktop entry to the system applications directory
mv /tmp/floorp.desktop /usr/share/applications/floorp.desktop

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME