#!/bin/bash

# Run any init tasks as root here
echo "Running initial tasks as root..."
whoami

cat << 'EOF' >> /home/vUser/.bashrc
echo -e "\e[1;38;2;255;20;147m         .d8888b.  \e[1;38;2;255;20;147m888               888 888     "
echo -e "\e[1;38;2;255;20;147m        d88P  Y88b \e[1;38;2;255;20;147m888               888 888     "
echo -e "\e[1;38;2;255;20;147m        Y88b.      \e[1;38;2;255;20;147m888               888 888     "
echo -e "\e[1;36m888  888 \e[1;38;2;255;20;147m\"Y888b.   \e[1;38;2;255;20;147m88888b.   .d88b.  888 888     "
echo -e "\e[1;36m888  888    \e[1;38;2;255;20;147m\"Y88b. \e[1;38;2;255;20;147m888 \"88b d8P  Y8b 888 888     "
echo -e "\e[1;36mY88  88P      \e[1;38;2;255;20;147m\"888 \e[1;38;2;255;20;147m888  888 88888888 888 888     "
echo -e "\e[1;36m Y8bd8P\e[1;38;2;255;20;147m Y88b  d88P \e[1;38;2;255;20;147m888  888 Y8b.     888 888     "
echo -e "\e[1;36m  Y88P   \e[1;38;2;255;20;147m\"Y8888P\"  \e[1;38;2;255;20;147m888  888  \"Y8888  888 888     "
echo -e "\e[0m"
echo "Enter 'help' for a list of available commands"
EOF

echo 'export PS1="\[\e[1m\]\[\e[38;2;255;20;147m\]vUser\[\e[0m\]\[\e[1;36m\]@\[\e[0m\]\[\e[1m\]\[\e[38;2;255;20;147m\]vShell\[\e[0m\]:\[\e[1;36m\]\w\[\e[0m\]\[\e[1;33m\]\$ \[\e[0m\]"' >> /home/vUser/.bashrc


# Run all custom init scripts in /custom-cont-init.d/
if [ -d /custom-cont-init.d/ ]; then
  for script in /custom-cont-init.d/*; do
    if [ -x "$script" ]; then
      echo "Running $script..."
      "$script"
    else
      echo "Skipping $script; not executable."
    fi
  done
fi

# Start nginx and keep it running in the foreground
echo "Starting nginx..."
nginx -g 'daemon off;' &

# Create the user's home directory
mkdir -p /home/$USERNAME

# Source the .bashrc to make the changes effective immediately
source /home/vUser/.bashrc

# Drop privileges and switch to vuser, then run ttyd with arguments
exec su - vUser -c "ttyd -W -w /home/$USERNAME -o bash"
