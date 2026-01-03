FROM ghcr.io/linuxserver/baseimage-selkies:debianbookworm-88437702-ls87

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="vBrowser version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="vBrowser"

# title
ENV TITLE=Mullvad \
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
    p7zip-full && \
  apt-get autoclean && \
  rm -rf \
    /config/.cache \
    /var/lib/apt/lists/* \
    /var/tmp/* \
    /tmp/*

RUN \
  echo "**** add icon ****" && \
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
    libdbus-glib-1-2 \
    libgtk-3-0 \
    net-tools \
    wireguard \
    dos2unix \
    inotify-tools \
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
    | jq -r .tag_name); \
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

RUN mkdir -p /config/items/
RUN mkdir -p /config/Downloads/
RUN chmod -R 777 /config/Downloads
RUN chmod -R 777 /config/items

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