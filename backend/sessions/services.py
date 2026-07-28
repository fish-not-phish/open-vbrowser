from decimal import Decimal
from django.conf import settings

# AWS bills from image pull start (task provisioning), not from when the
# container is ready.  The best proxy we have is date_created (when the ECS
# RunTask call is made).  AWS also enforces a 1-minute minimum per task.
_MIN_BILLING_SECONDS = 60


def compute_session_cost(container) -> Decimal:
    """
    Estimate the AWS Fargate cost for a session based on duration, vCPU, memory,
    and the public IPv4 address assigned to each task.

    Components included:
    - vCPU cost: billed per vCPU-hour at FARGATE_VCPU_PER_HOUR_USD
    - Memory cost: billed per GB-hour at FARGATE_MEMORY_GB_PER_HOUR_USD
    - Public IPv4: $0.005/hr per task (AWS charge since Feb 2024); disable via
      PUBLIC_IPV4_PER_HOUR_USD=0 if sessions are moved behind a NAT/load balancer

    Spot discount (FARGATE_SPOT_DISCOUNT) is applied to vCPU + memory only;
    the public IPv4 charge is not discounted for Spot tasks.

    Billing start: date_created (ECS task submitted) rather than start_time
    (callback fired), because AWS begins billing from image-pull time.

    Minimum billable duration: 60 seconds (AWS enforced minimum).

    Not included (hard to track per-session):
    - Data egress ($0.09/GB after 100 GB/month free tier) — requires flow log instrumentation
    - Ephemeral storage — only applies above the 20 GB free tier per task
    """
    if not container.closed_at:
        return Decimal('0')

    # Use date_created as billing start (task submitted to ECS).
    # Fall back to start_time if date_created is somehow absent.
    billing_start = container.date_created or container.start_time
    if not billing_start:
        return Decimal('0')

    raw_seconds = (container.closed_at - billing_start).total_seconds()
    billed_seconds = max(raw_seconds, _MIN_BILLING_SECONDS)
    duration_hours = Decimal(str(billed_seconds / 3600))

    vcpu_per_hour = Decimal(str(getattr(settings, 'FARGATE_VCPU_PER_HOUR_USD', '0.04048')))
    mem_per_hour = Decimal(str(getattr(settings, 'FARGATE_MEMORY_GB_PER_HOUR_USD', '0.004445')))
    spot_discount = Decimal(str(getattr(settings, 'FARGATE_SPOT_DISCOUNT', '0.70')))
    ipv4_per_hour = Decimal(str(getattr(settings, 'PUBLIC_IPV4_PER_HOUR_USD', '0.005')))

    vcpu_cost = vcpu_per_hour * duration_hours * Decimal(str(container.vcpu))
    mem_cost = mem_per_hour * duration_hours * Decimal(str(container.memory_gb))
    compute_cost = vcpu_cost + mem_cost

    if container.capacity_provider == 'FARGATE_SPOT':
        compute_cost *= (1 - spot_discount)

    # Public IPv4 is billed by AWS separately (not discounted for Spot).
    ipv4_cost = ipv4_per_hour * duration_hours

    total = compute_cost + ipv4_cost

    return total.quantize(Decimal('0.000001'))


# ─── Limit resolvers ──────────────────────────────────────────────────────────
# Single source of truth for the idle-timeout and hard-duration-cap resolution
# used by both the close_containers enforcement loop and the session-detail API
# (so the client countdown always agrees with server-side enforcement).

def get_idle_threshold(container, site_settings):
    """
    Resolve the idle timeout (minutes) for a container.
    Resolution order: UserLimit (most specific) → Workspace → SiteSettings
    default → DEFAULT_IDLE_THRESHOLD setting.

    ``site_settings`` is passed in so batch callers (e.g. close_containers) can
    resolve it once and reuse it across many containers rather than hitting the
    DB per container.
    """
    from users.models import UserLimit

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

    # 3. Site default (pre-fetched by caller)
    if site_settings is not None:
        return site_settings.default_idle_timeout_minutes

    # 4. Env var fallback
    return int(getattr(settings, 'DEFAULT_IDLE_THRESHOLD', 10))


def get_max_duration(container, site_settings):
    """
    Resolve the hard session duration cap (in hours), or None for no cap.
    Resolution order: UserLimit (most specific) → Workspace → SiteSettings
    default.

    ``site_settings`` is passed in so batch callers (e.g. close_containers) can
    resolve it once and reuse it across many containers rather than hitting the
    DB per container.
    """
    from users.models import UserLimit

    # 1. Per-user limit
    if container.user:
        try:
            ul = container.user.limits
            if ul.max_session_duration_hours is not None:
                return ul.max_session_duration_hours
        except UserLimit.DoesNotExist:
            pass

    # 2. Workspace limit
    if container.workspace and container.workspace.max_session_duration_hours is not None:
        return container.workspace.max_session_duration_hours

    # 3. Site default (pre-fetched by caller)
    if site_settings is not None:
        return site_settings.default_max_session_duration_hours

    return None
