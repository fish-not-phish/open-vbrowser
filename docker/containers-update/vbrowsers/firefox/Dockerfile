FROM fishnotphish/firefox:latest
RUN rm -f /custom-cont-init.d/1-app.sh
COPY 1-app.sh /custom-cont-init.d/1-app.sh
RUN dos2unix /custom-cont-init.d/1-app.sh
RUN chmod 777 /custom-cont-init.d/1-app.sh

