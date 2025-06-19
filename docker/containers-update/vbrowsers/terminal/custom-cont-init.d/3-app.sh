#!/bin/bash

shred -u -z -n 8 /custom-cont-init.d/1-app.sh 
apt-get purge -y awscli && apt-get autoremove -y && apt-get clean

