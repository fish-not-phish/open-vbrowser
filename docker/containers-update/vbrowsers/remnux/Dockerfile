FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntujammy

# set version label
ARG BUILD_DATE
ARG VERSION
LABEL build_version="vBrowser version:- ${VERSION} Build-date:- ${BUILD_DATE}"
LABEL maintainer="vBrowser"

# title
ENV TITLE=Remnux

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
RUN pip3 install flask requests

RUN echo "**** install packages ****" && \
    apt-get update && \
    apt-get install -y \
        faenza-icon-theme \
        mousepad \
        ristretto \
        thunar \
        util-linux \
        xfce4 \
        gnupg \
        xfce4-terminal && \
    echo "**** cleanup ****" && \
    rm -f \
        /etc/xdg/autostart/xfce4-power-manager.desktop \
        /etc/xdg/autostart/xscreensaver.desktop \
        /usr/share/xfce4/panel/plugins/power-manager-plugin.desktop && \
    rm -rf /config/.cache /tmp/* && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

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

# Add Background
ADD /src/common/resources/images/bg_remnux.png  /usr/share/backgrounds/bg_default.png

# add applications

RUN mkdir -p /config/Desktop/
ENV HOME /config
WORKDIR $HOME
ENV DEBIAN_FRONTEND=noninteractive \
    SKIP_CLEAN=true \
    DONT_PROMPT_WSL_INSTALL="No_Prompt_please" \
    INST_DIR=$STARTUPDIR/install \
    INST_SCRIPTS="/ubuntu/install/firefox/install_firefox.sh \
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

  RUN echo "**** install packages ****" && \
  apt-get update && \
  apt-get install -y \
      binutils \
      binwalk \
      bundler \
      dialog \
      edb-debugger \
      epic5 \
      evince \
      feh \
      flex \
      galculator \
      gdb \
      gnutls-bin \
      graphviz \
      imagemagick \
      iproute2 \
      iptables \
      iputils-ping \
      ipython3 \
      jq \
      lame \
      libargon2-0 \
      libbcprov-java \
      libcommons-lang3-java \
      libffi-dev \
      libfuse2 \
      libfuzzy-dev \
      libfuzzy2 \
      libgraphviz-dev \
      libjavassist-java \
      liblzma-dev \
      liblzo2-dev \
      libmysqlclient21 \
      libnetfilter-queue-dev \
      libnfnetlink-dev \
      libpcre2-8-0 \
      libpq5 \
      libqt5scripttools5 \
      libtre5 \
      ltrace \
      mercurial \
      msitools \
      nasm \
      net-tools \
      nodejs \
      openssl \
      pdfresurrect \
      pev \
      nano \
      pkg-config \
      python3-dnslib \
      python3-magic \
      python3-netifaces \
      python3-pyqt5 \
      python3-ssdeep \
      python3-tk \
      python3-urwid \
      python3-venv \
      python3-virtualenv \
      qpdf \
      rar \
      rsakeyfind \
      scalpel \
      scite \
      sharutils \
      ssdeep \
      strace \
      swig \
      sysdig \
      tcpflow \
      tcpdump \
      tcpick \
      tcpxtract \
      tesseract-ocr \
      tor \
      tshark \
      tzdata \
      unhide \
      unrar \
      upx-ucl \
      vbindiff \
      virtualenv \
      wireshark \
      wxhexeditor \
      xdg-utils \
      xmlstarlet \
      xterm \
      yara \
      pdftk-java \
      rhino \
      libjpeg-dev \
      libsqlite3-dev \
      libssl-dev \
      libtool \
      libxml2-dev \
      libxslt1-dev \
      mono-devel \
      nautilus \
      libboost-dev \
      libboost-filesystem-dev \
      libboost-iostreams-dev \
      libboost-program-options-dev \
      libboost-python-dev \
      libboost-regex-dev \
      libboost-system-dev \
      libdpkg-perl \
      libemail-outlook-message-perl \
      libio-socket-ssl-perl \
      autoconf \
      automake \
      default-jdk \
      default-jre \
      git \
      inetsim \
      inspircd \
      perl \
      postgresql \
      ruby-dev \
      ruby \
      sleuthkit \
      software-properties-common \
      zlib1g-dev \
      procyon-decompiler \ 
      netcat \
      libjpeg8-dev \
      # radare2 \
      # runsc \
      # snap \
      # snapd \
      # xorsearch \
      # vscode \
      # usbmount \
      # swftools \
      # vscode \
      # SQLite \
      # spidermonkey \
      # signsrch \
      # scdbg \
      # sandfly-processdecloak \
      # qt5-default \
      # python39-dev \
      # python-pyqt5 \
      # powershell \
      # procdot \
      # pycdc \
      # python-crypto \ 
      # python-dnspython \ 
      # python-magic \
      # python-numpy \
      # python-pil \
      # python-pyasn1 \ 
      # portex \
      # pgadmin3 \
      # openssh \
      # oledump \
      # nsrllookup \
      # msoffice-crypt \
      # linux-headers \
      # libusb-1 \
      # libre2 \
      # libolecf \
      # libncurses \
      # libmysqlclient20 \
      # libglib2 \
      # libemu \
      # ilspy \
      # i386-architecture \
      # ghidra \
      # flare-floss \
      # exfat-utils \
      # enchant \
      # dotnet-runtime-3-1 \
      # dex2jar \
      # burpsuite-community \
      # bulk-extractor \
      # binee \
      # bearparser \
      # bddisasm \
      # baksmali \
      # aeskeybfind \
      gnupg && \
  echo "**** cleanup ****" && \
  rm -rf /config/.cache /tmp/* && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

RUN apt --fix-broken install

RUN apt-get update && apt-get install -y \
    fuse \
    wine && \
    echo "**** cleanup ****" && \
  rm -rf /config/.cache /tmp/* && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g box-js

RUN gem install pedump

RUN pip3 install --no-cache-dir oletools xlmmacrodeobfuscator olefile pyzipper debloat pefile dnfile mwcp dotnetfile

RUN curl -L -o /usr/bin/oledump \
    https://raw.githubusercontent.com/DidierStevens/oletools/master/oletools/oledump.py && \
    chmod +x /usr/bin/oledump

# Download TrID and TrIDUpdate
# Create required directories
RUN mkdir -p /usr/local/src/remnux/files /usr/local/trid_linux_64

# Download TrID binaries and the update utility from the official website
RUN curl -fsSL https://mark0.net/download/trid_linux_64.zip -o /usr/local/src/remnux/files/trid_linux_64.zip \
 && curl -fsSL https://mark0.net/download/tridupdate.zip -o /usr/local/src/remnux/files/tridupdate.zip

# Extract the downloaded zip files into /usr/local/trid_linux_64
RUN unzip /usr/local/src/remnux/files/trid_linux_64.zip -d /usr/local/trid_linux_64 \
 && unzip /usr/local/src/remnux/files/tridupdate.zip -d /usr/local/trid_linux_64

# Set executable permissions on the main binaries
RUN chmod 755 /usr/local/trid_linux_64/trid /usr/local/trid_linux_64/tridupdate.py

RUN wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb \
  && dpkg -i packages-microsoft-prod.deb \
  && rm packages-microsoft-prod.deb

# Update package list with Microsoft repository packages and install PowerShell
RUN apt-get update && apt-get install -y powershell dotnet-runtime-6.0 dotnet-sdk-6.0 gcc && rm -rf /var/lib/apt/lists/*

# Create directories for source files and extraction
RUN mkdir -p /usr/local/src /usr/local/de4dot

# Download the de4dot package from REMnux repository
RUN wget -O /usr/local/src/de4dot-netcoreapp3.1.zip https://github.com/REMnux/distro/raw/master/files/de4dot-netcoreapp3.1.zip

# Verify the SHA256 hash of the downloaded file
RUN echo "50a4bc95591742beb6d65d7a6d5a22f3861d6f9340af0fa20ba733437dc6e003  /usr/local/src/de4dot-netcoreapp3.1.zip" | sha256sum -c -

# Extract the de4dot package into /usr/local/de4dot
RUN unzip /usr/local/src/de4dot-netcoreapp3.1.zip -d /usr/local/de4dot

# Create the wrapper script at /usr/local/bin/de4dot that runs the de4dot DLL via dotnet
RUN echo '#!/bin/bash\nexec dotnet /usr/local/de4dot/de4dot.dll "$@"' > /usr/local/bin/de4dot && chmod +x /usr/local/bin/de4dot

# Download the pyinstxtractor zip file and verify its SHA256 checksum.
RUN wget -O pyinstxtractor-2022.4.zip \
    https://github.com/extremecoders-re/pyinstxtractor/archive/refs/tags/2022.4.zip && \
    echo "14ea2fdcf6f847d44abe1895457fad2622a1bfc75ae163a193eb9127841d52e4  pyinstxtractor-2022.4.zip" | sha256sum -c -

# Extract the zip archive to a specific directory.
RUN unzip pyinstxtractor-2022.4.zip -d /usr/local/src/remnux/pyinstxtractor-2022.4

# Copy the pyinstxtractor.py script to /usr/local/bin and set the executable permission.
RUN cp /usr/local/src/remnux/pyinstxtractor-2022.4/pyinstxtractor-2022.4/pyinstxtractor.py /usr/local/bin/pyinstxtractor.py && \
    chmod 755 /usr/local/bin/pyinstxtractor.py

# Prepend the shebang to ensure the script runs with python3.
RUN sed -i '1s|^|#!/usr/bin/env python3\n|' /usr/local/bin/pyinstxtractor.py

RUN curl -fsSL "https://raw.githubusercontent.com/accidentalrebel/dllcharacteristics.py/master/dllcharacteristics.py" -o dllcharacteristics.py

# Verify the file's SHA256 hash.
# The expected hash is: b0f8ebb322954f44c784bb70bf500a093b067d7a68022be8e77046e5d83bba09
RUN echo "b0f8ebb322954f44c784bb70bf500a093b067d7a68022be8e77046e5d83bba09  dllcharacteristics.py" | sha256sum -c -

# Make the script executable and move it to /usr/bin.
RUN chmod +x dllcharacteristics.py && mv dllcharacteristics.py /usr/bin/dllcharacteristics

# add the correct shebang, and make it executable.
RUN curl -fsSL https://raw.githubusercontent.com/pan-unit42/dotnetfile/main/examples/dotnetfile_dump.py -o /usr/bin/dotnetfile_dump.py && \
    sed -i '1s|^|#!/usr/bin/env python3\n|' /usr/bin/dotnetfile_dump.py && \
    chmod +x /usr/bin/dotnetfile_dump.py

# add the VS Code repository, update packages again, and install Visual Studio Code.
RUN apt-get update && \
    apt-get install -y software-properties-common apt-transport-https wget && \
    wget -q https://packages.microsoft.com/keys/microsoft.asc -O- | apt-key add - && \
    add-apt-repository "deb [arch=amd64] https://packages.microsoft.com/repos/vscode stable main" && \
    apt-get update && \
    apt-get install -y code && \
    rm -rf /var/lib/apt/lists/*

RUN wget https://github.com/radareorg/radare2/releases/download/5.9.8/radare2_5.9.8_amd64.deb
RUN dpkg -i radare2_5.9.8_amd64.deb
RUN apt install -f
RUN apt update -y
RUN wget https://github.com/radareorg/iaito/releases/download/5.9.9/iaito_5.9.9_amd64.deb
RUN dpkg -i iaito_5.9.9_amd64.deb 
RUN apt-get install -f
RUN apt-get install dotnet-sdk-8.0 openjdk-21-jdk qtbase5-dev qtscript5-dev qttools5-dev-tools libqt5svg5-dev qtchooser qt5-qmake -y

# Cutter
RUN wget https://github.com/rizinorg/cutter/releases/download/v2.3.4/Cutter-v2.3.4-Linux-x86_64.AppImage && \
    chmod +x Cutter-v2.3.4-Linux-x86_64.AppImage && \
    ./Cutter-v2.3.4-Linux-x86_64.AppImage --appimage-extract && \
    mv squashfs-root /opt/cutter && \
    ln -s /opt/cutter/AppRun /usr/local/bin/cutter && \
    rm Cutter-v2.3.4-Linux-x86_64.AppImage

# Binary Ninja
RUN wget https://cdn.binary.ninja/installers/binaryninja_free_linux.zip -O binaryninja.zip && \
    mkdir -p /config/tools && \
    unzip binaryninja.zip -d /config/tools/binaryninja && \
    ln -s /config/tools/binaryninja/binaryninja/binaryninja /usr/local/bin/binaryninja && \
    rm binaryninja.zip

# ILSpy
RUN wget https://github.com/icsharpcode/AvaloniaILSpy/releases/download/v7.2-rc/Linux.x64.Release.zip && \
    unzip Linux.x64.Release.zip && \
    unzip ILSpy-linux-x64-Release.zip

RUN ln -s /config/artifacts/linux-x64/ILSpy /usr/local/bin/ilspy

# Ghidra
RUN wget https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.3.2_build/ghidra_11.3.2_PUBLIC_20250415.zip && \
    unzip ghidra_11.3.2_PUBLIC_20250415.zip && \
    ln -s /config/ghidra_11.3.2_PUBLIC/ghidraRun /usr/local/bin/ghidra

# Detect It Easy
# RUN git clone --recursive https://github.com/horsicq/DIE-engine.git /config/DIE-engine
# RUN bash -x /config/DIE-engine/build_dpkg.sh 
# RUN dpkg -i release/$(ls release)

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

# add chrome preferences
COPY Preferences /config/.config/google-chrome/Default/Preferences
RUN dos2unix /config/.config/google-chrome/Default/Preferences

RUN mkdir -p /config/items/
RUN mkdir -p /config/Downloads/
RUN chmod -R 777 /config/Downloads
RUN chmod -R 777 /config/items

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm -rf aws awscliv2.zip

# add local files
COPY /root /

# ports and volumes
EXPOSE 3000

VOLUME /config