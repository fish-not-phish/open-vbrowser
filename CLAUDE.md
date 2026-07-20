# Open vBrowser (OVB)

A self-hosted browser isolation platform. Users launch isolated browser/OS containers (ECS Fargate tasks) from a multi-workspace web app. Each session gets a unique Cloudflare DNS record pointing to the container's public IP.

## Architecture

- **Backend**: Django + Django Ninja (REST API) + django-allauth (auth + MFA) + Celery + Redis
- **Frontend**: Next.js + React + Tailwind CSS v4 + Radix UI / Shadcn components
- **Database**: PostgreSQL
- **Infrastructure**: AWS ECS Fargate (containers), ECR (images), Cloudflare DNS (per-session subdomains)
- **Reverse proxy**: Traefik (production)

## Project Structure

```
new-ovb/
├── backend/                    # Django backend
│   ├── backend/               # Django project settings
│   │   ├── settings.py        # Main settings
│   │   ├── urls.py            # URL routing
│   │   ├── api.py             # Ninja API setup + router registration
│   │   └── celery.py          # Celery app
│   ├── users/                 # Auth, profiles, API keys, site settings
│   │   ├── models.py          # UserProfile, ExtendedProfile, APIKey, SiteSettings
│   │   ├── api.py             # Auth endpoints + admin endpoints + site-settings
│   │   ├── auth.py            # Session MFA auth backend
│   │   ├── adapters.py        # Social account adapter
│   │   └── signals.py         # Auto-create UserProfile + personal workspace
│   ├── workspaces/            # Workspace model + membership + feature flags
│   ├── sessions/              # VBSession model, traffic events, start/stop lifecycle
│   │   └── management/commands/start.py  # ECS task launch + Cloudflare DNS + cost tracking
│   ├── browsers/              # Browser/OS image catalog
│   ├── cases/                 # Case management (notes, tags, attachments, comments)
│   ├── notifications/         # In-app notifications (WebSocket consumers)
│   ├── templates/             # allauth + MFA HTML templates
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── example.env            # All env vars with placeholder values
│
├── frontend/                  # Next.js frontend
│   ├── app/                   # App router pages
│   │   ├── (auth)/            # Login, signup, MFA flows
│   │   ├── (app)/             # Authenticated app shell
│   │   │   ├── admin/         # Admin: users, settings
│   │   │   └── [workspace_uuid]/  # Per-workspace: sessions, history, settings, cases
│   │   └── session/[uuid]/    # Live session viewer page
│   ├── components/            # UI components (Shadcn/UI style)
│   ├── hooks/                 # useCsrfToken, useNotifications, useUserState
│   ├── lib/api.ts             # All API types + fetch wrappers
│   ├── store/                 # AuthContext, WorkspaceContext, NotificationsContext
│   ├── providers/             # AdminGuard
│   ├── constants/             # App-wide constants
│   ├── Dockerfile
│   └── example.env.local      # NEXT_PUBLIC_BASE_URL placeholders
│
├── docker/                    # Docker configuration
│   ├── docker-compose.traefik.yml   # Production compose (Traefik + all services)
│   ├── docker-compose.dev.yml       # Dev compose (no Traefik)
│   ├── docker-compose.yml           # Base compose
│   ├── build_browsers.sh            # Build + push all browser images to ECR
│   └── vbrowsers/             # Per-browser Docker context
│       ├── brave/             # Dockerfile + 1-app.sh (startup script)
│       ├── chrome/
│       ├── edge/
│       ├── firefox/
│       ├── flloorp/
│       ├── kali/
│       ├── librewolf/
│       ├── mullvad/
│       ├── palemoon/
│       ├── pulse/
│       ├── telegram/
│       ├── tor/
│       ├── vivaldi/
│       ├── waterfox/
│       └── zen/
│
└── terraform/                 # AWS infrastructure
    ├── setup.sh               # First-time provisioning (terraform apply + docker compose up)
    ├── destroy.sh             # Tear down all AWS resources + containers
    ├── main.tf                # Root module; writes credentials to docker/.env
    ├── variables.tf
    ├── outputs.tf
    ├── versions.tf            # AWS ~> 6.0, local ~> 2.0
    ├── terraform.tfvars       # Infrastructure config (not committed — gitignored)
    ├── terraform.tfvars.example  # Template for tfvars
    └── modules/
        ├── infrastructure/    # VPC, subnets, SG, ECR, ECS cluster, IAM, CloudWatch
        └── ecs_tasks/         # ECS task definitions per browser image
```

## Backend Apps

| App | Purpose |
|-----|---------|
| `users` | Auth, profiles, API keys, SiteSettings, admin user management |
| `workspaces` | Workspaces, membership roles, feature flags (network logging, file protection) |
| `sessions` | VBSession lifecycle, traffic event logging, ECS start/stop, cost tracking |
| `browsers` | Browser/OS image catalog (populated via migration) |
| `cases` | Case management with notes, tags, comments, file attachments |
| `notifications` | In-app notifications via Django Channels WebSocket |

## API Endpoints

### Auth (`/api/accounts/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /csrf | No | Get CSRF token |
| GET | /status | No | Check auth status |
| GET | /me | Yes | Get current user |
| PATCH | /profile | Yes | Update profile |
| POST | /change-password | Yes | Change password |
| GET/POST | /api-keys | Yes | List / create API keys |
| DELETE | /api-keys/{uuid} | Yes | Delete API key |
| GET | /limits | Yes | User resource limits |
| GET | /mfa/status | Yes | MFA status |
| GET/DELETE | /sessions | Yes | List / delete login sessions |
| GET/PATCH | /site-settings | Admin | Global site settings |
| GET/POST/PATCH | /admin/users | Admin | User management |

### Sessions (`/api/v1/sessions/`)

Start, stop, list, and stream traffic events for browser sessions.

### Browsers (`/api/v1/browsers/`)

List available browser/OS images.

### Workspaces (`/api/v1/workspaces/`)

CRUD for workspaces, membership, settings, feature flags.

### Cases (`/api/v1/cases/`)

Case management endpoints.

### Notifications (`/api/v1/notifications/`)

In-app notification endpoints + WebSocket.

## Environment Variables

See `backend/example.env` for the full reference. Key variables:

| Variable | Description |
|----------|-------------|
| `DJANGO_SECRET_KEY` | Django secret key |
| `DEBUG` | 1 for development |
| `CUSTOM_DOMAIN` | Production domain (used for CORS, cookies, Cloudflare DNS) |
| `DB_*` | PostgreSQL connection settings |
| `REDIS_URL` | Redis connection URL (Celery broker) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS credentials for ECS |
| `AWS_REGION` | AWS region |
| `SUBNET_ID` / `SECURITY_GROUP_ID` | ECS task networking |
| `ECR_REGISTRY` | ECR registry URL |
| `CF_Zone_ID` / `CF_Token` | Cloudflare Zone ID + API token for DNS |
| `FARGATE_VCPU_PER_HOUR_USD` | Cost estimation rate |

Frontend env: see `frontend/example.env.local`. Only `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_BASE_URL_ACCOUNTS` are needed.

## SiteSettings (Admin-Configurable)

Stored in `users.SiteSettings` (singleton). Configurable via `/api/accounts/site-settings`:

- User registration open/closed
- Allow workspace creation
- Allow personal workspaces
- Browser allowlists
- MFA enforcement
- User limits (sessions, workspaces, etc.)
- **Resource provisioning**: `browser_vcpu`, `browser_memory_gb`, `os_vcpu`, `os_memory_gb`
  - Injected as ECS task-level overrides at launch time
  - OS apps (`kali`, `ubuntu`, `alpine`) use `os_*` values; others use `browser_*`

## Session Lifecycle (`start.py`)

1. Fetch `SiteSettings` resource overrides
2. Run `ecs.run_task()` with `overrides` for cpu/memory
3. Wait for task to reach RUNNING state
4. Fetch public IP of the container
5. Upsert Cloudflare DNS A record: `browser-{hash}.{CUSTOM_DOMAIN}`
6. Save task ARN and domain to `VBSession`
7. On stop: delete DNS record, stop ECS task, record cost from running task object

## Infrastructure Notes

- **AWS provider**: `~> 6.0` (locked at 6.55.0) — use `.region` not `.name` on `data.aws_region`
- **`docker-compose.traefik.yml`** is the production compose; `env_file: .env` (relative to `docker/` dir)
- **`docker/.env`** is written by Terraform `local_file` resource after `terraform apply`
- **`setup.sh`** is first-time provisioning only — does `terraform apply` + `docker compose build --no-cache` + `up -d`
- **Redeploying code changes**: `docker compose build --no-cache && docker compose up -d --force-recreate`
- **`docker compose restart`** does NOT re-read `.env` — must use `--force-recreate`
- **`*.tfvars` and `*.tfstate*`** are gitignored — never commit them

## Secrets / Credentials Policy

- `terraform/terraform.tfvars` — gitignored; use `terraform.tfvars.example` as template
- `terraform/terraform.tfstate` / `.backup` — gitignored; contain plaintext AWS keys + Django secret
- `docker/.env` — gitignored; written by Terraform
- `backend/.env` — gitignored; copy from `example.env`
- `frontend/.env.local` — gitignored; copy from `example.env.local`
- `docker/vbrowsers/*/1-app.sh` — must only contain placeholder values (`CF_API_TOKEN`, `CF_ZONE_ID`, `CUSTOM_DOMAIN`); real values are injected at build time by `build_browsers.sh`
