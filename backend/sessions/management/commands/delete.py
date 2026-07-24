import time

import requests
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

DEV_MODE = getattr(settings, 'DEV_MODE', False)

if not DEV_MODE:
    import boto3
    ecs_client = boto3.client('ecs', region_name=settings.AWS_REGION)
    cf_token = settings.CLOUDFLARE_API_TOKEN
    cf_zone = settings.CLOUDFLARE_ZONE_ID

cluster = 'ovb-browsers'
CF_API_BASE = 'https://api.cloudflare.com/client/v4'

# Cloudflare request settings (#7)
CF_TIMEOUT_SECONDS = 10
CF_MAX_RETRIES = 3
CF_RETRY_BACKOFF_SECONDS = 2  # doubles each attempt: 2s, 4s


class CloudflareError(Exception):
    """Raised when the Cloudflare API returns success:false in the response body."""


def _cf_request(method, url, *, headers, params=None, max_retries=CF_MAX_RETRIES):
    """
    Thin wrapper around requests that adds a timeout and exponential-backoff
    retry for transient Cloudflare API failures.

    Retry policy:
    - Network/timeout errors: always retry.
    - HTTP 5xx and 429 (rate-limit): retry — these are transient server-side.
    - HTTP 4xx (except 429): do NOT retry — these are permanent caller errors
      (bad token, record not found, etc.) that won't be fixed by retrying. (#1)

    After a successful HTTP response, the Cloudflare JSON envelope is checked.
    If success:false is present a CloudflareError is raised immediately so the
    caller sees a meaningful error rather than silently accepting a failure. (#2)

    Raises:
        requests.RequestException  — network/timeout failure after all retries
        requests.HTTPError         — permanent HTTP 4xx (not retried)
        CloudflareError            — HTTP 2xx but success:false in JSON body
    """
    backoff = CF_RETRY_BACKOFF_SECONDS
    last_exc = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.request(
                method, url,
                headers=headers,
                params=params,
                timeout=CF_TIMEOUT_SECONDS,
            )

            # Permanent 4xx — raise immediately, no retry. (#1)
            if 400 <= resp.status_code < 500 and resp.status_code != 429:
                resp.raise_for_status()

            # Transient 5xx or 429 — treat like a network error and retry.
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError(
                    f"Transient HTTP {resp.status_code}", response=resp
                )

            # 2xx — check the Cloudflare envelope. (#2)
            try:
                body = resp.json()
            except ValueError:
                # Non-JSON 2xx: return the raw response and let the caller handle it.
                return resp

            if not body.get('success', True):
                errors = body.get('errors', [])
                raise CloudflareError(
                    f"Cloudflare API error (success:false): {errors}"
                )

            return resp

        except CloudflareError:
            # success:false is a permanent semantic error — never retry it.
            raise
        except requests.RequestException as exc:
            # Don't retry permanent 4xx (they'll be HTTPError with a 4xx response).
            if isinstance(exc, requests.HTTPError) and exc.response is not None:
                if 400 <= exc.response.status_code < 500 and exc.response.status_code != 429:
                    raise
            last_exc = exc
            if attempt < max_retries:
                time.sleep(backoff)
                backoff *= 2

    # last_exc is always set here because max_retries >= 1 and every loop
    # iteration either returns or assigns last_exc before continuing.
    # The assertion keeps this invariant explicit and satisfies type checkers.
    assert last_exc is not None
    raise last_exc


class Command(BaseCommand):
    help = 'Stops ECS task (optionally) and deletes Cloudflare DNS A record'

    def add_arguments(self, parser):
        parser.add_argument('--task-arn', required=True, help='ECS Task ARN')
        parser.add_argument('--public-ip', required=True, help='Public IP of the ECS task')
        parser.add_argument(
            '--skip-ecs-stop',
            action='store_true',
            default=False,
            help='Skip the ecs:StopTask call (use when the task is already stopped)',
        )

    def handle(self, *args, **options):
        task_arn = options['task_arn']
        public_ip = options['public_ip']
        skip_ecs_stop = options['skip_ecs_stop']

        if DEV_MODE:
            self.stdout.write(self.style.WARNING(
                f"[DEV_MODE] Skipping ECS stop and Cloudflare DNS delete "
                f"(task_arn={task_arn}, public_ip={public_ip})"
            ))
            return

        try:
            # ── Stop ECS task ─────────────────────────────────────────────────
            if skip_ecs_stop:
                self.stdout.write(f"Skipping ECS stop for {task_arn} (task already stopped)")
            else:
                try:
                    ecs_client.stop_task(
                        cluster=cluster,
                        task=task_arn,
                        reason='Task stopped by management command'
                    )
                    self.stdout.write(f"ECS stop_task issued for {task_arn}")
                    # stop_task is fire-and-forget for our purposes — ECS will stop
                    # the task regardless of whether we wait. Skipping the waiter
                    # avoids blocking the Celery worker for up to 10 minutes on a
                    # slow stop. (#8)
                except Exception as e:
                    self.stderr.write(f"Error stopping ECS Task: {str(e)}")

            # ── Delete Cloudflare A record ────────────────────────────────────
            if not public_ip or public_ip in ('None', ''):
                self.stdout.write("No public IP — skipping Cloudflare DNS cleanup")
                return

            headers = {
                'Authorization': f'Bearer {cf_token}',
                'Content-Type': 'application/json',
            }
            params = {
                'type': 'A',
                'content': public_ip,
                'per_page': 100,
            }
            list_url = f"{CF_API_BASE}/zones/{cf_zone}/dns_records"
            self.stdout.write(f"Looking for Cloudflare A-records with IP {public_ip}…")

            try:
                r = _cf_request('GET', list_url, headers=headers, params=params)
            except (requests.RequestException, CloudflareError) as exc:
                raise CommandError(f"Cloudflare list request failed: {exc}")

            records = r.json().get('result', [])
            if not records:
                self.stdout.write("No matching DNS records found.")
            else:
                for rec in records:
                    rec_id = rec['id']
                    name = rec['name']
                    del_url = f"{CF_API_BASE}/zones/{cf_zone}/dns_records/{rec_id}"
                    try:
                        _cf_request('DELETE', del_url, headers=headers)
                        self.stdout.write(self.style.SUCCESS(
                            f"Deleted DNS record: {name} → {public_ip}"
                        ))
                    except (requests.RequestException, CloudflareError) as exc:
                        self.stderr.write(
                            f"Cloudflare DELETE failed for {name}: {exc}"
                        )

            self.stdout.write(self.style.SUCCESS("delete command completed."))

        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Operation failed: {str(e)}"))
