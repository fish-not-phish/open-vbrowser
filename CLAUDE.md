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
open-vbrowser/
├── backend/                    # Django backend
│   ├── backend/               # Django project settings
│   │   ├── settings.py        # Main settings
│   │   ├── urls.py            # URL routing
│   │   ├── api.py             # Ninja API setup + router registration
│   │   └── celery.py          # Celery app
│   ├── users/                 # Auth, profiles, API keys, site settings
│   │   ├── models.py          # UserProfile, ExtendedProfile, APIKey, SiteSettings, UserLimit
│   │   ├── api.py             # Auth endpoints + admin endpoints + site-settings
│   │   ├── auth.py            # Session MFA auth backend
│   │   ├── adapters.py        # Social account adapter
│   │   └── signals.py         # Auto-create UserProfile + personal workspace
│   ├── workspaces/            # Workspace model + membership + feature flags
│   │   ├── models.py          # Workspace, WorkspaceMembership (5-role hierarchy)
│   │   ├── api.py             # CRUD, membership, settings, feature flags
│   │   ├── permissions.py     # Role hierarchy + require_role/user_role_at_least helpers
│   │   ├── services.py        # S3 Files access-point provision/deprovision + prefix purge
│   │   ├── signals.py         # Auto-create personal workspace; provision/deprovision S3 access point
│   │   └── management/commands/backfill_access_points.py  # (Re)provision/verify access points
│   ├── sessions/              # VBSession model, traffic events, start/stop lifecycle
│   │   ├── models.py          # Container, OpenContainers, TrafficEvent
│   │   ├── api.py             # Session CRUD, traffic events, IOC aggregation, spend
│   │   ├── schemas.py         # SessionDetailOut, TrafficEventOut, IOCOut, ...
│   │   ├── services.py        # Cost computation + idle/duration limit resolvers
│   │   ├── cloudflare.py      # DNS A-record upsert/delete helpers (replaces old 1-app.sh)
│   │   ├── tasks.py           # Celery tasks (DNS upsert on callback, etc.)
│   │   └── management/commands/
│   │       ├── start.py            # ECS task launch + per-workspace S3 mount + cost tracking
│   │       ├── close_containers.py # Idle/duration enforcement loop
│   │       ├── delete.py           # DNS record deletion on session close
│   │       └── fake_callback.py    # DEV_MODE: POST a fake callback to resolve a session
│   ├── browsers/              # Browser/OS image catalog
│   ├── cases/                 # Case management (notes, tags, attachments, comments, file links)
│   │   ├── models.py          # Case, Tag, SessionNote, CaseComment, CaseAttachment, CaseFileLink
│   │   └── api.py             # Cases + comments + attachments + S3 file links + protected downloads
│   ├── files/                 # S3 file explorer API (workspace persistent storage)
│   │   ├── api.py             # list/download/upload/delete/mkdir/hash/download-protected
│   │   └── schemas.py         # FileEntry, FileListOut, HashOut, MkdirIn, UploadOut
│   ├── audit/                 # Global audit log
│   │   ├── models.py          # AuditLog (actor, action, target_user, ip, metadata)
│   │   ├── api.py             # Admin-only list/filter endpoint
│   │   └── services.py        # log_audit() helper used across all apps
│   ├── notifications/         # In-app notifications (WebSocket consumers)
│   ├── templates/             # allauth + MFA HTML templates
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── requirements.txt
│   └── (env vars are read from os.environ in backend/backend/settings.py; real values live in docker/.env)
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
│   ├── build_browsers.sh            # Build + push all browser images to ECR (injects CF/domain vars at build time)
│   └── vbrowsers/             # Per-browser build context (Dockerfiles live in the browser image repos; the old per-browser 1-app.sh startup scripts were removed when DNS upsert moved to the backend — see sessions/cloudflare.py)
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
| `users` | Auth, profiles, API keys, SiteSettings, UserLimit, admin user management |
| `workspaces` | Workspaces, 5-role membership hierarchy, feature flags, S3 Files access-point lifecycle |
| `sessions` | VBSession lifecycle, traffic event logging, IOC aggregation, ECS start/stop, cost tracking |
| `browsers` | Browser/OS image catalog (populated via migration) |
| `cases` | Case management with notes, tags, comments, file attachments, and S3 file links |
| `files` | S3 file explorer API for workspace persistent storage (list/upload/download/delete/mkdir/hash/protected) |
| `audit` | Global audit log; `log_audit()` helper called from every app |
| `notifications` | In-app notifications via Django Channels WebSocket |

## API Endpoints

Routers registered in `backend/backend/api.py`:

| Prefix | Router | Auth |
|--------|--------|------|
| `/api/accounts/` | users | mixed (session / admin) |
| `/api/v1/sessions/` | sessions | session+MFA |
| `/api/v1/browsers/` | browsers | session+MFA |
| `/api/v1/workspaces/` | workspaces | session+MFA |
| `/api/v1/cases/` | cases | session+MFA |
| `/api/v1/files/` | files | session+MFA |
| `/api/v1/notifications/` | notifications | session+MFA |
| `/api/v1/audit/` | audit | admin only |

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

Start, stop, list, and stream traffic events for browser sessions. Notable sub-resources:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | / | Launch a session (requires `analyst`+ workspace role) |
| GET | /{uuid}/ | Session detail (includes resolved idle/duration limits) |
| POST | /{uuid}/callback/ | ECS callback — moves session to active; Celery upserts DNS A record |
| GET | /{uuid}/traffic/ | Paginated traffic events |
| GET | /{uuid}/traffic/iocs/ | Aggregated unique hosts (domains + IPs) with counts/first-last seen |
| POST | /{uuid}/traffic/{event_id}/flag/ | Toggle flagged state on a traffic event |

### Browsers (`/api/v1/browsers/`)

List available browser/OS images.

### Workspaces (`/api/v1/workspaces/`)

CRUD for workspaces, membership (5-role hierarchy), settings, feature flags. `WorkspaceOut` includes a computed `storage_ready` flag (true only when persistent storage is enabled, not DEV_MODE, bucket configured, and access point ARN provisioned).

### Cases (`/api/v1/cases/`)

Case management. Files on a case come in two kinds — uploaded attachments and workspace (S3) file links — unified under `GET /{case_uuid}/files/`. All case file downloads are wrapped in password-protected 7z archives.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | / | List / create cases (create requires `analyst`+) |
| GET/PATCH/DELETE | /{case_uuid}/ | Case detail / update / delete |
| GET/POST | /{case_uuid}/attachments/ | List / upload attachments (50 MB max) |
| DELETE | /{case_uuid}/attachments/{uuid}/ | Delete attachment |
| GET | /{case_uuid}/attachments/{uuid}/download/ | Download attachment as protected 7z |
| GET | /{case_uuid}/files/ | Unified list of attachments + S3 file links |
| POST | /{case_uuid}/file-links/ | Link a workspace S3 file to the case (no copy) |
| DELETE | /{case_uuid}/file-links/{uuid}/ | Unlink (does NOT delete the S3 object) |
| GET | /{case_uuid}/file-links/{uuid}/download/ | Download linked file as protected 7z |

### Files (`/api/v1/files/`)

S3 file explorer for workspace persistent storage. All paths are scoped under the workspace UUID prefix; mutating ops require `member`+ role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /{ws_uuid}/?path= | List files/folders |
| GET | /{ws_uuid}/download/?path= | Stream raw file |
| POST | /{ws_uuid}/upload/?path= | Upload (200 MB max); sha256 stored as S3 metadata |
| DELETE | /{ws_uuid}/?path= | Delete file or recursively delete folder |
| POST | /{ws_uuid}/mkdir/ | Create folder placeholder |
| GET | /{ws_uuid}/hash/?path= | Compute/cache SHA-256 |
| GET | /{ws_uuid}/download-protected/?path= | Download as password-protected 7z (`infected`) |

### Audit (`/api/v1/audit/`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | / | Admin | List/filter audit logs (action, actor_id, target_user_id, q, limit, offset) |

### Notifications (`/api/v1/notifications/`)

In-app notification endpoints + WebSocket.

## Environment Variables

All variables are read via `os.environ` in `backend/backend/settings.py` (the authoritative reference). Real values are written to `docker/.env` by Terraform (`local_file` resource) after `terraform apply`; for local dev, set them in `backend/.env` or your shell. Key variables:

| Variable | Description |
|----------|-------------|
| `DJANGO_SECRET_KEY` | Django secret key |
| `DEBUG` | 1 for development |
| `DEV_MODE` | Bypasses all AWS ECS + Cloudflare calls (fake callback to localhost); also disables S3 Files provisioning |
| `CUSTOM_DOMAIN` | Production domain (used for CORS, cookies, Cloudflare DNS) |
| `DB_*` | PostgreSQL connection settings (`USE_SQLITE=1` to fall back to sqlite) |
| `REDIS_URL` | Redis connection URL (Celery broker + result backend) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS credentials for ECS + S3 |
| `AWS_REGION` | AWS region |
| `SUBNET_ID` / `SECURITY_GROUP_ID` | ECS task networking |
| `ECR_REGISTRY` | ECR registry URL |
| `CF_Token` / `CF_Zone_ID` | Cloudflare API token + Zone ID (aliases `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID`) |
| `DEFAULT_IDLE_THRESHOLD` | Fallback idle timeout in minutes (default 10) |
| `FARGATE_VCPU_PER_HOUR_USD` | Cost per vCPU-hour (default 0.04048) |
| `FARGATE_MEMORY_GB_PER_HOUR_USD` | Cost per GB-hour (default 0.004445) |
| `FARGATE_SPOT_DISCOUNT` | Spot discount applied to compute (default 0.70) |
| `PUBLIC_IPV4_PER_HOUR_USD` | Per-task public IPv4 charge (default 0.005; set 0 if behind NAT) |
| `S3FILES_FILE_SYSTEM_ARN` | S3 Files file system ARN (persistent storage) |
| `S3FILES_FILE_SYSTEM_ID` | S3 Files file system ID |
| `S3FILES_BUCKET_NAME` | S3 Files bucket name (versioned; one prefix per workspace UUID) |
| `AWS_STORAGE_BUCKET_NAME` | Optional S3 bucket for case attachment media (else local filesystem) |
| `VBROWSERS_PATH` | Path to the vbrowsers build contexts (default `/app/vbrowsers`) |
| `OIDC_*` | Optional OIDC/SSO provider config |
| `EMAIL_*` | Optional SMTP config (gated on `EMAIL_ENABLED=1`) |

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
  - OS apps (`kali`, `ubuntu`, `alpine`, `code-server`, `terminal`) use `os_*` values; others use `browser_*`
- **Feature flags**: network logging, file protection, persistent storage (each must be on globally *and* per-workspace to take effect)
- **Defaults**: `default_idle_timeout_minutes`, `default_max_session_duration_hours`

## Workspace Roles

Defined in `workspaces/permissions.py`. Strict hierarchy — each role gains everything below it:

| Role | Rank | Can do |
|------|------|--------|
| `owner` | 4 | Everything + delete workspace / transfer ownership |
| `admin` | 3 | Member management + workspace settings (cannot manage owners) |
| `member` | 2 | S3 storage writes (upload, delete, mkdir) + everything below |
| `analyst` | 1 | Launch sessions, create/edit cases, manage attachments + file links + everything below |
| `viewer` | 0 | Read-only: browse/download files, view cases, comment |

Helpers: `role_at_least()`, `user_role_at_least()`, `require_role()` (raises 404/403). `ALL_ROLES` is the canonical list. Only `owner`/`admin` can invite members or change roles; admins cannot invite or promote to `owner`.

## Persistent Storage (S3 Files)

Files saved to `/config/Downloads` inside a session are backed by AWS S3 Files and persist across sessions in the same workspace.

- **Provisioning**: each non-personal workspace gets its own S3 Files access point, rooted at `/<workspace.uuid>/` with POSIX user 1000:1000. Provisioned automatically by `workspaces/signals.py` on workspace creation; retry existing workspaces with `python manage.py backfill_access_points` (`--dry-run`, `--verify`).
- **Service layer**: `workspaces/services.py` — `provision_access_point()`, `deprovision_access_point()` (best-effort, never blocks deletion), `_purge_s3files_prefix()` (deletes all object versions + delete markers).
- **Mounting at launch**: `start.py` resolves (or registers) a per-`(browser, workspace)` task definition that adds an `s3filesVolumeConfiguration` volume + a `/config/Downloads` mount point. Personal workspaces and `DEV_MODE` are skipped.
- **File explorer API**: `files/api.py` proxies all S3 ops through Django after workspace-membership auth. Mutating ops require `member`+. Uploads compute sha256 and store it as S3 object metadata; `hash/` endpoint returns the cached digest or computes+caches on demand.
- **Deprovisioning**: on workspace delete, `pre_delete` signal deletes the access point and purges all versions under the workspace prefix. Best-effort.

## Audit Log

`audit/models.py:AuditLog` records actor, action (dot-namespaced, e.g. `user.create`), target_user, client IP, and arbitrary JSON metadata. Append-only, admin-only read via `/api/v1/audit/`.

`audit/services.py:log_audit(request, action, target_user=None, **metadata)` is the single entry point — called from `users`, `workspaces`, `sessions`, `cases`, and `files` apps. All file, session, workspace, user, API-key, site-settings, and case actions (including protected downloads and file-link create/delete/download) are audited.

## Session Lifecycle (`start.py`)

1. Fetch `SiteSettings` resource overrides (browser vs OS tier)
2. Resolve task definition: per-workspace storage task def when `persistent_storage` is on, else the standard `ovb-{browser}` family
3. Run `ecs.run_task()` with `overrides` for cpu/memory + environment (UUID, session token, idle threshold, traffic-log/file-protection/persistent-storage flags)
4. Container boots and POSTs back to `/api/v1/sessions/{uuid}/callback/` with its public IP
5. Callback handler moves the session to active and enqueues a Celery task that calls `sessions/cloudflare.py:upsert_a_record()` — create-or-update the Cloudflare A record `browser-{hash}.{CUSTOM_DOMAIN}`
6. On stop: `delete.py` deletes the DNS record, stops the ECS task; `sessions/services.py:compute_session_cost()` records cost from the running task object (bills from `date_created`, 60s minimum, includes public IPv4 charge, Spot discount on compute only)

> DNS upsert now happens **backend-side** on the callback (Celery). The old per-container `1-app.sh` startup scripts were removed in commit `f7d1a81`; `build_browsers.sh` injects CF/domain values at build time only.

`DEV_MODE=1` stubs all of this: `start.py:_dev_run_browser_task()` POSTs a fake callback to localhost so every UI state can be exercised without AWS; retry with `python manage.py fake_callback <uuid>`.

## Limit Resolution (`sessions/services.py`)

Single source of truth shared by the enforcement loop (`close_containers.py`) and the session-detail API so the client countdown always agrees with the server:

- `get_idle_threshold(container, site_settings)` → UserLimit → Workspace → SiteSettings → `DEFAULT_IDLE_THRESHOLD`
- `get_max_duration(container, site_settings)` → UserLimit → Workspace → SiteSettings → None (no cap)
- `compute_session_cost(container)` → vCPU + memory + public IPv4, with Spot discount on compute only

## Infrastructure Notes

- **AWS provider**: `~> 6.0` (locked at 6.55.0) — use `.region` not `.name` on `data.aws_region`
- **`DEV_MODE=1`** bypasses all AWS ECS, Cloudflare, and S3 Files calls — useful for local UI work (`USE_SQLITE=1` avoids needing Postgres too)
- **`docker-compose.traefik.yml`** is the production compose; `env_file: .env` (relative to `docker/` dir)
- **`docker/.env`** is written by Terraform `local_file` resource after `terraform apply`
- **`setup.sh`** is first-time provisioning only — does `terraform apply` + `docker compose build --no-cache` + `up -d`
- **Redeploying code changes**: `docker compose build --no-cache && docker compose up -d --force-recreate`
- **`docker compose restart`** does NOT re-read `.env` — must use `--force-recreate`
- **`*.tfvars` and `*.tfstate*`** are gitignored — never commit them
- **Management commands**: `start`, `close_containers`, `delete`, `fake_callback` (sessions); `backfill_access_points` (workspaces); `seed_dev_data` (cases)

## Secrets / Credentials Policy

- `terraform/terraform.tfvars` — gitignored; use `terraform.tfvars.example` as template
- `terraform/terraform.tfstate` / `.backup` — gitignored; contain plaintext AWS keys + Django secret
- `docker/.env` — gitignored; written by Terraform
- `backend/.env` — gitignored; set values per `backend/backend/settings.py` (see Dev Quick-Start)
- `frontend/.env.local` — gitignored; copy from `example.env.local`
- `docker/vbrowsers/*` — per-browser build contexts; real Cloudflare/domain values are injected at build time by `build_browsers.sh`. The old `1-app.sh` scripts (which held placeholders) were removed when DNS upsert moved to the backend.

## Dev Quick-Start

1. `cd backend` — create a `.env` (or export in your shell) with `DEV_MODE=1`, `USE_SQLITE=1`, `DEBUG=1`, plus `DJANGO_SECRET_KEY` and `CF_Token`/`CF_Zone_ID`/`CUSTOM_DOMAIN` placeholders
2. `python -m venv venv && source venv/bin/activate && pip install -r requirements.txt`
3. `python manage.py migrate && python manage.py createsuperuser`
4. `python manage.py runserver` — backend on :8000
5. `cd ../frontend && cp example.env.local .env.local && npm install && npm run dev` — frontend on :3000

Sessions launched in DEV_MODE POST a fake callback to localhost; the session viewer won't connect but every list/detail/history state is exercisable.
