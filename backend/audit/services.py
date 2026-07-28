from django.http import HttpRequest
from django.contrib.auth.models import User
from typing import Optional

from .models import AuditLog


def _get_client_ip(request: HttpRequest) -> str | None:
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def log_audit(
    request: HttpRequest,
    action: str,
    target_user: Optional[User] = None,
    **metadata,
) -> AuditLog:
    """Create an audit log entry.

    Args:
        request: The HttpRequest (used to extract actor + IP).
        action:  A dot-namespaced action string, e.g. ``user.create``.
        target_user: The user being acted upon (if any).
        **metadata: Arbitrary JSON-serialisable details (workspace uuid,
                    session uuid, field changes, etc.).
    """
    actor = None
    if hasattr(request, 'auth') and request.auth is not None:
        actor = request.auth

    return AuditLog.objects.create(
        actor=actor,
        action=action,
        target_user=target_user,
        ip_address=_get_client_ip(request),
        metadata=metadata or {},
    )
