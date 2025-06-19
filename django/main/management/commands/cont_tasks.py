from django_celery_beat.models import PeriodicTask, IntervalSchedule
from django.utils.timezone import now
from django.core.management.base import BaseCommand

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        interval, created = IntervalSchedule.objects.get_or_create(
            every=5,
            period=IntervalSchedule.SECONDS,
        )

        task, created = PeriodicTask.objects.get_or_create(
            name='CloseContainersEvery5Seconds',  
            defaults={
                'interval': interval, 
                'task': 'main.tasks.run_close_containers', 
            }
        )

        if created:
            self.stdout.write(self.style.SUCCESS('Task scheduled to run every 5 seconds.'))
        else:
            self.stdout.write(self.style.WARNING('Task already exists and was not updated.'))
