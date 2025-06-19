#!/usr/bin/env bash

set -ex

# Change to the home directory
cd ~/

# Download and extract Pulse Browser
wget -q "https://github.com/pulse-browser/browser/releases/download/1.0.0-a.87/pulse-browser.linux.tar.bz2" -O pulse-browser.linux.tar.bz2
tar -xvf pulse-browser.linux.tar.bz2 -C ~/
sudo rm -f pulse-browser.linux.tar.bz2

# Create a desktop entry for Pulse Browser
cat <<EOF > ~/pulse.desktop
[Desktop Entry]
Version=1.0
StartupWMClass=zen
Icon=/usr/lib/pulse-browser/browser/chrome/icons/default/default48.png
Type=Application
Categories=Network;WebBrowser;
Exec=/usr/lib/pulse-browser/pulse-browser %u
Name=Pulse Browser
Comment=experimental forked firefox based browser
Terminal=false
StartupNotify=true
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/qute;
Keywords=Browser;
EOF

sudo mv ~/pulse.desktop /usr/share/applications/

# Create a symbolic link for easy launching of Pulse Browser
sudo ln -sf ${HOME}/pulse-browser/pulse-browser /usr/bin/startpulse

if [ -z ${SKIP_CLEAN+x} ]; then
  apt-get autoclean
  rm -rf \
    /var/lib/apt/lists/* \
    /var/tmp/*
fi

# Cleanup for app layer
chown -R 1000:0 $HOME