import logging

from celery import shared_task
from django.utils import timezone
from django.core.management import call_command

logger = logging.getLogger(__name__)


@shared_task
def start_container(uuid, browser_type, auto_open_url, username, session_type,
                    enable_traffic_log=False, file_protection=False,
                    idle_timeout_minutes=None, persistent_storage=False):
    call_command(
        'start',
        browser_type=browser_type,
        uuid=uuid,
        auto_open_url=auto_open_url,
        username=username,
        session_type=session_type,
        enable_traffic_log=enable_traffic_log,
        file_protection=file_protection,
        idle_timeout_minutes=idle_timeout_minutes,
        persistent_storage=persistent_storage,
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

    now = timezone.now()

    try:
        oc = OpenContainers.objects.get(container=container)
        if not oc.closed_at:
            oc.closed_at = now
            oc.save(update_fields=['closed_at'])
    except OpenContainers.DoesNotExist:
        pass

    container.active = False
    if not container.closed_at:
        container.closed_at = now

    # Compute estimated cost before saving.
    container.session_cost_usd = compute_session_cost(container)
    container.save(update_fields=['active', 'closed_at', 'session_cost_usd'])

    call_command('delete', task_arn=task_arn, public_ip=ip_address)


@shared_task
def delete_dns_record(task_arn: str, public_ip: str):
    """
    DNS-only cleanup for containers whose ECS task has already stopped.

    Called by _reconcile_close instead of a blocking call_command() so that
    Cloudflare HTTP requests (with retries) happen asynchronously in a Celery
    worker rather than blocking the close_containers management command. (#3)
    """
    call_command('delete', task_arn=task_arn, public_ip=public_ip, skip_ecs_stop=True)


@shared_task
def run_close_containers():
    try:
        call_command('close_containers')
    except Exception:
        logger.exception("close_containers management command raised an exception")  # (#6)
