from ninja import Router
from django.http import HttpRequest
from django.contrib.auth.models import User
from typing import Optional

from users.auth import admin_session_auth
from .models import AuditLog
from .schemas import AuditLogOut

router = Router(tags=["audit"])


@router.get("/", response=list[AuditLogOut], auth=admin_session_auth)
def list_audit_logs(
    request: HttpRequest,
    action: Optional[str] = None,
    actor_id: Optional[int] = None,
    target_user_id: Optional[int] = None,
    q: str = "",
    limit: int = 200,
    offset: int = 0,
):
    """List audit log entries (admin only). Supports filtering by action,
    actor, target user, and free-text search on usernames/action."""
    qs = AuditLog.objects.select_related('actor', 'target_user')

    if action:
        # Allow prefix matching, e.g. ``action=user`` matches ``user.create``
        qs = qs.filter(action__startswith=action)

    if actor_id is not None:
        qs = qs.filter(actor_id=actor_id)

    if target_user_id is not None:
        qs = qs.filter(target_user_id=target_user_id)

    if q:
        actor_ids = User.objects.filter(
            email__icontains=q
        ).values_list('id', flat=True)
        qs = qs.filter(action__icontains=q) | qs.filter(actor_id__in=list(actor_ids))

    limit = min(max(limit, 1), 1000)
    offset = max(offset, 0)

    rows = qs[offset : offset + limit]

    return [
        AuditLogOut(
            id=r.id,
            timestamp=r.timestamp.isoformat(),
            actor_id=r.actor_id,
            actor_username=r.actor.email if r.actor else None,
            action=r.action,
            target_user_id=r.target_user_id,
            target_user_username=r.target_user.email if r.target_user else None,
            ip_address=r.ip_address,
            metadata=r.metadata,
        )
        for r in rows
    ]
