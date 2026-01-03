FROM ghcr.io/linuxserver/baseimage-selkies:kali-e7fa3145-ls98

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="Linuxserver.io version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="thelamer"

# title
ENV TITLE="Kali Linux" \
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
    autopsy \
    cutycapt \
    dirbuster \
    dolphin \
    faraday \
    fern-wifi-cracker \
    guymager \
    gwenview \
    hydra \
    kali-desktop-kde \
    kali-linux-default \
    kali-tools-top10 \
    kate \
    kde-config-gtk-style \
    kdialog \
    kfind \
    kio-extras \
    knewstuff-dialog \
    konsole \
    ksystemstats \
    kwin-addons \
    kwin-x11 \
    legion \
    ophcrack \
    ophcrack-cli \
    plasma-desktop \
    plasma-workspace \
    qml-module-qt-labs-platform \
    qt6-svg-plugins \
    sqlitebrowser \
    dos2unix \
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

COPY fullchain.pem /config/ssl/cert.pem
COPY keyfile.pem /config/ssl/cert.key

RUN dos2unix /config/ssl/cert.key
RUN dos2unix /config/ssl/cert.pem

# add local files
COPY /root /

RUN apt-get update && apt-get install -y \
    dos2unix && \
    echo "**** cleanup ****" && \
  rm -rf /config/.cache /tmp/* && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

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