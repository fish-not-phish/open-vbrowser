FROM ubuntu:24.04

USER root

WORKDIR /app

RUN apt update && \
    apt install -y \
        python3-pip \
        python3-dev \
        python3.12-venv \
        default-libmysqlclient-dev \
        build-essential \
        pkg-config \
        supervisor \
        dos2unix \
        nginx

COPY requirements.txt /app

RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY . /app

EXPOSE 80

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["bash", "/app/entrypoint.sh"]
