#!/usr/bin/env bash

set -ex

FLOORP_VERSION="11.27.0"
FLOORP_URL="https://github.com/Floorp-Projects/Floorp/releases/latest/download/floorp-${FLOORP_VERSION}.linux-x86_64.tar.bz2"

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