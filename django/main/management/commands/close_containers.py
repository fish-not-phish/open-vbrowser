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

        # Self-heal: Identify containers without a start time older than 3 minutes
        stale_containers = Container.objects.filter(
            date_created__lte=now - datetime.timedelta(minutes=3),
            start_time__isnull=True
        ).exclude(type="remnux")

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
        if active_containers:
            # Calculate threshold for each subscription tier
            threshold = settings.DEFAULT_IDLE_THRESHOLD
            default_threshold = now - datetime.timedelta(minutes=int(threshold))

            # Stop containers for users who have exceeded their last ping threshold
            open_containers = OpenContainers.objects.filter(
                last_ping_at__lte=default_threshold,
                container__active=True
            )

            for open_container in open_containers:
                container = open_container.container
                if container.name == "api_session" or container.type == "remnux":
                    continue

                if open_container.last_ping_at <= default_threshold:
                    delete_container.delay(str(container.uuid))
                    container.active = False
                    container.closed_at = timezone.now()
                    container.save()
                    open_container.closed_at = timezone.now()
                    open_container.save()
                    print(f'AFK Stop {container.subdomain}...')
                        

            for container in active_containers:
                time_difference = now - container.start_time
                if container.type == "remnux":
                    continue

                if time_difference > datetime.timedelta(minutes=int(threshold)):
                    delete_container.delay(str(container.uuid))

                    container.active = False
                    container.closed_at = timezone.now()
                    container.save()
                    open_container = OpenContainers.objects.get(container=container)
                    open_container.closed_at = timezone.now()
                    open_container.save()
                    print(f'Max Time Limit Stop {container.subdomain}...')
                


                    
        
