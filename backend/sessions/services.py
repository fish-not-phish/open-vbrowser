from decimal import Decimal
from django.conf import settings

# AWS bills from image pull start (task provisioning), not from when the
# container is ready.  The best proxy we have is date_created (when the ECS
# RunTask call is made).  AWS also enforces a 1-minute minimum per task.
_MIN_BILLING_SECONDS = 60


def compute_session_cost(container) -> Decimal:
    """
    Estimate the AWS Fargate cost for a session based on duration, vCPU, and memory.

    Billing start: date_created (ECS task submitted) rather than start_time
    (callback fired), because AWS begins billing from image-pull time.

    Minimum billable duration: 60 seconds (AWS enforced minimum).
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
    duration_hours = billed_seconds / 3600

    vcpu_per_hour = Decimal(str(getattr(settings, 'FARGATE_VCPU_PER_HOUR_USD', '0.04048')))
    mem_per_hour = Decimal(str(getattr(settings, 'FARGATE_MEMORY_GB_PER_HOUR_USD', '0.004445')))
    spot_discount = Decimal(str(getattr(settings, 'FARGATE_SPOT_DISCOUNT', '0.70')))

    vcpu_cost = vcpu_per_hour * Decimal(str(duration_hours)) * Decimal(str(container.vcpu))
    mem_cost = mem_per_hour * Decimal(str(duration_hours)) * Decimal(str(container.memory_gb))
    total = vcpu_cost + mem_cost

    if container.capacity_provider == 'FARGATE_SPOT':
        total *= (1 - spot_discount)

    return total.quantize(Decimal('0.000001'))
