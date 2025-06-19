from celery import shared_task
from .models import *
from django.core.management import call_command

@shared_task
def start_container(uuid, browser_type, auto_open_url, username, session_type):
    call_command('start', browser_type=browser_type, uuid=uuid, auto_open_url=auto_open_url, username=username, session_type=session_type)


@shared_task
def delete_container(uuid):
    container = Container.objects.get(uuid=uuid)
    ip_address = str(container.ip_address)
    task_arn = str(container.task_arn)
    oc = OpenContainers.objects.get(container=container)
    oc.closed_at = timezone.now()
    oc.save()
    container.active = False
    if container.closed_at is None or container.closed_at == '':
        container.closed_at = timezone.now()
    container.save()
    call_command('delete', task_arn=task_arn, public_ip=ip_address)

@shared_task
def run_close_containers():
    try:
        call_command('close_containers')
    except Exception as e:
        print(f"Error occurred while running management command: {e}")