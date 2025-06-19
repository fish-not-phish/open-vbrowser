FROM ghcr.io/linuxserver/baseimage-kasmvnc:debianbookworm

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="vBrowser version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="vBrowser"

# title
ENV TITLE=Zen

RUN \
  curl -o \
    /kclient/public/icon.png \
    https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/chromium-logo.png && \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    dos2unix \
    curl \
    apt-transport-https \
    wget \
    ca-certificates \
    awscli \
    xz-utils \
    certbot \
    p7zip-full \
    python3 \
    bzip2 \
    python3-pip \
    python3-certbot-nginx && \
  apt-get autoclean && \
  rm -rf \
    /config/.cache \
    /var/lib/apt/lists/* \
    /var/tmp/* \
    /tmp/*

RUN pip3 install --break-system-packages flask requests

# copy cert
COPY fullchain.pem /config/ssl/cert.pem
COPY keyfile.pem /config/ssl/cert.key

RUN dos2unix /config/ssl/cert.key
RUN dos2unix /config/ssl/cert.pem

# may want to rename kasmbins and kclient (kasm name scheme)
# todo last item to finish

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
                  /ubuntu/install/app/install_app.sh \
                  /ubuntu/install/cleanup/cleanup.sh"

# Copy install scripts
COPY ./src/ $INST_DIR
RUN dos2unix $STARTUPDIR/install/ubuntu/install/app/install_app.sh

# USER root
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