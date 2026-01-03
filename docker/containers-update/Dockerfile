FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        bash \
        sed \
        curl \
        openssl \
        ca-certificates \
        cron \
        gnupg \
        software-properties-common \
        unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y wget gnupg curl software-properties-common

RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg

RUN echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com bookworm main" \
    > /etc/apt/sources.list.d/hashicorp.list

RUN apt-get update && apt-get install -y terraform

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
 && unzip awscliv2.zip \
 && ./aws/install \
 && rm -rf awscliv2.zip

COPY update_containers.sh /usr/local/bin/update_containers.sh
RUN chmod +x /usr/local/bin/update_containers.sh

COPY automated/update.sh /automated/update.sh
RUN chmod 777 -R /automated

COPY /vbrowsers /vbrowsers/
RUN chmod 777 -R /vbrowsers

RUN echo "0 2 */5 * * /automated/update.sh" | crontab -

ENTRYPOINT ["/usr/local/bin/update_containers.sh"]

