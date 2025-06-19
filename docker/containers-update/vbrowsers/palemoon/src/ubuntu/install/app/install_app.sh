#!/usr/bin/env bash

set -ex

# Create a desktop entry for Pale Moon
cat <<EOF > ~/palemoon.desktop
[Desktop Entry]
Version=1.0
StartupWMClass=palemoon
Icon=/usr/lib/palemoon/browser/chrome/icons/default/default48.png
Type=Application
Categories=Network;WebBrowser;
Exec=/usr/lib/palemoon/palemoon %u
Name=Pale Moon
Comment=Pale Moon Web Browser
Terminal=false
StartupNotify=true
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/qute;
Keywords=Browser;
EOF

sudo mv ~/palemoon.desktop /usr/share/applications/

# Download and extract Pale Moon
wget -q https://github.com/GitXpresso/Browsers-NoVNC/releases/download/TarAndDeb/palemoon-33.5.1.linux-x86_64-gtk3.tar.xz -O palemoon.tar.xz
sudo tar -xvf palemoon.tar.xz -C ~/
sudo rm -f palemoon.tar.xz

# Create a symbolic link for easy launching of Pale Moon
sudo ln -sf ${HOME}/palemoon/palemoon /usr/bin/startpalemoon

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME