import hashlib
import secrets
from datetime import datetime
from decimal import Decimal
from typing import Optional

from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Sum, Count
from django.http import HttpRequest
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from users.auth import session_mfa_auth
from users.models import SiteSettings, UserLimit
from .models import Container, OpenContainers, TrafficEvent
from .schemas import (
    SessionCreateIn, SessionStatusOut, SessionDetailOut, SessionCallbackIn,
    SessionHistoryOut, NoteCreateIn, NoteOut, TagAssignIn, CaseAssignIn,
    SpendOut, TrafficEventIn, TrafficEventOut,
)

router = Router(tags=["sessions"])


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _get_effective_max_concurrent(user):
    site = SiteSettings.get()
    try:
        ul = user.limits
        if ul.max_concurrent_sessions is not None:
            return ul.max_concurrent_sessions
    except UserLimit.DoesNotExist:
        pass
    return site.default_max_concurrent_sessions


def _session_to_detail(container: Container) -> dict:
    workspace_slug = container.workspace.slug if container.workspace else None
    workspace_uuid = container.workspace.uuid if container.workspace else None
    tags = list(container.tags.values_list('name', flat=True))
    case_id = container.case_id
    return {
        "uuid": container.uuid,
        "type": container.type,
        "container_url": container.container_url,
        "session_token": container.session_token,
        "active": container.active,
        "start_time": container.start_time,
        "closed_at": container.closed_at,
        "capacity_provider": container.capacity_provider,
        "subdomain": container.subdomain,
        "ip_address": container.ip_address,
        "vcpu": container.vcpu,
        "memory_gb": container.memory_gb,
        "session_cost_usd": container.session_cost_usd,
        "workspace_slug": workspace_slug,
        "workspace_uuid": workspace_uuid,
        "case_id": case_id,
        "tags": tags,
        "enable_traffic_log": container.enable_traffic_log,
    }


def _session_to_history(container: Container) -> dict:
    duration = None
    if container.start_time and container.closed_at:
        duration = (container.closed_at - container.start_time).total_seconds()
    tags = list(container.tags.values_list('name', flat=True))
    tag_uuids = [str(u) for u in container.tags.values_list('uuid', flat=True)]
    case_name = container.case.name if container.case else None
    case_uuid = str(container.case.uuid) if container.case else None
    notes_count = container.notes.count() if hasattr(container, 'notes') else 0
    return {
        "uuid": container.uuid,
        "type": container.type,
        "url": container.url,
        "category": container.category,
        "active": container.active,
        "container_url": container.container_url,
        "start_time": container.start_time,
        "closed_at": container.closed_at,
        "duration_seconds": duration,
        "subdomain": container.subdomain,
        "ip_address": container.ip_address,
        "capacity_provider": container.capacity_provider,
        "session_cost_usd": container.session_cost_usd,
        "notes_count": notes_count,
        "tags": tags,
        "tag_uuids": tag_uuids,
        "case_name": case_name,
        "case_uuid": case_uuid,
        "enable_traffic_log": container.enable_traffic_log,
        "traffic_event_count": container.traffic_events.count() if container.enable_traffic_log else 0,
    }


# ─── Session history ───────────────────────────────────────────────────────────
# Registered BEFORE /{uuid}/ routes to avoid "history" being parsed as a UUID.

@router.get("/history/", response=list[SessionHistoryOut], auth=session_mfa_auth)
def session_history(
    request: HttpRequest,
    page: int = 1,
    browser: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    case_id: Optional[int] = None,
    tag: Optional[str] = None,
    workspace_uuid: Optional[str] = None,
):
    """List all past sessions for the current user with optional filters."""
    qs = Container.objects.filter(user=request.auth).order_by('-date_created')

    if browser:
        qs = qs.filter(type=browser)
    if from_date:
        qs = qs.filter(start_time__date__gte=from_date)
    if to_date:
        qs = qs.filter(start_time__date__lte=to_date)
    if case_id:
        qs = qs.filter(case_id=case_id)
    if tag:
        qs = qs.filter(tags__name=tag)
    if workspace_uuid:
        qs = qs.filter(workspace__uuid=workspace_uuid)

    page_size = 25
    offset = (page - 1) * page_size
    qs = qs[offset:offset + page_size]

    return [_session_to_history(c) for c in qs]


@router.get("/history/{uuid}/", response=SessionHistoryOut, auth=session_mfa_auth)
def session_history_detail(request: HttpRequest, uuid: str):
    """Get full history detail for a single session."""
    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")
    return _session_to_history(container)


# ─── Session CRUD ──────────────────────────────────────────────────────────────

@router.post("/", response={201: SessionDetailOut}, auth=session_mfa_auth)
def create_session(request: HttpRequest, payload: SessionCreateIn):
    """Create a new browser session (enqueues ECS Fargate task)."""
    from sessions.tasks import start_container

    user = request.auth

    # Enforce concurrent session limit
    active_count = Container.objects.filter(user=user, active=True).count()
    max_concurrent = _get_effective_max_concurrent(user)
    if active_count >= max_concurrent:
        raise HttpError(429, f"Concurrent session limit reached ({max_concurrent})")

    # Resolve workspace if provided
    workspace = None
    if payload.workspace_uuid:
        from workspaces.models import Workspace
        try:
            workspace = Workspace.objects.get(
                uuid=payload.workspace_uuid,
                memberships__user=user
            )
        except Workspace.DoesNotExist:
            raise HttpError(404, "Workspace not found or you are not a member")

        # Block sessions in personal workspaces when personal workspaces are disabled
        if workspace.is_personal:
            from users.models import SiteSettings
            if not SiteSettings.get().allow_personal_workspaces:
                raise HttpError(403, "Personal workspaces are currently disabled")

        # Workspace-level concurrent sessions check
        if workspace.max_concurrent_sessions_per_member is not None:
            ws_active = Container.objects.filter(
                user=user, workspace=workspace, active=True
            ).count()
            if ws_active >= workspace.max_concurrent_sessions_per_member:
                raise HttpError(429, "Workspace concurrent session limit reached")

    # ── Browser allowlist check ───────────────────────────────────────────
    # Determine which slugs are permitted for this request:
    #   1. If the workspace has an explicit allowed_browsers set, use that.
    #   2. Otherwise fall back to SiteSettings:
    #      - personal workspace → default_personal_browser_slugs
    #        (if empty, fall back to global_allowed_browser_slugs)
    #      - team workspace → global_allowed_browser_slugs
    #   3. If the effective set is still empty, all browsers are allowed.
    import json as _json
    from users.models import SiteSettings as _SiteSettings
    _site = _SiteSettings.get()
    _global = _json.loads(_site.global_allowed_browser_slugs or '[]')
    _personal = _json.loads(_site.default_personal_browser_slugs or '[]')

    if workspace is not None:
        _ws_slugs = list(workspace.allowed_browsers.values_list('slug', flat=True))
        if _ws_slugs:
            _effective = _ws_slugs
        elif workspace.is_personal:
            _effective = _personal if _personal else _global
        else:
            _effective = _global
    else:
        # No workspace — personal context; apply personal defaults
        _effective = _personal if _personal else _global

    if _effective and payload.browser_type not in _effective:
        raise HttpError(403, f"Browser '{payload.browser_type}' is not permitted")

    # Network logging is only supported on specific browsers; force it off for
    # apps that don't have mitmproxy support (comms/vpn/security tools).
    TRAFFIC_LOG_UNSUPPORTED = {
        "kali", "telegram", "tor",
        "ubuntu", "code-server", "terminal",
    }

    # Gate feature flags against global and per-workspace settings.
    # _site is already loaded above for the browser allowlist check.
    _global_network_logging = _site.enable_network_logging
    _global_file_protection = _site.enable_file_protection
    _ws_network_logging = workspace.enable_network_logging if workspace else False
    _ws_file_protection = workspace.enable_file_protection if workspace else False

    # Feature is permitted only when globally enabled AND the workspace has it on.
    # (If there's no workspace, neither feature is available — they are workspace-scoped.)
    _network_logging_permitted = _global_network_logging and _ws_network_logging
    _file_protection_permitted = _global_file_protection and _ws_file_protection

    enable_traffic_log = (
        payload.enable_traffic_log
        and _network_logging_permitted
        and payload.browser_type not in TRAFFIC_LOG_UNSUPPORTED
    )
    enable_file_protection = payload.file_protection and _file_protection_permitted

    container = Container.objects.create(
        user=user,
        type=payload.browser_type,
        url=payload.auto_open_url,
        workspace=workspace,
        category='vspot' if payload.session_type == 'vspot' else 'standard',
        enable_traffic_log=enable_traffic_log,
        file_protection=enable_file_protection,
    )

    # Resolve the idle timeout for this session now (same logic as close_containers)
    # so the ECS container environment reflects the per-workspace/user/site value
    # rather than the global DEFAULT_IDLE_THRESHOLD constant.
    from sessions.management.commands.close_containers import get_idle_threshold
    _idle_timeout_minutes = get_idle_threshold(container, _site)

    start_container.delay(
        str(container.uuid),
        payload.browser_type,
        payload.auto_open_url or '',
        user.username,
        payload.session_type or 'vstandard',
        enable_traffic_log,
        enable_file_protection,
        _idle_timeout_minutes,
    )

    return 201, _session_to_detail(container)


@router.get("/{uuid}/status/", response=SessionStatusOut, auth=session_mfa_auth)
def get_session_status(request: HttpRequest, uuid: str):
    """Poll the status of a session (used by the loading page)."""
    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    if container.active and container.container_url:
        status = "active"
    elif not container.active and container.start_time:
        status = "closed"
    else:
        status = "pending"

    return {
        "uuid": container.uuid,
        "status": status,
        "container_url": container.container_url,
        "max_wait_time": 300000,
    }


@router.post("/{uuid}/callback/", response={200: dict}, auth=None)
def container_data_returned(request: HttpRequest, uuid: str, payload: SessionCallbackIn):
    """
    Called by the ECS task via the start.py management command once the browser
    container is running and has obtained its public IP.
    This endpoint is intentionally unauthenticated (called from inside the
    container network); protect it via a shared internal secret if needed.
    """
    import hashlib

    try:
        container = Container.objects.get(uuid=uuid)
    except Container.DoesNotExist:
        raise HttpError(404, "Container not found")

    subdomain_hash = hashlib.md5((str(container.uuid) + "\n").encode()).hexdigest()
    subdomain = f"browser-{subdomain_hash}.{settings.CUSTOM_DOMAIN}"
    container_url = f"https://{subdomain}/?token={container.uuid}"

    container.ip_address = payload.public_ip
    container.private_ip = payload.private_ip
    container.task_arn = payload.task_arn
    container.capacity_provider = payload.capacity_provider
    container.subdomain = subdomain
    container.container_url = container_url
    container.url = container_url
    container.start_time = timezone.now()
    container.vcpu = Decimal(str(payload.vcpu or 0.25))
    container.memory_gb = Decimal(str(payload.memory_gb or 0.5))
    container.save()

    # Create OpenContainers heartbeat record
    OpenContainers.objects.get_or_create(
        container=container,
        defaults={'container_uuid': str(container.uuid)},
    )

    return {"status": "ok", "container_url": container_url}


@router.get("/{uuid}/", response=SessionDetailOut, auth=session_mfa_auth)
def get_session(request: HttpRequest, uuid: str):
    """Get full session details."""
    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")
    return _session_to_detail(container)


@router.delete("/{uuid}/", response={200: dict}, auth=session_mfa_auth)
def close_session(request: HttpRequest, uuid: str):
    """Terminate an active session."""
    from sessions.tasks import delete_container

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth, active=True)
    except Container.DoesNotExist:
        raise HttpError(404, "Active session not found")

    delete_container.delay(str(container.uuid))
    return {"status": "terminating"}


@router.post("/{uuid}/close/", response={200: dict}, auth=None)
def close_session_public(request: HttpRequest, uuid: str, session_token: str):
    """
    Public endpoint called by the vbrowser container itself when the browser
    process exits or the inactivity timer fires.  Authentication is provided
    by the session_token that was embedded in the container's launch URL —
    only the container (or the user sitting in front of it) can know it.
    """
    from sessions.tasks import delete_container

    try:
        container = Container.objects.get(uuid=uuid, active=True)
    except Container.DoesNotExist:
        raise HttpError(404, "Active session not found")

    if container.session_token != session_token:
        raise HttpError(403, "Invalid session token")

    delete_container.delay(str(container.uuid))
    return {"status": "terminating"}


@router.post("/{uuid}/traffic/", response={200: dict}, auth=None)
def record_traffic_event(request: HttpRequest, uuid: str, session_token: str, payload: TrafficEventIn):
    """
    Called by svc-traffic-shipper inside the container for every hostname the
    browser contacts.  Authenticated by session_token (same token used by
    close_session_public) so no user session cookie is required.
    """
    from datetime import datetime, timezone as dt_timezone

    try:
        container = Container.objects.get(uuid=uuid)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    if container.session_token != session_token:
        raise HttpError(403, "Invalid session token")

    try:
        ts = datetime.strptime(payload.t, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=dt_timezone.utc
        )
    except ValueError:
        raise HttpError(400, "Invalid timestamp format, expected ISO-8601 UTC (YYYY-MM-DDTHH:MM:SSZ)")

    # Drop internal noise — requests the container makes back to our own
    # platform (log shipping, heartbeats, close callbacks, etc.)
    if settings.CUSTOM_DOMAIN and settings.CUSTOM_DOMAIN in (payload.h or ""):
        return {"status": "ok"}

    TrafficEvent.objects.create(
        container=container,
        timestamp=ts,
        host=payload.h,
        url=payload.u,
        method=payload.m or "",
    )
    return {"status": "ok"}


@router.get("/{uuid}/traffic/", response=list[TrafficEventOut], auth=session_mfa_auth)
def get_traffic_events(
    request: HttpRequest,
    uuid: str,
    page: int = 1,
    search: Optional[str] = None,
    since_id: Optional[int] = None,
    flagged_only: bool = False,
    method: Optional[str] = None,
):
    """Return paginated traffic log events for a session owned by the current user."""
    from django.db.models import Q
    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    if not container.enable_traffic_log:
        raise HttpError(404, "Network logging was not enabled for this session")

    qs = container.traffic_events.order_by('timestamp', 'id')

    if since_id is not None:
        qs = qs.filter(id__gt=since_id)
    if flagged_only:
        qs = qs.filter(flagged=True)
    if search:
        qs = qs.filter(Q(host__icontains=search) | Q(url__icontains=search))
    if method:
        methods = [m.strip().upper() for m in method.split(",") if m.strip()]
        if methods:
            qs = qs.filter(method__in=methods)

    page_size = 100
    offset = (page - 1) * page_size
    events = qs[offset:offset + page_size]

    return [
        {
            "id": e.id,
            "timestamp": e.timestamp,
            "host": e.host,
            "url": e.url,
            "method": e.method,
            "flagged": e.flagged,
        }
        for e in events
    ]


@router.post("/{uuid}/traffic/{event_id}/flag/", response={200: dict}, auth=session_mfa_auth)
def toggle_traffic_flag(request: HttpRequest, uuid: str, event_id: int):
    """Toggle the flagged state on a traffic event. Returns the new state."""
    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    try:
        event = container.traffic_events.get(id=event_id)
    except TrafficEvent.DoesNotExist:
        raise HttpError(404, "Event not found")

    event.flagged = not event.flagged
    event.save(update_fields=["flagged"])
    return {"id": event.id, "flagged": event.flagged}


@router.post("/{uuid}/ping/", response={200: dict}, auth=session_mfa_auth)
def ping_session(request: HttpRequest, uuid: str):
    """Heartbeat to prevent idle-timeout. Called every 10s by the frontend."""
    try:
        container = Container.objects.get(uuid=uuid, user=request.auth, active=True)
    except Container.DoesNotExist:
        raise HttpError(404, "Active session not found")

    try:
        oc = OpenContainers.objects.get(container=container)
        oc.last_ping_at = timezone.now()
        oc.save(update_fields=['last_ping_at'])
    except OpenContainers.DoesNotExist:
        pass

    return {"status": "ok"}


# ─── Session notes ─────────────────────────────────────────────────────────────

@router.post("/{uuid}/notes/", response={201: NoteOut}, auth=session_mfa_auth)
def add_note(request: HttpRequest, uuid: str, payload: NoteCreateIn):
    """Add a note to a session."""
    from cases.models import SessionNote

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    note = SessionNote.objects.create(container=container, author=request.auth, body=payload.body)
    return 201, {
        "uuid": note.uuid,
        "body": note.body,
        "author_id": note.author_id,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
    }


@router.get("/{uuid}/notes/", response=list[NoteOut], auth=session_mfa_auth)
def list_notes(request: HttpRequest, uuid: str):
    """List all notes for a session."""
    from cases.models import SessionNote

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    notes = SessionNote.objects.filter(container=container).order_by('created_at')
    return [
        {"uuid": n.uuid, "body": n.body, "author_id": n.author_id, "created_at": n.created_at, "updated_at": n.updated_at}
        for n in notes
    ]


@router.patch("/{uuid}/notes/{note_uuid}/", response=NoteOut, auth=session_mfa_auth)
def edit_note(request: HttpRequest, uuid: str, note_uuid: str, payload: NoteCreateIn):
    from cases.models import SessionNote

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
        note = SessionNote.objects.get(uuid=note_uuid, container=container, author=request.auth)
    except (Container.DoesNotExist, SessionNote.DoesNotExist):
        raise HttpError(404, "Note not found")

    note.body = payload.body
    note.save()
    return {"uuid": note.uuid, "body": note.body, "author_id": note.author_id, "created_at": note.created_at, "updated_at": note.updated_at}


@router.delete("/{uuid}/notes/{note_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_note(request: HttpRequest, uuid: str, note_uuid: str):
    from cases.models import SessionNote

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
        note = SessionNote.objects.get(uuid=note_uuid, container=container, author=request.auth)
    except (Container.DoesNotExist, SessionNote.DoesNotExist):
        raise HttpError(404, "Note not found")

    note.delete()
    return {"status": "deleted"}


# ─── Session tags / case ───────────────────────────────────────────────────────

@router.post("/{uuid}/tags/", response={200: dict}, auth=session_mfa_auth)
def assign_tags(request: HttpRequest, uuid: str, payload: TagAssignIn):
    from cases.models import Tag

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    tags = Tag.objects.filter(uuid__in=payload.tag_uuids)
    container.tags.add(*tags)
    return {"status": "ok", "tags": list(container.tags.values_list('name', flat=True))}


@router.delete("/{uuid}/tags/{tag_uuid}/", response={200: dict}, auth=session_mfa_auth)
def remove_tag(request: HttpRequest, uuid: str, tag_uuid: str):
    from cases.models import Tag

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
        tag = Tag.objects.get(uuid=tag_uuid)
    except (Container.DoesNotExist, Tag.DoesNotExist):
        raise HttpError(404, "Not found")

    container.tags.remove(tag)
    return {"status": "ok"}


@router.patch("/{uuid}/case/", response={200: dict}, auth=session_mfa_auth)
def assign_case(request: HttpRequest, uuid: str, payload: CaseAssignIn):
    from cases.models import Case

    try:
        container = Container.objects.get(uuid=uuid, user=request.auth)
    except Container.DoesNotExist:
        raise HttpError(404, "Session not found")

    if payload.case_uuid is None:
        container.case = None
    else:
        try:
            case = Case.objects.get(uuid=payload.case_uuid)
        except Case.DoesNotExist:
            raise HttpError(404, "Case not found")
        container.case = case

    container.save(update_fields=['case'])
    return {"status": "ok", "case_uuid": str(container.case.uuid) if container.case else None}




