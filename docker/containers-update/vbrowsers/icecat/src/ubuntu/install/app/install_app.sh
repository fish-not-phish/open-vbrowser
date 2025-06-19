#!/usr/bin/env bash

set -ex

# Change to the home directory
cd ~/

# Download and extract the Icecat tarball
wget -q -O icecat.tar.bz2 "https://icecatbrowser.org/assets/icecat/115.18.0/icecat-115.18.0.en-US.linux-x86_64.tar.bz2"
sudo tar -xvf icecat.tar.bz2 -C ~/
sudo rm -f icecat.tar.bz2

# Create a desktop entry for Icecat
cat <<EOF > ~/icecat.desktop
[Desktop Entry]
Version=1.0
StartupWMClass=icecat
Icon=~/icecat/browser/chrome/icons/default/default48.png
Type=Application
Categories=Network;WebBrowser;
Exec=~/icecat/icecat %u
Name=Icecat 
Comment=Icecat browser
Terminal=false
StartupNotify=true
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/qute;
Keywords=Browser;
EOF

sudo mv ~/icecat.desktop /usr/share/applications/icecat.desktop

# Create a symbolic link for easy launching of Icecat
sudo ln -sf ${HOME}/icecat/icecat /usr/bin/starticecat

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME