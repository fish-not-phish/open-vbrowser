FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN ln -fs /usr/share/zoneinfo/Etc/UTC /etc/localtime && \
    echo "Etc/UTC" > /etc/timezone && \
    apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libjson-c-dev \
    libwebsockets-dev \
    fakechroot \
    python3-certbot-nginx \
    dos2unix \
    curl \
    apt-transport-https \
    wget \
    ca-certificates \
    certbot \
    nginx \
    p7zip-full \
    wget \
    gnupg \
    unzip \
    curl \
    python3 \
    python3-pip \
    jq \
    bash && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Clone the ttyd repository and build it from source
WORKDIR /tmp
RUN git clone https://github.com/tsl0922/ttyd.git && \
    cd ttyd && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make && \
    make install

# Clean up build files to keep the image size small
WORKDIR /
RUN rm -rf /tmp/ttyd && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/rbash vUser

USER vUser
USER root
# Add and convert the entry point script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN dos2unix /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

RUN chown -R vUser:vUser /home/vUser && \
    chmod -R 755 /home/vUser

# Create necessary directories
RUN mkdir -p /home /config /config/ssl

# Copy SSL certificates and convert them
COPY fullchain.pem /config/ssl/fullchain.pem
COPY keyfile.pem /config/ssl/keyfile.pem
RUN dos2unix /config/ssl/fullchain.pem /config/ssl/keyfile.pem

# Copy the default NGINX configuration and convert it
COPY default.conf /etc/nginx/conf.d/default.conf
RUN dos2unix /etc/nginx/conf.d/default.conf

# Copy and set up init scripts
COPY 1-app.sh /custom-cont-init.d/1-app.sh
COPY 3-app.sh /custom-cont-init.d/3-app.sh
COPY 4-app.sh /custom-cont-init.d/4-app.sh
RUN dos2unix /custom-cont-init.d/* && chmod +x /custom-cont-init.d/*

RUN rm /etc/nginx/sites-enabled/default

RUN apt-get update && \
    apt-get install -y sudo && \
    usermod -aG sudo vUser && \
    usermod --shell /bin/bash vUser && \
    echo 'vUser ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/vUser && \
    chmod 0440 /etc/sudoers.d/vUser
# Set the entrypoint
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]

# Default command
CMD ["ttyd", "-W", "bash"]
