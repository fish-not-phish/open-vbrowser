from celery import shared_task
from django.utils import timezone
from django.core.management import call_command


@shared_task
def start_container(uuid, browser_type, auto_open_url, username, session_type,
                    enable_traffic_log=False, file_protection=False):
    call_command(
        'start',
        browser_type=browser_type,
        uuid=uuid,
        auto_open_url=auto_open_url,
        username=username,
        session_type=session_type,
        enable_traffic_log=enable_traffic_log,
        file_protection=file_protection,
    )


@shared_task
def delete_container(uuid):
    from .models import Container, OpenContainers
    from .services import compute_session_cost

    try:
        container = Container.objects.get(uuid=uuid)
    except Container.DoesNotExist:
        return  # already deleted or never existed — nothing to do

    ip_address = str(container.ip_address)
    task_arn = str(container.task_arn)

    try:
        oc = OpenContainers.objects.get(container=container)
        oc.closed_at = timezone.now()
        oc.save()
    except OpenContainers.DoesNotExist:
        pass

    container.active = False
    if container.closed_at is None or container.closed_at == '':
        container.closed_at = timezone.now()

    # Compute estimated cost before saving
    container.session_cost_usd = compute_session_cost(container)
    container.save()

    call_command('delete', task_arn=task_arn, public_ip=ip_address)


@shared_task
def run_close_containers():
    try:
        call_command('close_containers')
    except Exception as e:
        print(f"Error occurred while running management command: {e}")
