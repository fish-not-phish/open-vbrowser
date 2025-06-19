# Open vBrowser - OvB
<p align="center">
  <img src="https://raw.githubusercontent.com/vbrowser/logos/refs/heads/main/logo-vbrowser-transparent.png" alt="vBrowser Logo" width="400"/>
</p>

[![Stars](https://img.shields.io/github/stars/fish-not-phish/open-vbrowser?style=social)](https://github.com/fish-not-phish/open-vbrowser/stargazers)
[![Forks](https://img.shields.io/github/forks/fish-not-phish/open-vbrowser?style=social)](https://github.com/fish-not-phish/open-vbrowser/network/members)

[![License](https://img.shields.io/github/license/fish-not-phish/open-vbrowser?color=green)](LICENSE) 
![Status](https://img.shields.io/badge/status-Alpha-red)

vBrowser was initially created by **Joseph Fisher**, a Cyber Threat Intelligence manager, to assist with deep and dark web investigations while not exposing identity and remaining covert. The vBrowser team realized that many SOCs lack the tools or sandboxed environments needed for proper investigations. vBrowser provides companies and individuals access to this infrastructure at a minimal price, lowering the barrier for those who cannot afford expensive subscription services with paywalled features. Our ultimate goal is to give back to the community—enhancing cyber investigations and helping keep people safe.


## Table of Contents

- [Supported Architecture & Platforms](#supported-architecture-and-platforms)  
- [Installing Terraform (Linux)](#installing-terraform-linux)  
- [AWS Credentials Setup (Root User)](#aws-credentials-setup-root-user)  
  - [1. Sign in to AWS](#1-sign-in-to-aws)  
  - [2. Create Access Keys (for root)](#2-create-access-keys-for-root)  
  - [3. Configure the environment for Terraform](#3-configure-the-environment-for-terraform)  
- [Cloudflare Setup](#cloudflare-setup)  
  - [1. Create a Cloudflare Account](#1-create-a-cloudflare-account)  
  - [2. Add Your Domain to Cloudflare](#2-add-your-domain-to-cloudflare)  
  - [3. Copy Your Zone ID](#3-copy-your-zone-id)  
  - [4. Create an API Token](#4-create-an-api-token)  
- [Getting Started](#getting-started)  
  - [1. Clone the Repository](#1-clone-the-repository)  
  - [2. Change directory into terraform folder](#2-change-directory-into-terraform-folder)  
  - [3. Run the setup script](#3-run-the-setup-script)  
- [What `setup.sh` Does](#what-setupsh-does) 
  - [1. Image Selection](#1-image-selection)  
  - [2. Environment Setup (`.env`)](#2-environment-setup-env)  
  - [3. Terraform Patching](#3-terraform-patching)  
  - [4. Infrastructure Provisioning](#4-infrastructure-provisioning)  
  - [5. Environment Propagation](#5-environment-propagation)  
  - [6. Docker Image Builds](#6-docker-image-builds)  
  - [7. Service Startup](#7-service-startup)  
- [Destroying the Deployment](#destroying-the-deployment) 
- [API Special Key](#api-special-key)
   - [Purpose](#purpose)  
- [License](#license) 

## 🧪 Supported Architecture and Platforms

| Architecture | Platform | Supported | Notes                            |
|--------------|----------|-----------|----------------------------------|
| `amd64`      | Linux    | ✅ Yes     | Fully tested and supported       |
| `amd64`      | Windows  | ⚠️ Likely  | Not tested, but expected to work |
| `aarch64`    | Linux    | ❌ No      | Not yet tested or supported      |
| `arm64`      | Linux    | ❌ No      | Not yet tested or supported      |

> ℹ️ OvB has only been tested on **Linux (amd64)** systems. Windows support is **expected** but not verified. All documentation currently assumes a Linux environment.

## 📦 Installing Terraform (Linux)

To run OvB's infrastructure components, you’ll need [Terraform](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli). Here's how to install it on a Debian-based Linux system (e.g. Ubuntu):

**1. Update and install prerequisites**
```bash
sudo apt-get update -y && sudo apt-get install -y gnupg software-properties-common
```
**2. Install the HashiCorp GPG Key**
```bash
wget -O- https://apt.releases.hashicorp.com/gpg | \
gpg --dearmor | \
sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null
```
**3. Add the official HashiCorp repository to your linux system.**
```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | \
sudo tee /etc/apt/sources.list.d/hashicorp.list
```
**4. Download the package information**
```bash
sudo apt update -y
```
**5. Install Terraform**
```bash
sudo apt-get install -y terraform
```
## 🔐 AWS Credentials Setup (Root User)

To allow Terraform to authenticate with AWS, you need to provide your **Access Key ID** and **Secret Access Key**. Here's how to obtain them from your AWS Root Account (IAM user is also sufficient):

---

### 1. Sign in to AWS

Go to [https://aws.amazon.com/console/](https://aws.amazon.com/console/) and log in as the **root user** (email + password). Feel free to use an IAM user instead as long as the permissions are correct.

---

### 2. Create Access Keys (for root)

1. Navigate to **My Security Credentials** (top-right dropdown → _“My Security Credentials”_).  
2. Scroll down to the **Access keys** section.  
3. Click **Create access key**.  
4. **Download** or **copy** the credentials safely:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

> ⚠️ You will only see the secret key **once**. Store it securely.

---

### 3. Configure the environment for Terraform

You can pass the credentials via environment variables:

```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
export AWS_DEFAULT_REGION="us-east-2"  # or your desired region
```
## 🌐 Cloudflare Setup

OvB uses Cloudflare to manage DNS records dynamically. Follow these steps to configure your Cloudflare account:

---

### 1. Create a Cloudflare Account

If you don’t already have one, sign up at:  
🔗 [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)

---

### 2. Add Your Domain to Cloudflare

- Add a domain you own (e.g. `example.com`) to your Cloudflare account.
- Update your domain registrar to point your nameservers to the Cloudflare-provided ones.
- Wait for DNS propagation to complete (can take several minutes to hours).

> ✅ A **free-tier account** is sufficient.

---

### 3. Copy Your Zone ID

1. Go to your domain’s **Overview** page in the Cloudflare dashboard.  
2. Locate the **Zone ID** at the bottom-right of the page.  
3. **Copy** and store this — you’ll need it for the OvB setup process.

---

### 4. Create an API Token

1. Visit: [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)  
2. Click **“Create Token”**
3. Choose **“Edit zone DNS”** template  
4. Set the following:
   - **Token name**: `Terraform DNS Access` (or any descriptive name)
   - **Permissions**: `Zone.DNS:Edit`
   - **Resources**: Select **Specific Zone** and choose your domain (e.g. `example.com`)

5. Create the token and **copy it**. You will only see it once.

> ❗️Do **not** use the Global API Key unless absolutely necessary. It grants broad account access.

---

## 🚀 Getting Started

Once your environment is ready (Terraform, AWS credentials, and Cloudflare API token), follow the steps below to deploy OvB:

---

### 1. Clone the Repository

```bash
git clone https://github.com/fish-not-phish/OvB.git
```
### 2. Change directory into terraform folder
```bash
cd OvB/terraform
```
### 3. Run the setup script
```bash
./setup.sh
```
## 🔧 What `setup.sh` Does

The `setup.sh` script automates the full initialization process for Open vBrowser. Here’s what it handles:

### 1. **Image Selection**  
   Prompts the user to choose default or custom browser containers (e.g. Chrome, Remnux). It moves unused images into a separate `unused/` folder and restores any selected images.

#### ✅ Example

To enable **Chrome**, **Microsoft Edge**, and **IceCat**, enter:

```bash
chrome,edge,icecat
```
> ⚠️ Input must be comma-separated, with no spaces.

| Icon | Browser         | Name for Selection |
|------|------------------|--------------------|
| <img src="django/static/images/brave.png"  width="20" alt="Brave logo"/>   | Brave            | `brave`            |
| <img src="django/static/images/chrome.png"  width="20" alt="Brave logo"/>   | Chrome           | `chrome`           |
| <img src="django/static/images/chromium.png"  width="20" alt="Brave logo"/>   | Chromium         | `chromium`         |
| <img src="django/static/images/discord.png"  width="20" alt="Brave logo"/>   | Discord          | `discord`          |
| <img src="django/static/images/edge.png"  width="20" alt="Brave logo"/>   | Microsoft Edge   | `edge`             |
| <img src="django/static/images/falkon.png"  width="20" alt="Brave logo"/>   | Falkon           | `falkon`           |
| <img src="django/static/images/firefox.png"  width="20" alt="Brave logo"/>   | Firefox          | `firefox`          |
| <img src="django/static/images/floorp.png"  width="20" alt="Brave logo"/>   | Floorp           | `floorp`           |
| <img src="django/static/images/icecat.png"  width="20" alt="Brave logo"/>   | IceCat           | `icecat`           |
| <img src="django/static/images/librewolf.png"  width="20" alt="Brave logo"/>   | LibreWolf        | `librewolf`        |
| <img src="django/static/images/mullvad.png"  width="20" alt="Brave logo"/> | Mullvad Browser  | `mullvad`          |
| <img src="django/static/images/opera.png"  width="20" alt="Brave logo"/>   | Opera            | `opera`            |
| <img src="django/static/images/palemoon.png"  width="20" alt="Brave logo"/>   | Pale Moon        | `palemoon`         |
| <img src="django/static/images/postman.png"  width="20" alt="Brave logo"/> | Postman          | `postman`          |
| <img src="django/static/images/pulse.png"  width="20" alt="Brave logo"/>   | Pulse Secure     | `pulse`            |
| <img src="django/static/images/remnux.png"  width="20" alt="Brave logo"/>   | REMnux           | `remnux`           |
| <img src="django/static/images/seamonkey.png"  width="20" alt="Brave logo"/>   | SeaMonkey        | `seamonkey`        |
| <img src="django/static/images/signal.png"  width="20" alt="Brave logo"/>   | Signal           | `signal`           |
| <img src="django/static/images/slack.png"  width="20" alt="Brave logo"/>   | Slack            | `slack`            |
| <img src="django/static/images/telegram.png"  width="20" alt="Brave logo"/>   | Telegram         | `telegram`         |
| <img src="django/static/images/thorium.png"  width="20" alt="Brave logo"/>   | Thorium          | `thorium`          |
| <img src="django/static/images/tor.png"  width="20" alt="Brave logo"/>   | Tor Browser      | `tor`              |
| <img src="django/static/images/ungoogled.png"  width="20" alt="Brave logo"/>   | Ungoogled Chrome | `ungoogled`        |
| <img src="django/static/images/vivaldi.png"  width="20" alt="Brave logo"/>   | Vivaldi          | `vivaldi`          |
| <img src="django/static/images/waterfox.png"  width="20" alt="Brave logo"/>   | Waterfox         | `waterfox`         |
| <img src="django/static/images/zen.png"  width="20" alt="Brave logo"/>   | Zen Browser      | `zen`              |
| <img src="django/static/images/zoom.png"  width="20" alt="Brave logo"/>   | Zoom             | `zoom`             |

🗃️ All unused images will be automatically moved to the `unused/` folder.

### 2. **Environment Setup (`.env`)**  
> NOTE: DEBUG should be set to False or 0 for production environments.

> NOTE: LOGGER_ENABLED set to True may generate lots of output. Recommened to have off unless you are troubleshooting.

> NOTE: DEFAULT_IDLE_THRESHOLD is the amount of time you want sessions to auto-close during an idle period.

Recommend changing the following:

   - `CUSTOM_DOMAIN` (required to change)
   - `DJANGO_SUPERUSER_USERNAME`
   - `DJANGO_SUPERUSER_EMAIL`
   - `DJANGO_SUPERUSER_PASSWORD`
   - `CF_Zone_ID` (required to change)
   - `CF_Token` (required to change)
   - Ensure `AWS_DEFAULT_REGION` is set to your desired region
   - The rest of the variables are configured to work by default. Change at your own risk.

### What Does It Generate?
   - Generates a secure Django `SECRET_KEY`
   - Prompts for required environment variables (database, Redis, AWS, Cloudflare, etc.)
   - Saves all values to a `.env` file
   - Auto-generates key fields like `ALLOWED_HOSTS` and `USER_EMAIL`

### 3. **Terraform Patching**  
   Updates any `region` and `awslogs-region` values in Terraform files to match the selected `AWS_DEFAULT_REGION`.

### 4. **Infrastructure Provisioning**  
   Runs `terraform init` and `terraform apply -auto-approve` to automatically create the necessary AWS infrastructure.

### 5. **Environment Propagation**  
   Copies the `.env` file to:
   - `../django/`
   - `../docker/containers-update/`
   - `../docker/vbrowser-stack/`

### 6. **Docker Image Builds**  
   Builds Docker images for:
   - The Django backend (`vbrowser`)
   - The container manager (`containers-updater`)

### 7. **Service Startup**  
   Uses Docker Compose to bring up:
   - `containers-update` stack
   - `vbrowser-stack`

> 🛠️ This script ensures that by the time it's finished, all required infrastructure is configured properly and initializing their startup process(es).

> ⚠️ **Important:**  
> After running `setup.sh`, you **must wait** for the `containers-updater` container to finish its build and push process **before starting any sessions**.  
> Run the following to monitor its progress:
```bash
docker logs containers-updater -f
```
Please wait until it stops producing output and says `All done.`. Once this occurrs, the entire setup process has been completed.

---

## 🧨 Destroying the Deployment

To tear everything down cleanly — including AWS resources and local containers — run the following:

```bash
cd OvB/terraform
./destroy.sh
```
This script requires no input. It will:

- Destroy all AWS infrastructure created by Terraform (ECS, networking, ECR, etc.)
- Remove all Docker containers and associated volumes

This gives you a fresh slate. To redeploy, just run `./setup.sh` again.

## API Special Key

`API_SPECIAL_KEY` is automatically generated based on your `CUSTOM_DOMAIN`. It is the Base64-encoded version of the domain you provide in the environment variable `CUSTOM_DOMAIN`.

### Purpose

The `API_SPECIAL_KEY` is used to **cross-verify the integrity of API requests**.  
Any client attempting to use your API must provide:
- Their own **API key**
- The corresponding **API Special Key** (Base64-encoded version of their registered `CUSTOM_DOMAIN`)

This dual verification ensures that only authorized clients with a valid domain and API key can interact with the API, protecting against unauthorized access and domain spoofing.


## License
See the LICENSE file for full details.