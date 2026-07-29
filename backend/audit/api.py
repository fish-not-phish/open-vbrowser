import csv
import io
import json
from typing import Iterator, Optional

from ninja import Router
from django.http import HttpRequest, HttpResponse, StreamingHttpResponse
from django.contrib.auth.models import User
from django.utils import timezone

from users.auth import admin_session_auth
from .models import AuditLog
from .schemas import AuditLogOut

router = Router(tags=["audit"])

EXPORT_FIELDS = [
    "id",
    "timestamp",
    "actor_id",
    "actor_username",
    "action",
    "target_user_id",
    "target_user_username",
    "ip_address",
    "metadata",
]
MAX_EXPORT_ROWS = 100_000


def _apply_filters(qs, action=None, actor_id=None, target_user_id=None, q=""):
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

    return qs


def _serialize_row(r: AuditLog) -> dict:
    return {
        "id": r.id,
        "timestamp": r.timestamp.isoformat(),
        "actor_id": r.actor_id,
        "actor_username": r.actor.email if r.actor else None,
        "action": r.action,
        "target_user_id": r.target_user_id,
        "target_user_username": r.target_user.email if r.target_user else None,
        "ip_address": r.ip_address,
        "metadata": r.metadata,
    }


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
    qs = _apply_filters(
        AuditLog.objects.select_related('actor', 'target_user'),
        action, actor_id, target_user_id, q,
    )

    limit = min(max(limit, 1), 1000)
    offset = max(offset, 0)

    rows = qs[offset : offset + limit]

    return [_serialize_row(r) for r in rows]


def _csv_rows(qs) -> Iterator[str]:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=EXPORT_FIELDS, extrasaction="ignore")
    writer.writeheader()
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    for r in qs.iterator(chunk_size=500):
        row = _serialize_row(r)
        row["metadata"] = json.dumps(row["metadata"], ensure_ascii=False, default=str)
        writer.writerow(row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


def _json_rows(qs) -> Iterator[str]:
    yield "["
    first = True
    for r in qs.iterator(chunk_size=500):
        row = _serialize_row(r)
        yield ("" if first else ",") + json.dumps(row, ensure_ascii=False, default=str)
        first = False
    yield "]"


@router.get("/export/", auth=admin_session_auth)
def export_audit_logs(
    request: HttpRequest,
    format: str = "json",
    action: Optional[str] = None,
    actor_id: Optional[int] = None,
    target_user_id: Optional[int] = None,
    q: str = "",
):
    """Export filtered audit log entries as a downloadable JSON or CSV file
    (admin only). Applies the same filters as the list endpoint and streams
    the result so large exports stay memory-bounded."""
    fmt = (format or "json").lower()
    if fmt not in ("json", "csv"):
        fmt = "json"

    qs = _apply_filters(
        AuditLog.objects.select_related('actor', 'target_user').order_by('-timestamp'),
        action, actor_id, target_user_id, q,
    )[:MAX_EXPORT_ROWS]

    stamp = timezone.now().strftime("%Y%m%d-%H%M%S")

    if fmt == "csv":
        response = StreamingHttpResponse(_csv_rows(qs), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="audit-log-{stamp}.csv"'
        return response

    response = StreamingHttpResponse(_json_rows(qs), content_type="application/json; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="audit-log-{stamp}.json"'
    return response
