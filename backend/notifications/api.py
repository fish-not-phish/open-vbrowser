from ninja import Router, Schema
from django.http import HttpRequest
from users.auth import session_mfa_auth
from .models import Notification
from typing import Optional
import uuid as _uuid
from datetime import datetime


class NotificationOut(Schema):
    uuid: str
    verb: str
    actor_email: Optional[str] = None
    case_uuid: Optional[str] = None
    case_name: Optional[str] = None
    workspace_uuid: Optional[str] = None
    comment_uuid: Optional[str] = None
    read: bool
    created_at: datetime


router = Router(tags=["notifications"])


def _notif_out(n: Notification) -> dict:
    return {
        "uuid": str(n.uuid),
        "verb": n.verb,
        "actor_email": n.actor.email if n.actor else None,
        "case_uuid": str(n.case.uuid) if n.case else None,
        "case_name": n.case.name if n.case else None,
        "workspace_uuid": str(n.workspace.uuid) if n.workspace else None,
        "comment_uuid": str(n.comment.uuid) if n.comment else None,
        "read": n.read,
        "created_at": n.created_at,
    }


@router.get("/", response=list[NotificationOut], auth=session_mfa_auth)
def list_notifications(request: HttpRequest):
    """Return the 50 most recent notifications for the current user."""
    qs = (
        Notification.objects
        .filter(recipient=request.auth)
        .select_related("actor", "case", "workspace", "comment")
        .order_by("-created_at")[:50]
    )
    return [_notif_out(n) for n in qs]


@router.get("/unread-count", response=dict, auth=session_mfa_auth)
def unread_count(request: HttpRequest):
    count = Notification.objects.filter(recipient=request.auth, read=False).count()
    return {"count": count}


@router.post("/{notif_uuid}/read", response=dict, auth=session_mfa_auth)
def mark_read(request: HttpRequest, notif_uuid: str):
    updated = Notification.objects.filter(
        uuid=notif_uuid, recipient=request.auth
    ).update(read=True)
    return {"updated": updated}


@router.post("/read-all", response=dict, auth=session_mfa_auth)
def mark_all_read(request: HttpRequest):
    updated = Notification.objects.filter(
        recipient=request.auth, read=False
    ).update(read=True)
    return {"updated": updated}
