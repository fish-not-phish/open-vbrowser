from django.core.management.base import BaseCommand
from main.models import Container, OpenContainers
from django.utils import timezone
import datetime
from main.tasks import *
from django.conf import settings

class Command(BaseCommand):
    def handle(self, *args, **options):
        print('running')
        now = timezone.now()
        active_containers = Container.objects.filter(active=True)
        containers_without_user_and_not_active = Container.objects.filter(user__isnull=True, active=False)

        # Self-heal: Identify containers without a start time older than 5 minutes
        stale_containers = Container.objects.filter(
            date_created__lte=now - datetime.timedelta(minutes=5),
            start_time__isnull=True
        )

        for container in stale_containers:
            print(f"Self-healing container: {container.uuid}")

            # Dispatch task to delete the container
            delete_container.delay(str(container.uuid))
            print(f"Deleted stale container task dispatched: {container.uuid}")

            # Delete the container instance
            container.delete()
            print(f"Deleted container instance from database: {container.uuid}")

        # Delete the found containers
        deleted_count, _ = containers_without_user_and_not_active.delete()
        threshold_minutes = int(settings.DEFAULT_IDLE_THRESHOLD)
        cutoff = now - datetime.timedelta(minutes=threshold_minutes)

        open_containers = OpenContainers.objects.filter(
            last_ping_at__lte=cutoff,
            container__active=True
        )

        for open_container in open_containers:
            container = open_container.container

            # skip API-session containers
            if container.name == "api_session":
                continue

            print(f"AFK Stop: {container.subdomain} (last_ping at {open_container.last_ping_at})")
            delete_container.delay(str(container.uuid))

            container.active = False
            container.closed_at = timezone.now()
            container.save()

            open_container.closed_at = timezone.now()
            open_container.save()
            print(f"  → marked inactive and closed at {container.closed_at}")

                    
        
