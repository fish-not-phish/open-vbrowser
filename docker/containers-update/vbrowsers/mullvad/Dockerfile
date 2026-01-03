FROM ghcr.io/linuxserver/baseimage-kasmvnc:debianbookworm

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="vBrowser version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="vBrowser"

# title
ENV TITLE=Mullvad

ENV MULLVAD_RELEASE_GPG_KEY="A1198702FC3E0A09A9AE5B75D5A1D4F266DE8DDF"
ENV TORPROJECT_RELEASE_GPG_KEY="EF6E286DDA85EA2A4BA7DE684E2C6E8793298290"

RUN \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    dos2unix \
    curl \
    apt-transport-https \
    wget \
    ca-certificates \
    awscli \
    certbot \
    p7zip-full \
    python3 \
    python3-pip \
    python3-certbot-nginx && \
  apt-get autoclean && \
  rm -rf \
    /config/.cache \
    /var/lib/apt/lists/* \
    /var/tmp/* \
    /tmp/*

RUN \
  echo "**** add icon ****" && \
  curl -o \
    /kclient/public/icon.png \
    https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/mullvad-browser-logo.png && \
  echo "**** install build dependencies ****" && \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    make && \
  echo "**** install runtime packages ****" && \
  apt-get install -y --no-install-recommends \
    fontconfig \
    gnupg \
    ifupdown \
    iproute2 \
    iptables \
    dos2unix \
    libdbus-glib-1-2 \
    libgtk-3-0 \
    net-tools \
    wireguard \
    p7zip-full \
    python3 \
    python3-pip \
    xz-utils && \
  echo "**** install openresolv ****" && \
  OPENRESOLV_VERSION=$(curl -sX GET "https://api.github.com/repos/NetworkConfiguration/openresolv/releases/latest" \
    | jq -r '.tag_name') && \
  curl -s -o \
    /tmp/openresolv.tar.gz -L \
    "https://github.com/NetworkConfiguration/openresolv/archive/refs/tags/${OPENRESOLV_VERSION}.tar.gz" && \
  mkdir -p /tmp/openresolv && \
  tar xf \
    /tmp/openresolv.tar.gz -C \
    /tmp/openresolv --strip-components=1 && \
  cd /tmp/openresolv && \
  ./configure && \
  make && \
  make install && \
  echo "**** install mullvad browser ****" && \
  mkdir -p /app && \
  if [ -z ${MULLVAD_VERSION+x} ]; then \
    MULLVAD_VERSION=$(curl -sX GET "https://api.github.com/repos/mullvad/mullvad-browser/releases/latest" \
    | jq -r .name | awk -F ' ' '{print $3}'); \
  fi && \
  curl -s -o \
    /tmp/mullvad.tar.xz -L \
    "https://github.com/mullvad/mullvad-browser/releases/download/${MULLVAD_VERSION}/mullvad-browser-linux-x86_64-${MULLVAD_VERSION}.tar.xz" && \
  curl -s -o \
    /tmp/mullvad.tar.xz.asc -L \
    "https://github.com/mullvad/mullvad-browser/releases/download/${MULLVAD_VERSION}/mullvad-browser-linux-x86_64-${MULLVAD_VERSION}.tar.xz.asc" && \
  export GNUPGHOME="$(mktemp -d)" && \
  gpg --batch -q --recv-keys "$TORPROJECT_RELEASE_GPG_KEY" && \
  gpg --batch -q --recv-keys "$MULLVAD_RELEASE_GPG_KEY" && \
  if ! gpg --batch -q --verify "/tmp/mullvad.tar.xz.asc" "/tmp/mullvad.tar.xz"; then \
    echo "File signature mismatch"; \
    exit 1; \
  fi && \
  tar xf \
    /tmp/mullvad.tar.xz -C \
    /app --strip-components=1 && \
  mkdir /app/Data && \
  chmod 777 /app/Data && \
  find /app -perm 700 -exec chmod 755 {} + && \
  find /app -perm 600 -exec chmod 644 {} + && \
  printf "Linuxserver.io version: ${VERSION}\nBuild-date: ${BUILD_DATE}" > /build_version && \
  echo "**** cleanup ****" && \
  apt-get purge -y --autoremove \
    make && \
  rm -rf \
    /tmp/* \
    /var/lib/apt/lists/* \
    /var/tmp/*

# override noVNC index.html /usr/local/share/kasmvnc/www/index.html
RUN rm -f /usr/local/share/kasmvnc/www/index.html
COPY www-index.html /usr/local/share/kasmvnc/www/index.html

RUN dos2unix /usr/local/share/kasmvnc/www/index.html

# override kclient index.html /kclient/public/index.html
RUN rm -f /kclient/public/index.html
COPY index.html /kclient/public/index.html

RUN dos2unix /kclient/public/index.html

RUN rm -f /kclient/public/filebrowser.html

COPY filebrowser.html /kclient/public/filebrowser.html

RUN dos2unix /kclient/public/filebrowser.html

RUN rm -f /kclient/public/js/filebrowser.js

COPY filebrowser.js /kclient/public/js/filebrowser.js

RUN dos2unix /kclient/public/js/filebrowser.js

RUN rm -f /kclient/public/js/kclient.js

COPY kclient.js /kclient/public/js/kclient.js

RUN dos2unix /kclient/public/js/kclient.js

COPY functions.js /usr/local/share/kasmvnc/www/dist/functions.js

RUN dos2unix /usr/local/share/kasmvnc/www/dist/functions.js

# add applications

RUN mkdir -p /config/Desktop/
ENV HOME /config
WORKDIR $HOME
ENV DEBIAN_FRONTEND=noninteractive \
    SKIP_CLEAN=true \
    DONT_PROMPT_WSL_INSTALL="No_Prompt_please" \
    INST_DIR=$STARTUPDIR/install \
    INST_SCRIPTS="/ubuntu/install/tools/install_tools_deluxe.sh \
                  /ubuntu/install/cleanup/cleanup.sh"

# Copy install scripts
COPY ./src/ $INST_DIR

# Run installations
RUN \
  for SCRIPT in $INST_SCRIPTS; do \
    bash ${INST_DIR}${SCRIPT} || exit 1; \
  done && \
  rm -f /etc/X11/xinit/Xclients && \
  chown 1000:0 $HOME && \
  mkdir -p /config/Desktop/ && \
  chown -R 1000:0 /config/Desktop && \
  rm -Rf ${INST_DIR}

# change favicon
RUN rm -f /kclient/public/favicon.ico
COPY vbrowser-favicon.png /kclient/public/favicon.ico

RUN dos2unix /kclient/public/favicon.ico
RUN chmod 777 /kclient/public/favicon.ico

# override nginx default site with token verification /defaults/default.conf AND /etc/nginx/sites-available/
RUN rm -f /defaults/default.conf
COPY default.conf /defaults/default.conf
RUN dos2unix /defaults/default.conf

# edit nginx startup script
RUN rm -f /etc/s6-overlay/s6-rc.d/init-nginx/run
COPY run /etc/s6-overlay/s6-rc.d/init-nginx/run
RUN dos2unix /etc/s6-overlay/s6-rc.d/init-nginx/run
RUN chmod 777 /etc/s6-overlay/s6-rc.d/init-nginx/run

# add startup scripts to this /etc/s6-overlay/s6-rc.d/init-custom-files/
# put in order of how you want them run
RUN mkdir -p /custom-cont-init.d
COPY 1-app.sh /custom-cont-init.d/1-app.sh
COPY 2-app.sh /custom-cont-init.d/2-app.sh

RUN dos2unix /custom-cont-init.d/1-app.sh 
RUN dos2unix /custom-cont-init.d/2-app.sh 

RUN chmod 777 /custom-cont-init.d/1-app.sh 
RUN chmod 777 /custom-cont-init.d/2-app.sh 

RUN mkdir -p /config/items/
RUN mkdir -p /config/Downloads/
RUN chmod -R 777 /config/Downloads
RUN chmod -R 777 /config/items

# add cfg for mullvad
COPY browser-cfg /browser-cfg

# add local files
COPY /root /

# ports and volumes
EXPOSE 3000
# USER root
RUN chmod -R 755 /etc/s6-overlay/s6-rc.d/
RUN chmod -R 755 /app/Browser/
# RUN chown -R 1000:1000 /etc/s6-overlay/s6-rc.d/init-wireguard-config/
VOLUME /config