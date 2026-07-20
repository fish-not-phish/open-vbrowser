# Open vBrowser - OvB
<p align="center">
  <img src="https://raw.githubusercontent.com/vbrowser/logos/refs/heads/main/logo-vbrowser-transparent.png" alt="vBrowser Logo" width="400"/>
</p>

[![Stars](https://img.shields.io/github/stars/fish-not-phish/open-vbrowser?style=social)](https://github.com/fish-not-phish/open-vbrowser/stargazers)
[![Forks](https://img.shields.io/github/forks/fish-not-phish/open-vbrowser?style=social)](https://github.com/fish-not-phish/open-vbrowser/network/members)

[![License](https://img.shields.io/github/license/fish-not-phish/open-vbrowser?color=green)](LICENSE) 
![Status](https://img.shields.io/badge/status-Alpha-red)

Visit https://docs.vbrowser.io/ for official and in-depth documentation.

## Demo

[![Watch a session being launched](https://img.youtube.com/vi/Dh_dyxh2Eo8/maxresdefault.jpg)](https://youtu.be/Dh_dyxh2Eo8)

vBrowser was initially created by **Joseph Fisher**, a Cyber Threat Intelligence manager, to assist with deep and dark web investigations while not exposing identity and remaining covert. The vBrowser team realized that many SOCs lack the tools or sandboxed environments needed for proper investigations. vBrowser provides companies and individuals access to this infrastructure at a minimal price, lowering the barrier for those who cannot afford expensive subscription services with paywalled features. Our ultimate goal is to give back to the community — enhancing cyber investigations and helping keep people safe.


## Table of Contents

- [Supported Architecture & Platforms](#supported-architecture-and-platforms)
- [Prerequisites](#prerequisites)
  - [Installing Terraform (Linux)](#installing-terraform-linux)
  - [AWS Credentials Setup](#aws-credentials-setup)
  - [Cloudflare Setup](#cloudflare-setup)
- [Getting Started](#getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Export AWS Credentials](#2-export-aws-credentials)
  - [3. Run the Setup Script](#3-run-the-setup-script)
- [What `setup.sh` Does](#what-setupsh-does)
- [Reverse Proxy Options](#reverse-proxy-options)
- [Redeploying Code Changes](#redeploying-code-changes)
- [Destroying the Deployment](#destroying-the-deployment)
- [Supported Browsers & OS Images](#supported-browsers--os-images)
- [License](#license)

## Supported Architecture and Platforms

| Architecture | Platform | Supported | Notes                            |
|--------------|----------|-----------|----------------------------------|
| `amd64`      | Linux    | Yes       | Fully tested and supported       |
| `amd64`      | Windows  | Likely    | Not tested, but expected to work |
| `aarch64`    | Linux    | Likely    | Not tested, but expected to work |
| `arm64`      | Linux    | Likely    | Not tested, but expected to work |

> OvB has only been tested on **Linux (amd64)** systems. All documentation currently assumes a Linux environment.

## Prerequisites

### Installing Terraform (Linux)

To run OvB's infrastructure components, you'll need [Terraform](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli). Here's how to install it on a Debian-based Linux system (e.g. Ubuntu):

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
**3. Add the official HashiCorp repository**
```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | \
sudo tee /etc/apt/sources.list.d/hashicorp.list
```
**4. Download package information and install**
```bash
sudo apt update -y && sudo apt-get install -y terraform
```

---

### AWS Credentials Setup

Terraform needs AWS credentials to provision the ECS, ECR, VPC, and IAM resources.

**1. Sign in to AWS**

Go to [https://aws.amazon.com/console/](https://aws.amazon.com/console/). Using an IAM user (rather than root) with the required permissions is recommended.

**2. Create Access Keys**

1. Navigate to **IAM** → **Users** → your user → **Security credentials**.
2. Click **Create access key** and copy:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

> You will only see the secret key **once**. Store it securely.

**3. Export credentials**

```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
```

> The region is set interactively during `setup.sh` — no manual configuration required.

---

### Cloudflare Setup

OvB uses Cloudflare to dynamically create a DNS A record for each browser session.

**1. Create a Cloudflare account** at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (free tier is sufficient).

**2. Add your domain** to Cloudflare and update your registrar's nameservers to the ones Cloudflare provides.

**3. Copy your Zone ID** from the domain's Overview page in the Cloudflare dashboard (bottom-right).

**4. Create an API Token**

1. Visit [https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → use the **Edit zone DNS** template
3. Set permissions: `Zone.DNS: Edit`, scoped to your specific zone
4. Copy the token — you will only see it once

> Do **not** use the Global API Key. It grants full account access.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/fish-not-phish/open-vbrowser.git
cd open-vbrowser
```

### 2. Export AWS Credentials

```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
```

### 3. Run the Setup Script

```bash
cd terraform
./setup.sh
```

`setup.sh` will interactively prompt for everything else — your domain, Cloudflare Zone ID and API token, AWS region, database credentials, and Django admin credentials. See [What `setup.sh` Does](#what-setupsh-does) for the full breakdown.

---

## What `setup.sh` Does

1. Prompts you to select which browser/OS images to install (or install all).
2. Updates `terraform.tfvars` with your selected image list.
3. Interactively prompts for all required configuration — domain, database credentials, Redis URL, Cloudflare Zone ID and API token, AWS region, and Django superuser email/password — then writes everything to `docker/.env`. Also sets `aws_region` in `terraform.tfvars` to match your input.
4. Runs `terraform init` and `terraform apply -auto-approve` to provision all AWS infrastructure (VPC, subnets, security groups, ECR repository, ECS cluster, IAM roles and user, CloudWatch log groups, ECS task definitions). Terraform then appends `ECR_REGISTRY`, `SUBNET_ID`, `SECURITY_GROUP_ID`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` to `docker/.env`.
5. Builds and pushes only your selected browser/OS images to ECR via `build_browsers.sh` (injects Cloudflare and domain values into each image at build time).
6. Runs `docker compose build --no-cache` using `docker/docker-compose.yml` to build the backend and frontend images.
7. Starts all services with `docker compose up -d`.

> `setup.sh` is for **first-time provisioning only**. To redeploy code changes, see [Redeploying Code Changes](#redeploying-code-changes).

---

## Reverse Proxy Options

Three compose files are provided. Pick whichever fits your setup:

| File | Reverse proxy | TLS |
|------|--------------|-----|
| `docker-compose.traefik.yml` | Traefik | Automatic via Cloudflare DNS challenge |
| `docker-compose.nginx.yml` | Nginx + Certbot | Let's Encrypt HTTP challenge |
| `docker-compose.caddy.yml` | Caddy | Automatic Let's Encrypt HTTP challenge |

`docker-compose.yml` (no reverse proxy) is used by `setup.sh` for initial provisioning.

### Nginx setup

1. Edit `docker/nginx/nginx.conf` — replace every occurrence of `OVB_DOMAIN` with your domain.
2. Add `CERTBOT_EMAIL` to `docker/.env`.
3. Start the stack (HTTP only — the HTTPS block is commented out until the cert exists):
```bash
cd docker
docker compose -f docker-compose.nginx.yml up -d
```
4. Run Certbot to obtain the initial certificate:
```bash
docker compose -f docker-compose.nginx.yml run --rm ovb_certbot
```
5. Uncomment the HTTPS `server { }` block in `docker/nginx/nginx.conf`, then reload:
```bash
docker compose -f docker-compose.nginx.yml exec ovb_nginx nginx -s reload
```

To renew certificates later:
```bash
docker compose -f docker-compose.nginx.yml run --rm ovb_certbot renew
docker compose -f docker-compose.nginx.yml exec ovb_nginx nginx -s reload
```

### Caddy setup

1. Edit `docker/Caddyfile` and replace `example.com` with your domain.
2. Start the stack — Caddy handles certificate issuance and renewal automatically:
```bash
cd docker
docker compose -f docker-compose.caddy.yml up -d
```

### Traefik setup

Traefik uses Cloudflare DNS challenge. Ensure `CF_Zone_ID` and `CF_Token` are set in `docker/.env`, then:
```bash
cd docker
docker compose -f docker-compose.traefik.yml up -d
```

---

## Redeploying Code Changes

After modifying backend or frontend code, rebuild and restart using whichever compose file you are running:

```bash
cd docker
docker compose -f docker-compose.traefik.yml build --no-cache
docker compose -f docker-compose.traefik.yml up -d --force-recreate
```

> `docker compose restart` does **not** re-read `.env`. Always use `--force-recreate` to pick up environment changes.

---

## Destroying the Deployment

To tear everything down cleanly — including all AWS resources and local containers:

```bash
cd terraform
./destroy.sh
```

This will destroy all Terraform-managed AWS infrastructure (ECS, ECR, VPC, IAM, etc.) and stop all Docker containers. To redeploy from scratch, run `./setup.sh` again.

---

## Supported Browsers & OS Images

| Browser / OS     | Selection name |
|------------------|----------------|
| Brave            | `brave`        |
| Chrome           | `chrome`       |
| Microsoft Edge   | `edge`         |
| Firefox          | `firefox`      |
| Floorp           | `floorp`       |
| Kali Linux       | `kali`         |
| LibreWolf        | `librewolf`    |
| Mullvad Browser  | `mullvad`      |
| Pale Moon        | `palemoon`     |
| Pulse Secure     | `pulse`        |
| Telegram         | `telegram`     |
| Tor Browser      | `tor`          |
| Vivaldi          | `vivaldi`      |
| Waterfox         | `waterfox`     |
| Zen Browser      | `zen`          |

Images are configured in `terraform/terraform.tfvars` under `docker_images`. Only the images listed there will have ECS task definitions created and will be built/pushed by `build_browsers.sh`.

---

## License

This project is licensed under a custom **Non-Commercial License**.  
You may use, modify, and distribute the software for **personal and educational use only**.

**Commercial use and resale are strictly prohibited** without express written permission from the author.
