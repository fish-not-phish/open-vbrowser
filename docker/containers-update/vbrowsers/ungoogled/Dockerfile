FROM ghcr.io/linuxserver/baseimage-kasmvnc:debianbookworm

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="vBrowser version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="vBrowser"

# title
ENV TITLE="Ungoogled Chromium"

RUN \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    dos2unix \
    curl \
    apt-transport-https \
    wget \
    ca-certificates \
    awscli \
    chromium \
    chromium-l10n \
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
    https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/ungoogled-chromium-logo.png && \
  mkdir -p \
    /usr/share/icons/hicolor/192x192/apps/ && \
  cp \
    /kclient/public/icon.png \
    /usr/share/icons/hicolor/192x192/apps/ungoogled-chromium-logo.png && \
  echo "**** install packages ****" && \
  apt-get update && \
  apt-get install -y \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxkbcommon0 \
    thunar \
    xz-utils && \
  if [ -z ${UGC_VERSION+x} ]; then \
    UGC_VERSION=$(curl -sX GET "https://api.github.com/repos/ungoogled-software/ungoogled-chromium-portablelinux/releases/latest" \
      | awk '/tag_name/{print $4;exit}' FS='[""]'); \
  fi && \
  curl -o \
    /tmp/ugc.tar.xz -L \
    "https://github.com/ungoogled-software/ungoogled-chromium-portablelinux/releases/download/${UGC_VERSION}/ungoogled-chromium_${UGC_VERSION}_linux.tar.xz" && \
  mkdir -p \
    /opt/ungoogledchromium && \
  tar xf \
    /tmp/ugc.tar.xz -C \
    /opt/ungoogledchromium --strip-components=1 && \
  echo "**** cleanup ****" && \
  apt-get autoclean && \
  rm -rf \
    /root/.cache \
    /var/lib/apt/lists/* \
    /var/tmp/* \
    /tmp/*

RUN pip3 install --break-system-packages flask requests

# copy cert
COPY fullchain.pem /config/ssl/cert.pem
COPY keyfile.pem /config/ssl/cert.key

RUN dos2unix /config/ssl/cert.key
RUN dos2unix /config/ssl/cert.pem

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

# add local files
COPY /root /

# ports and volumes
EXPOSE 3000

VOLUME /config