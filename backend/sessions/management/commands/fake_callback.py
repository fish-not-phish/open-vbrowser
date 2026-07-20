"""
Management command: fake_callback

Simulates the ECS task callback for a pending session so you can test the
full session lifecycle locally without any real AWS infrastructure.

Usage:
    python manage.py fake_callback <uuid>
    python manage.py fake_callback <uuid> --url http://localhost:8000

What it does:
  1. Looks up the Container by UUID.
  2. Fills in fake IP / task ARN / vCPU / memory values.
  3. Calls the callback handler directly (in-process, no HTTP needed) OR
     POSTs to the callback endpoint if --url is supplied.
"""
import uuid as _uuid
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = 'Simulate the ECS container callback for a pending session (dev/test only)'

    def add_arguments(self, parser):
        parser.add_argument('session_uuid', help='UUID of the pending Container record')
        parser.add_argument(
            '--url',
            default=None,
            help='POST to this base URL instead of calling in-process '
                 '(e.g. http://localhost:8000).  Useful when the worker is '
                 'running in a separate process/container.',
        )
        parser.add_argument('--ip', default='127.0.0.1', help='Fake public IP (default: 127.0.0.1)')
        parser.add_argument('--vcpu', default='0.25', help='Fake vCPU value (default: 0.25)')
        parser.add_argument('--memory-gb', default='0.5', help='Fake memory in GB (default: 0.5)')

    def handle(self, *args, **options):
        from sessions.models import Container, OpenContainers
        from django.conf import settings

        session_uuid = options['session_uuid']
        fake_ip = options['ip']
        vcpu_val = Decimal(options['vcpu'])
        mem_val = Decimal(options['memory_gb'])
        fake_arn = f'arn:aws:ecs:us-east-1:000000000000:task/vbrowsers/fake{_uuid.uuid4().hex[:8]}'

        try:
            container = Container.objects.get(uuid=session_uuid)
        except Container.DoesNotExist:
            raise CommandError(f"No Container found with uuid={session_uuid}")

        if options['url']:
            # HTTP POST path — useful for docker-compose where the worker and
            # server are separate containers.
            import requests
            callback_url = f"{options['url'].rstrip('/')}/api/v1/sessions/{session_uuid}/callback/"
            payload = {
                'uuid': session_uuid,
                'public_ip': fake_ip,
                'private_ip': fake_ip,
                'task_arn': fake_arn,
                'capacity_provider': 'DEV',
                'vcpu': float(vcpu_val),
                'memory_gb': float(mem_val),
            }
            self.stdout.write(f"POSTing fake callback to {callback_url} …")
            resp = requests.post(callback_url, json=payload, timeout=10)
            if resp.ok:
                self.stdout.write(self.style.SUCCESS(f"OK: {resp.json()}"))
            else:
                raise CommandError(f"Callback returned {resp.status_code}: {resp.text}")
        else:
            # In-process path — fastest for single-process dev (runserver).
            import hashlib
            subdomain_hash = hashlib.md5(str(container.uuid).encode()).hexdigest()
            domain = getattr(settings, 'CUSTOM_DOMAIN', 'localhost')
            subdomain = f"browser-{subdomain_hash}.{domain}"
            container_url = f"https://{subdomain}/?token={container.session_token}"

            container.ip_address = fake_ip
            container.private_ip = fake_ip
            container.task_arn = fake_arn
            container.capacity_provider = 'DEV'
            container.subdomain = subdomain
            container.container_url = container_url
            container.url = container_url
            container.start_time = timezone.now()
            container.vcpu = vcpu_val
            container.memory_gb = mem_val
            container.active = True
            container.save()

            OpenContainers.objects.get_or_create(
                container=container,
                defaults={'container_uuid': str(container.uuid)},
            )

            self.stdout.write(self.style.SUCCESS(
                f"Session {session_uuid} marked active.\n"
                f"  container_url: {container_url}\n"
                f"  fake_ip:       {fake_ip}\n"
                f"  task_arn:      {fake_arn}"
            ))
