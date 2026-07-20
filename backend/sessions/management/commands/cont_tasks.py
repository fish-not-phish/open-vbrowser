"""
One-time helper: creates the Celery Beat PeriodicTask for run_close_containers
if it doesn't already exist.

This is superseded by the data migration in sessions/migrations but kept for
manual use (e.g. after a flush).

Usage:
    python manage.py cont_tasks
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Creates the Celery Beat PeriodicTask for run_close_containers"

    def handle(self, *args, **options):
        from django_celery_beat.models import PeriodicTask, IntervalSchedule

        schedule, created = IntervalSchedule.objects.get_or_create(
            every=60,
            period=IntervalSchedule.SECONDS,
        )
        task, created = PeriodicTask.objects.get_or_create(
            name='run-close-containers-every-minute',
            defaults={
                'task': 'sessions.tasks.run_close_containers',
                'interval': schedule,
                'enabled': True,
            }
        )
        if not created:
            task.task = 'sessions.tasks.run_close_containers'
            task.interval = schedule
            task.enabled = True
            task.save()

        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created else 'Updated'} PeriodicTask: {task.name}"
        ))
