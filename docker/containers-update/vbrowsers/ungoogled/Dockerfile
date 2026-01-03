FROM ghcr.io/linuxserver/baseimage-selkies:debianbookworm-88437702-ls87

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="vBrowser version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="vBrowser"

# title
ENV TITLE="Ungoogled Chromium" \
    NO_GAMEPAD=true

RUN \
  echo "**** add icon ****" && \
  curl -o \
    /usr/share/selkies/www/icon.png \
    https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/kali-logo.png && \
  echo "**** install packages ****" && \
  apt-get update && \
  DEBIAN_FRONTEND=noninteractive \
  apt-get install -y --no-install-recommends \
    plasma-desktop \
    plasma-workspace \
    qml-module-qt-labs-platform \
    sqlitebrowser \
    systemsettings && \
  echo "**** kde tweaks ****" && \
  sed -i \
    's/applications:org.kde.discover.desktop,/applications:org.kde.konsole.desktop,/g' \
    /usr/share/plasma/plasmoids/org.kde.plasma.taskmanager/contents/config/main.xml && \
  echo "**** cleanup ****" && \
  apt-get autoclean && \
  rm -rf \
    /config/.cache \
    /var/lib/apt/lists/* \
    /var/tmp/* \
    /tmp/*


RUN \
  apt-get update && \
  apt-get install -y --no-install-recommends \
    dos2unix \
    curl \
    apt-transport-https \
    wget \
    ca-certificates \
    chromium \
    chromium-l10n \
    p7zip-full && \
    apt-get autoclean && \
    rm -rf \
      /config/.cache \
      /var/lib/apt/lists/* \
      /var/tmp/* \
      /tmp/*

RUN \
  echo "**** add icon ****" && \
  mkdir -p \
    /usr/share/icons/hicolor/192x192/apps/ && \
  echo "**** install packages ****" && \
  apt-get update && \
  apt-get install -y \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libnss3 \
    inotify-tools \
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
    "https://github.com/ungoogled-software/ungoogled-chromium-portablelinux/releases/download/${UGC_VERSION}/ungoogled-chromium-${UGC_VERSION}-x86_64_linux.tar.xz" && \
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

RUN mkdir -p /config/items/
RUN mkdir -p /config/Downloads/
RUN chmod -R 777 /config/Downloads
RUN chmod -R 777 /config/items

# add local files
COPY /root /

RUN rm -f /usr/share/selkies/www/icon.png
COPY logo.png /usr/share/selkies/www/icon.png
RUN dos2unix /usr/share/selkies/www/icon.png

RUN rm -f /usr/share/selkies/www/nginx/footer.html
COPY footer.html /usr/share/selkies/www/nginx/footer.html
RUN dos2unix /usr/share/selkies/www/nginx/footer.html

COPY functions.js /usr/share/selkies/www/assets/functions.js
RUN dos2unix /usr/share/selkies/www/assets/functions.js

COPY functions.css /usr/share/selkies/www/assets/functions.css
RUN dos2unix /usr/share/selkies/www/assets/functions.css

RUN rm -f /defaults/default.conf
COPY default.conf /defaults/default.conf
RUN dos2unix /defaults/default.conf

# edit nginx startup script
RUN rm -f /etc/s6-overlay/s6-rc.d/init-nginx/run
COPY run /etc/s6-overlay/s6-rc.d/init-nginx/run
RUN dos2unix /etc/s6-overlay/s6-rc.d/init-nginx/run
RUN chmod 777 /etc/s6-overlay/s6-rc.d/init-nginx/run

RUN mkdir -p /config/Desktop/
RUN ln -s /config/Downloads /config/Desktop/Downloads

COPY zip-watcher.sh /usr/local/bin/zip-watcher.sh
RUN dos2unix /usr/local/bin/zip-watcher.sh
RUN chmod +x /usr/local/bin/zip-watcher.sh

RUN mkdir -p /etc/s6-overlay/s6-rc.d/zip-watcher
COPY s6-run.sh /etc/s6-overlay/s6-rc.d/zip-watcher/run
RUN dos2unix /etc/s6-overlay/s6-rc.d/zip-watcher/run
RUN chmod +x /etc/s6-overlay/s6-rc.d/zip-watcher/run

RUN echo "longrun" > /etc/s6-overlay/s6-rc.d/zip-watcher/type
RUN dos2unix /etc/s6-overlay/s6-rc.d/zip-watcher/type

RUN ln -s ../zip-watcher /etc/s6-overlay/s6-rc.d/user/contents.d/zip-watcher

RUN mkdir -p /etc/s6-overlay/s6-rc.d/html-injector
COPY up /etc/s6-overlay/s6-rc.d/html-injector/up
RUN dos2unix /etc/s6-overlay/s6-rc.d/html-injector/up && \
    chmod +x /etc/s6-overlay/s6-rc.d/html-injector/up

COPY html-injector.sh /usr/local/bin/html-injector.sh
RUN dos2unix /usr/local/bin/html-injector.sh
RUN chmod +x /usr/local/bin/html-injector.sh

RUN echo "oneshot" > /etc/s6-overlay/s6-rc.d/html-injector/type
RUN dos2unix /etc/s6-overlay/s6-rc.d/html-injector/type

RUN ln -s /etc/s6-overlay/s6-rc.d/html-injector /etc/s6-overlay/s6-rc.d/user/contents.d/html-injector

RUN mkdir -p /custom-cont-init.d
COPY 1-app.sh /custom-cont-init.d/1-app.sh
COPY 2-app.sh /custom-cont-init.d/2-app.sh

RUN dos2unix /custom-cont-init.d/1-app.sh 
RUN dos2unix /custom-cont-init.d/2-app.sh 

RUN chmod 777 /custom-cont-init.d/1-app.sh 
RUN chmod 777 /custom-cont-init.d/2-app.sh

# ports and volumes
EXPOSE 3000

VOLUME /config