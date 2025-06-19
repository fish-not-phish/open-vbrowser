#!/bin/bash
cat <<EOF >> /usr/local/share/kasmvnc/www/dist/style.bundle.css

#noVNC_transition {
    background: #fff url(https://raw.githubusercontent.com/vbrowser/logos/refs/heads/main/logo-vbrowser-transparent.svg) no-repeat fixed 50% !important;
}
EOF

cat <<EOF >> /usr/local/share/kasmvnc/www/dist/style.bundle.css

body {
    background: #fff url(https://raw.githubusercontent.com/vbrowser/logos/refs/heads/main/background.jpg) no-repeat fixed 50% !important;
}
EOF

shred -u -z -n 8 /custom-cont-init.d/1-app.sh 
