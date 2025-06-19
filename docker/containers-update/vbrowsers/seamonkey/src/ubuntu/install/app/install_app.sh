#!/usr/bin/env bash

set -ex

wget -q https://archive.seamonkey-project.org/releases/2.53.20/linux-x86_64/en-US/seamonkey-2.53.20.en-US.linux-x86_64.tar.bz2 -O seamonkey.tar.bz2
sudo tar -xvf seamonkey.tar.bz2 -C /usr/lib
sudo rm -f seamonkey.tar.bz2

cat <<EOF > /tmp/seamonkey.desktop
[Desktop Entry]
Version=1.0
StartupWMClass=seamonkey
Icon=/usr/lib/seamonkey/browser/chrome/icons/default/default48.png
Type=Application
Categories=Network;WebBrowser;
Exec=/usr/lib/seamonkey/seamonkey %u
Name=Seamonkey
Comment=Seamonkey Browser
Terminal=false
StartupNotify=true
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/qute;
Keywords=Browser;
EOF

sudo mv /tmp/seamonkey.desktop /usr/share/applications/seamonkey.desktop

# Create a symbolic link for easy launching of SeaMonkey
sudo ln -sf /usr/lib/seamonkey/seamonkey /usr/bin/startseamonkey

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME