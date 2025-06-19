#!/usr/bin/env bash

set -ex

# Change to the home directory
cd ~/

# Download and extract Waterfox
wget -q -O waterfox-6.5.5.tar.bz2 "https://cdn1.waterfox.net/waterfox/releases/6.5.5/Linux_x86_64/waterfox-6.5.5.tar.bz2"
sudo tar -xvf waterfox-6.5.5.tar.bz2 -C /usr/lib
sudo rm -f waterfox-6.5.5.tar.bz2

# Create a symbolic link for easy launching of Floorp
ln -sf /usr/lib/floorp/floorp /usr/bin/startfloorp

# Create a desktop entry for Waterfox
cat <<EOF > ~/waterfox.desktop
[Desktop Entry]
Version=6.5.5
StartupWMClass=waterfox
Icon=/usr/lib/waterfox/browser/chrome/icons/default/default48.png
Type=Application
Categories=Network;WebBrowser;
Exec=/usr/lib/waterfox/waterfox %u
Name=Waterfox
Comment=Waterfox Web Browser
Terminal=false
StartupNotify=true
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/qute;
Keywords=Browser;
EOF

mv -f ~/waterfox.desktop /usr/share/applications/

# Create a symbolic link for easy launching of Waterfox
sudo ln -sf /usr/lib/waterfox/waterfox /usr/bin/startwaterfox

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME