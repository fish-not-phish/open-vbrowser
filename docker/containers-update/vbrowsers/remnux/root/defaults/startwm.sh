#!/bin/bash

# Disable compositing
if [ -f "${HOME}"/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml ]; then
  sed -i \
    '/use_compositing/c <property name="use_compositing" type="bool" value="false"/>' \
    "${HOME}"/.config/xfce4/xfconf/xfce-perchannel-xml/xfwm4.xml
fi
# Set the XFCE desktop background for the primary monitor
# Debug: List XFCE desktop image properties available
echo "Current XFCE image properties:"
xfconf-query --channel xfce4-desktop --list | grep -i image

# Attempt to set the background using two common property names:
BACKGROUND_IMAGE="/usr/share/backgrounds/bg_default.png"

# Set the background image and force it to show for the primary monitor (screen0, monitor0)
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor0/image-path --set "${BACKGROUND}" || true
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor0/last-image --set "${BACKGROUND}" || true
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor0/last-single-image --set "${BACKGROUND}" || true
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor0/image-show --set true || true

# If you have a second monitor, update its properties as well (screen0, monitor1)
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor1/image-path --set "${BACKGROUND}" || true
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor1/last-image --set "${BACKGROUND}" || true
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor1/last-single-image --set "${BACKGROUND}" || true
xfconf-query --channel xfce4-desktop --property /backdrop/screen0/monitor1/image-show --set true || true

# (Optional) List the current properties for debugging
echo "Updated XFCE background properties:"
xfconf-query --channel xfce4-desktop --list | grep -i backdrop

# Kill xfdesktop to force a reload (xfdesktop will auto-restart under xfce4-session)
pkill xfdesktop 2>/dev/null || true

sleep 1
# Start DE
/usr/bin/xfce4-session > /dev/null 2>&1