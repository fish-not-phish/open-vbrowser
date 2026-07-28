import datetime

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from django.db.models import Prefetch

from sessions.models import Container, OpenContainers
from sessions.services import get_idle_threshold, get_max_duration

DEV_MODE = getattr(settings, 'DEV_MODE', False)

# ECS DescribeTasks accepts up to 100 ARNs per call.
ECS_DESCRIBE_BATCH = 100
CLUSTER_NAME = 'ovb-browsers'

# Grace period before a stale-closed (active=False, start_time=None) container
# is hard-deleted. Gives delete_container enough time to run ECS stop + DNS
# cleanup before the row disappears from under it. (#4)
STALE_CLOSED_GRACE_MINUTES = 10


def _close_container(container, oc, now, reason, stdout):
    """
    Enqueue a container for teardown (ECS stop + DNS delete + cost recording).

    Sets active=False immediately with update_fields so that the next
    close_containers run won't see this container as active and enqueue it a
    second time before the Celery task has had a chance to execute.

    closed_at is also set now so compute_session_cost in delete_container has
    an accurate timestamp to work with.

    Does NOT compute or write session_cost_usd here — that stays in the Celery
    task where it belongs, after active/closed_at are already committed.
    """
    from sessions.tasks import delete_container

    stdout.write(
        f"  [{reason}] closing {container.subdomain or container.uuid} "
        f"(task_arn={container.task_arn})"
    )

    container.active = False
    container.closed_at = now
    container.save(update_fields=['active', 'closed_at'])

    if oc is not None:
        oc.closed_at = now
        oc.save(update_fields=['closed_at'])

    # Enqueue the full teardown (ECS stop + DNS delete + cost + DB update).
    delete_container.delay(str(container.uuid))


class Command(BaseCommand):
    help = "Close idle / stale / over-cap / externally-stopped containers"

    def handle(self, *args, **options):
        self.stdout.write("running close_containers")
        now = timezone.now()

        # ── 1. Self-heal: containers without a start_time older than 5 min ────
        # These never received a callback from ECS so they never started.
        # active=True filter: already-closed ones are handled by the orphan pass below.
        stale_qs = Container.objects.filter(
            date_created__lte=now - datetime.timedelta(minutes=5),
            start_time__isnull=True,
            active=True,
        )
        for container in stale_qs:
            self.stdout.write(
                f"  [stale] {container.uuid} never received callback, enqueueing teardown"
            )
            _close_container(container, oc=None, now=now, reason="stale", stdout=self.stdout)

        # ── 2. Clean up orphaned/leaked inactive containers ───────────────────
        # (a) No user + inactive: created but never assigned.
        deleted_a, _ = Container.objects.filter(user__isnull=True, active=False).delete()
        if deleted_a:
            self.stdout.write(f"  [orphan] deleted {deleted_a} inactive containers with no user")

        # (b) Has a user, inactive, start_time still null: session was closed but
        #     never properly started — no ECS task to stop, no DNS record to clean up.
        #
        #     Grace period: only delete rows whose closed_at is older than
        #     STALE_CLOSED_GRACE_MINUTES. This avoids racing with delete_container
        #     Celery tasks that were just enqueued by pass 1 this same run. (#4)
        grace_cutoff = now - datetime.timedelta(minutes=STALE_CLOSED_GRACE_MINUTES)
        deleted_b, _ = Container.objects.filter(
            user__isnull=False,
            active=False,
            start_time__isnull=True,
            closed_at__lte=grace_cutoff,
        ).delete()
        if deleted_b:
            self.stdout.write(
                f"  [orphan] deleted {deleted_b} inactive containers with null start_time"
            )

        # ── 3. ECS reconciliation: detect tasks stopped outside OVB ───────────
        # Spot interruptions, OOM kills, manual console stops, etc. all produce
        # ECS tasks that are STOPPED while our DB still says active=True.
        # We batch-describe up to ECS_DESCRIBE_BATCH ARNs per API call.
        #
        # Track UUIDs closed here so the idle-timeout loop below can skip them
        # without re-querying the DB. (#5)
        reconciled_uuids: set[str] = set()
        if not DEV_MODE:
            reconciled_uuids = self._reconcile_ecs(now)

        # ── 4. Pre-fetch SiteSettings once for the whole loop (#2) ────────────
        try:
            from users.models import SiteSettings
            site_settings = SiteSettings.get()
        except Exception:
            site_settings = None

        # ── 5. AFK idle-timeout + hard-cap enforcement ────────────────────────
        # Prefetch only the active (not-yet-closed) OpenContainers row for each
        # container, ordered newest-first so oc_list[0] is always the current
        # heartbeat record even if stale closed rows exist. (#5)
        # Using Prefetch with a filtered queryset rather than bare prefetch_related
        # so we don't pull in closed rows and risk picking the wrong one.
        active_oc_prefetch = Prefetch(
            'opencontainers_set',
            queryset=OpenContainers.objects.filter(
                closed_at__isnull=True
            ).order_by('-opened_at'),
            to_attr='active_oc_list',
        )

        # Re-fetch active containers after reconcile so the queryset only sees
        # containers still genuinely active. Prefetch OpenContainers in the same
        # query to eliminate the per-container N+1. (#3, #5)
        active_containers = (
            Container.objects
            .filter(active=True)
            .select_related('user', 'workspace', 'user__limits')
            .prefetch_related(active_oc_prefetch)
        )
        for container in active_containers:
            # Skip containers just closed by the ECS reconciler this run.
            if str(container.uuid) in reconciled_uuids:
                continue

            # api_session containers are not browser sessions; skip them.
            if container.name == "api_session":
                continue

            # active_oc_list is populated by the Prefetch above — no extra query.
            if not container.active_oc_list:
                # No active heartbeat record — can't evaluate idle timeout.
                continue
            oc = container.active_oc_list[0]

            threshold_minutes = get_idle_threshold(container, site_settings)
            cutoff = now - datetime.timedelta(minutes=threshold_minutes)

            if oc.last_ping_at <= cutoff:
                _close_container(container, oc, now, reason="idle", stdout=self.stdout)
                continue

            # Hard session duration cap
            max_hours = get_max_duration(container, site_settings)
            if max_hours and container.start_time:
                hard_cutoff = container.start_time + datetime.timedelta(hours=max_hours)
                if now >= hard_cutoff:
                    _close_container(container, oc, now, reason="hard-cap", stdout=self.stdout)

    # ── ECS reconciliation helpers ──────────────────────────────────────────────

    def _reconcile_ecs(self, now) -> set[str]:
        """
        Fetch all active containers that have a task_arn, describe them in
        batches via boto3, and close any whose ECS task has reached a terminal
        state (STOPPED).

        Returns the set of container UUID strings that were closed, so the
        caller can skip them in subsequent processing. (#5)

        ECS task lifecycle states:
          PROVISIONING → PENDING → ACTIVATING → RUNNING
            → DEACTIVATING → STOPPING → DEPROVISIONING → STOPPED

        We only act on STOPPED tasks (confirmed dead) or ARNs that ECS no
        longer knows about at all (purged from history after ~1 hour).
        Transient startup states (PROVISIONING, PENDING, ACTIVATING) and
        shutdown states (DEACTIVATING, STOPPING, DEPROVISIONING) are left alone
        — the task is either still starting or already in the process of stopping.
        """
        import boto3

        # ECS terminal state — the only status that means the task is truly dead.
        TERMINAL_STATUS = 'STOPPED'

        # Transient states that must never trigger a close.
        TRANSIENT_STATES = frozenset({
            'PROVISIONING', 'PENDING', 'ACTIVATING',
            'DEACTIVATING', 'STOPPING', 'DEPROVISIONING',
        })

        closed_uuids: set[str] = set()

        ecs = boto3.client('ecs', region_name=settings.AWS_REGION)

        # Only containers that have a task ARN (i.e. made it past the callback).
        candidates = list(
            Container.objects
            .filter(active=True, task_arn__isnull=False)
            .exclude(task_arn='')
            .select_related('user', 'workspace')
        )

        if not candidates:
            return closed_uuids

        # Build ARN → container map for quick lookup.
        arn_map = {str(c.task_arn): c for c in candidates}
        arns = list(arn_map.keys())

        self.stdout.write(f"  [ecs-reconcile] checking {len(arns)} active task(s) against ECS")

        # Batch into groups of ECS_DESCRIBE_BATCH.
        # We build a set of ARNs accounted for in this run so we can identify
        # those completely absent from ECS responses after all batches finish.
        seen_arns: set[str] = set()

        for i in range(0, len(arns), ECS_DESCRIBE_BATCH):
            batch_arns = arns[i: i + ECS_DESCRIBE_BATCH]
            try:
                resp = ecs.describe_tasks(cluster=CLUSTER_NAME, tasks=batch_arns)
            except Exception as exc:
                self.stderr.write(f"  [ecs-reconcile] describe_tasks failed: {exc}")
                # Skip this batch entirely — don't close containers on API error.
                seen_arns.update(batch_arns)  # treat as accounted for to avoid false positives
                continue

            for task in resp.get('tasks', []):
                task_arn = task['taskArn']
                seen_arns.add(task_arn)
                container = arn_map.get(task_arn)
                if container is None:
                    continue

                last_status = task.get('lastStatus', 'UNKNOWN')

                if last_status in TRANSIENT_STATES:
                    # Task is legitimately in a startup or teardown transition — leave it alone.
                    self.stdout.write(
                        f"  [ecs-reconcile] task {task_arn} is {last_status} (transient) — skipping"
                    )
                    continue

                if last_status == TERMINAL_STATUS:
                    stopped_reason = task.get('stoppedReason', 'unknown reason')
                    self.stdout.write(
                        f"  [ecs-reconcile] task {task_arn} is STOPPED "
                        f"({stopped_reason}) — closing container"
                    )
                    self._reconcile_close(container, task, now)
                    closed_uuids.add(str(container.uuid))
                else:
                    # Any other unknown status: log and leave alone (fail safe).
                    self.stdout.write(
                        f"  [ecs-reconcile] task {task_arn} has unexpected status "
                        f"{last_status!r} — skipping"
                    )

        # ARNs that ECS returned nothing for have been purged from ECS history
        # (tasks are retained for ~1 hour after stopping). At this point the
        # task is definitely gone, so close the container.
        missing_arns = set(arns) - seen_arns
        for task_arn in missing_arns:
            container = arn_map[task_arn]
            self.stdout.write(
                f"  [ecs-reconcile] task {task_arn} not found in ECS (purged) — closing container"
            )
            self._reconcile_close(container, task=None, now=now)
            closed_uuids.add(str(container.uuid))

        return closed_uuids

    def _reconcile_close(self, container, task, now):
        """
        Close a container whose ECS task is confirmed STOPPED or purged from ECS.

        Because the ECS task is already stopped we must NOT re-enqueue the
        normal delete_container Celery task — that would call ecs.stop_task on
        a dead task (spurious error) and recompute/overwrite the cost and
        closed_at we set here.

        Instead we:
          1. Write active/closed_at/cost to the DB ourselves (precise timestamps
             from ECS where available).
          2. Call the delete management command with --skip-ecs-stop so only the
             Cloudflare DNS record is cleaned up.
        """
        from sessions.services import compute_session_cost

        # Use ECS stoppedAt for accurate billing; fall back to now.
        stopped_at = None
        if task:
            stopped_at = task.get('stoppedAt')

        container.active = False
        container.closed_at = stopped_at or now
        # Backfill start_time from ECS if the callback never set it.
        if not container.start_time and task:
            container.start_time = task.get('startedAt')

        container.session_cost_usd = compute_session_cost(container)
        container.save(update_fields=['active', 'closed_at', 'start_time', 'session_cost_usd'])

        try:
            oc = OpenContainers.objects.get(
                container=container, closed_at__isnull=True
            )
            oc.closed_at = container.closed_at
            oc.save(update_fields=['closed_at'])
        except OpenContainers.DoesNotExist:
            pass

        # DNS-only cleanup dispatched asynchronously so Cloudflare HTTP requests
        # (with retries/timeouts) don't block the close_containers process. (#3)
        from sessions.tasks import delete_dns_record
        delete_dns_record.delay(
            task_arn=str(container.task_arn or ''),
            public_ip=str(container.ip_address or ''),
        )
