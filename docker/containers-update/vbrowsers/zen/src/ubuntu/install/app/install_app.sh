#!/usr/bin/env bash

set -ex

cd ~/

# Download and extract Zen Browser to /usr/lib
wget -q "https://github.com/zen-browser/desktop/releases/download/1.8.2b/zen.linux-x86_64.tar.xz" -O zen.linux-x86_64.tar.xz
sudo tar -xvf zen.linux-x86_64.tar.xz -C /usr/lib
sudo rm -f zen.linux-x86_64.tar.xz

# Create a desktop entry for Zen Browser
cat <<EOF > ~/zen.desktop
[Desktop Entry]
Version=1.0
StartupWMClass=zen
Icon=/usr/lib/zen/browser/chrome/icons/default/default48.png
Type=Application
Categories=Network;WebBrowser;
Exec=/usr/lib/zen/zen %u
Name=Zen browser
Comment=Zen Browser
Terminal=false
StartupNotify=true
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/qute;
Keywords=Browser;
EOF

sudo mv ~/zen.desktop /usr/share/applications/

# Create a symbolic link for easy launching of Zen Browser
sudo ln -sf /usr/lib/zen/zen /usr/bin/startzen

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME