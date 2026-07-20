from django.core.management.base import BaseCommand
from sessions.models import Container, OpenContainers
from django.utils import timezone
import datetime
from django.conf import settings


def get_idle_threshold(container):
    """
    Resolve the idle timeout for a container.
    Resolution order: UserLimit (most specific) → Workspace → SiteSettings default.
    Falls back to DEFAULT_IDLE_THRESHOLD env var if no SiteSettings row exists.
    """
    from users.models import SiteSettings, UserLimit

    # 1. Per-user limit
    if container.user:
        try:
            ul = container.user.limits
            if ul.idle_timeout_minutes is not None:
                return ul.idle_timeout_minutes
        except UserLimit.DoesNotExist:
            pass

    # 2. Workspace limit
    if container.workspace and container.workspace.idle_timeout_minutes is not None:
        return container.workspace.idle_timeout_minutes

    # 3. Site default
    try:
        site = SiteSettings.get()
        return site.default_idle_timeout_minutes
    except Exception:
        pass

    # 4. Env var fallback
    return int(getattr(settings, 'DEFAULT_IDLE_THRESHOLD', 10))


def get_max_duration(container):
    """
    Resolve the hard session duration cap (in hours).
    Returns None if no cap is set.
    """
    from users.models import SiteSettings, UserLimit

    if container.user:
        try:
            ul = container.user.limits
            if ul.max_session_duration_hours is not None:
                return ul.max_session_duration_hours
        except UserLimit.DoesNotExist:
            pass

    if container.workspace and container.workspace.idle_timeout_minutes is not None:
        # workspace doesn't store max_duration directly, skip
        pass

    try:
        site = SiteSettings.get()
        return site.default_max_session_duration_hours
    except Exception:
        return None


class Command(BaseCommand):
    help = "Close idle / stale / over-cap containers"

    def handle(self, *args, **options):
        from sessions.tasks import delete_container

        print('running close_containers')
        now = timezone.now()

        # --- Self-heal: containers without a start_time older than 5 minutes ---
        stale_containers = Container.objects.filter(
            date_created__lte=now - datetime.timedelta(minutes=5),
            start_time__isnull=True
        )
        for container in stale_containers:
            print(f"Self-healing stale container: {container.uuid}")
            delete_container.delay(str(container.uuid))
            container.delete()

        # --- Clean up orphaned containers (no user, inactive) ---
        containers_without_user_and_not_active = Container.objects.filter(
            user__isnull=True, active=False
        )
        deleted_count, _ = containers_without_user_and_not_active.delete()
        if deleted_count:
            print(f"Deleted {deleted_count} orphaned inactive containers")

        # --- AFK idle-timeout enforcement ---
        active_containers = Container.objects.filter(active=True).select_related(
            'user', 'workspace'
        )
        for container in active_containers:
            # Skip API-session containers
            if container.name == "api_session":
                continue

            # Check idle timeout via OpenContainers
            try:
                oc = OpenContainers.objects.get(container=container)
            except OpenContainers.DoesNotExist:
                continue

            threshold_minutes = get_idle_threshold(container)
            cutoff = now - datetime.timedelta(minutes=threshold_minutes)

            if oc.last_ping_at <= cutoff:
                print(f"AFK Stop (idle): {container.subdomain} (last_ping at {oc.last_ping_at})")
                delete_container.delay(str(container.uuid))
                container.active = False
                container.closed_at = now
                container.save()
                oc.closed_at = now
                oc.save()
                continue

            # Check hard session duration cap
            max_hours = get_max_duration(container)
            if max_hours and container.start_time:
                hard_cutoff = container.start_time + datetime.timedelta(hours=max_hours)
                if now >= hard_cutoff:
                    print(f"Hard-cap Stop: {container.subdomain} (started {container.start_time}, cap {max_hours}h)")
                    delete_container.delay(str(container.uuid))
                    container.active = False
                    container.closed_at = now
                    container.save()
                    oc.closed_at = now
                    oc.save()
