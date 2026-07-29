import requests
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from sessions.cloudflare import (
    CF_API_BASE,
    CloudflareError,
    _cf_request,
    get_credentials,
)

DEV_MODE = getattr(settings, 'DEV_MODE', False)

if not DEV_MODE:
    import boto3
    ecs_client = boto3.client('ecs', region_name=settings.AWS_REGION)

cluster = 'ovb-browsers'


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

            cf_token, cf_zone = get_credentials()
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
