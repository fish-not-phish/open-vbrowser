import json
from ninja import Router, Schema, File
from ninja.files import UploadedFile
from django.http import HttpRequest
from django.core.files.storage import default_storage
from ninja.errors import HttpError
from django.contrib.auth.models import User
from users.auth import session_mfa_auth, admin_session_auth
from .models import Workspace, WorkspaceMembership
from uuid import UUID
from typing import List, Optional
from .schemas import (
    WorkspaceCreateIn, WorkspaceUpdateIn, WorkspaceOut,
    MemberOut, MemberInviteIn, MemberRoleIn,
)


class BrowserSlugsIn(Schema):
    slugs: List[str] = []

router = Router(tags=["workspaces"])


def _personal_ws_enabled() -> bool:
    """Return True if personal workspaces are currently enabled site-wide."""
    from users.models import SiteSettings
    return SiteSettings.get().allow_personal_workspaces


def _base_ws_qs(user):
    """
    Base queryset for workspaces the user is a member of.
    When personal workspaces are disabled, excludes all is_personal=True workspaces
    for non-admin users (so they become invisible and inaccessible without being deleted).
    """
    from users.models import UserProfile
    qs = Workspace.objects.filter(memberships__user=user).distinct()
    if not _personal_ws_enabled():
        profile, _ = UserProfile.objects.get_or_create(user=user)
        if not profile.is_admin:
            qs = qs.filter(is_personal=False)
    return qs


def _get_ws_for_user(ws_uuid: UUID, user) -> Workspace:
    """
    Fetch a workspace by UUID, verifying the user is a member and that the
    workspace is accessible (personal workspaces are gated by _base_ws_qs).
    Raises HttpError 404 if not found or inaccessible.
    """
    try:
        return _base_ws_qs(user).get(uuid=ws_uuid)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")


def _effective_browser_slugs(ws: Workspace) -> list:
    """
    Return the slugs that are actually available in this workspace.

    For team workspaces:
      - If the workspace has an explicit allowed_browsers set, use those.
      - Otherwise use SiteSettings.global_allowed_browser_slugs (empty = all).

    For personal workspaces:
      - The workspace never has its own allowed_browsers set.
      - Use SiteSettings.default_personal_browser_slugs, falling back to
        global_allowed_browser_slugs, then [] (= all).
    """
    from users.models import SiteSettings
    explicit = list(ws.allowed_browsers.values_list('slug', flat=True))
    if explicit:
        return explicit

    site = SiteSettings.get()
    global_slugs = json.loads(site.global_allowed_browser_slugs or '[]')
    personal_slugs = json.loads(site.default_personal_browser_slugs or '[]')

    if ws.is_personal:
        return personal_slugs if personal_slugs else global_slugs
    else:
        return global_slugs


def _ws_out(ws: Workspace, user, request: HttpRequest = None) -> dict:
    try:
        membership = ws.memberships.get(user=user)
        role = membership.role
    except WorkspaceMembership.DoesNotExist:
        role = "none"

    logo_url = None
    if ws.logo:
        if request is not None:
            logo_url = request.build_absolute_uri(ws.logo.url)
        else:
            logo_url = ws.logo.url

    return {
        "id": ws.id,
        "uuid": ws.uuid,
        "name": ws.name,
        "slug": ws.slug,
        "created_at": ws.created_at,
        "max_concurrent_sessions_per_member": ws.max_concurrent_sessions_per_member,
        "idle_timeout_minutes": ws.idle_timeout_minutes,
        "max_session_duration_hours": ws.max_session_duration_hours,
        "member_count": ws.memberships.count(),
        "role": role,
        "is_personal": ws.is_personal,
        "allowed_browser_slugs": _effective_browser_slugs(ws),
        "logo_url": logo_url,
        "enable_network_logging": ws.enable_network_logging,
        "enable_file_protection": ws.enable_file_protection,
    }


@router.get("/", response=list[WorkspaceOut], auth=session_mfa_auth)
def list_workspaces(request: HttpRequest):
    """List all workspaces the current user belongs to."""
    workspaces = _base_ws_qs(request.auth)
    return [_ws_out(ws, request.auth, request) for ws in workspaces]


@router.post("/", response={201: WorkspaceOut}, auth=session_mfa_auth)
def create_workspace(request: HttpRequest, payload: WorkspaceCreateIn):
    """Create a new workspace (caller becomes owner).

    Requires either site-wide allow_workspace_creation=True or the caller to be an admin.
    """
    from users.models import UserProfile, SiteSettings
    profile, _ = UserProfile.objects.get_or_create(user=request.auth)
    site = SiteSettings.get()
    if not (profile.is_admin or site.allow_workspace_creation):
        raise HttpError(403, "Workspace creation is currently restricted to admins")

    if Workspace.objects.filter(slug=payload.slug).exists():
        raise HttpError(409, "Workspace slug already in use")

    ws = Workspace.objects.create(
        name=payload.name,
        slug=payload.slug,
        created_by=request.auth,
    )
    WorkspaceMembership.objects.create(workspace=ws, user=request.auth, role='owner')
    return 201, _ws_out(ws, request.auth, request)


@router.get("/by-slug/{slug}/", response=WorkspaceOut, auth=session_mfa_auth)
def get_workspace_by_slug(request: HttpRequest, slug: str):
    try:
        ws = _base_ws_qs(request.auth).get(slug=slug)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    return _ws_out(ws, request.auth, request)


@router.get("/{ws_uuid}/", response=WorkspaceOut, auth=session_mfa_auth)
def get_workspace(request: HttpRequest, ws_uuid: UUID):
    try:
        ws = _base_ws_qs(request.auth).get(uuid=ws_uuid)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    return _ws_out(ws, request.auth, request)


@router.patch("/{ws_uuid}/", response=WorkspaceOut, auth=session_mfa_auth)
def update_workspace(request: HttpRequest, ws_uuid: UUID, payload: WorkspaceUpdateIn):
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only workspace owners or admins can update settings")

    if payload.name is not None:
        ws.name = payload.name
    if payload.max_concurrent_sessions_per_member is not None:
        ws.max_concurrent_sessions_per_member = payload.max_concurrent_sessions_per_member
    if payload.idle_timeout_minutes is not None:
        ws.idle_timeout_minutes = payload.idle_timeout_minutes
    if payload.max_session_duration_hours is not None:
        ws.max_session_duration_hours = payload.max_session_duration_hours

    # Feature flags — only writable by workspace owner/admin, and only
    # meaningful when the corresponding global flag is enabled.
    from users.models import SiteSettings as _SiteSettings
    _site = _SiteSettings.get()
    if payload.enable_network_logging is not None:
        # Silently clamp: if the global flag is off, the workspace flag stays False.
        ws.enable_network_logging = payload.enable_network_logging and _site.enable_network_logging
    if payload.enable_file_protection is not None:
        ws.enable_file_protection = payload.enable_file_protection and _site.enable_file_protection

    ws.save()
    return _ws_out(ws, request.auth, request)


@router.delete("/{ws_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_workspace(request: HttpRequest, ws_uuid: UUID):
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if membership.role != 'owner':
        raise HttpError(403, "Only workspace owners can delete workspaces")

    ws.delete()
    return {"status": "deleted"}


@router.post("/{ws_uuid}/leave/", response={200: dict}, auth=session_mfa_auth)
def leave_workspace(request: HttpRequest, ws_uuid: UUID):
    """Leave a workspace. The workspace is deleted if the caller is the last member."""
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    member_count = ws.memberships.count()
    membership.delete()

    if member_count <= 1:
        ws.delete()
        return {"status": "deleted"}

    return {"status": "left"}


@router.post("/{ws_uuid}/logo/", response=WorkspaceOut, auth=session_mfa_auth)
def upload_workspace_logo(request: HttpRequest, ws_uuid: UUID, logo: UploadedFile = File(...)):
    """Upload a workspace logo (owners and admins only)."""
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only workspace owners or admins can upload a logo")

    # Validate it's an image
    if not logo.content_type.startswith('image/'):
        raise HttpError(400, "File must be an image")
    if logo.size > 2 * 1024 * 1024:
        raise HttpError(400, "Image must be smaller than 2 MB")

    # Delete old logo if present
    if ws.logo:
        ws.logo.delete(save=False)

    ws.logo.save(f"ws_{ws.uuid}.{logo.name.rsplit('.', 1)[-1]}", logo, save=True)
    return _ws_out(ws, request.auth, request)


@router.delete("/{ws_uuid}/logo/", response={200: dict}, auth=session_mfa_auth)
def delete_workspace_logo(request: HttpRequest, ws_uuid: UUID):
    """Remove a workspace logo (owners and admins only)."""
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only workspace owners or admins can remove the logo")

    if ws.logo:
        ws.logo.delete(save=True)
    return {"status": "removed"}


# ─── Members ───────────────────────────────────────────────────────────────────

@router.get("/{ws_uuid}/search-users/", response=list[dict], auth=session_mfa_auth)
def search_users(request: HttpRequest, ws_uuid: UUID, q: str = ""):
    """Search users by email or name for the purposes of adding them to this workspace.
    Only returns users not already members. Requires owner or admin role."""
    from django.db.models import Q
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only owners or admins can search users")

    if not q or len(q.strip()) < 1:
        return []

    existing_user_ids = ws.memberships.values_list('user_id', flat=True)

    qs = User.objects.filter(is_active=True).exclude(id__in=existing_user_ids).filter(
        Q(email__icontains=q) |
        Q(first_name__icontains=q) |
        Q(last_name__icontains=q)
    ).order_by('email')[:10]

    return [
        {
            "id": u.id,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
        }
        for u in qs
    ]


@router.get("/{ws_uuid}/members/", response=list[MemberOut], auth=session_mfa_auth)
def list_members(request: HttpRequest, ws_uuid: UUID):
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
    except HttpError:
        raise HttpError(404, "Workspace not found")

    memberships = ws.memberships.select_related('user').all()
    return [
        {
            "user_id": m.user.id,
            "username": m.user.username,
            "email": m.user.email,
            "role": m.role,
            "joined_at": m.joined_at,
        }
        for m in memberships
    ]


@router.post("/{ws_uuid}/members/", response={201: MemberOut}, auth=session_mfa_auth)
def invite_member(request: HttpRequest, ws_uuid: UUID, payload: MemberInviteIn):
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if ws.is_personal:
        raise HttpError(403, "Cannot add members to a personal workspace")
    if membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only owners or admins can invite members")

    try:
        user = User.objects.get(email=payload.email)
    except User.DoesNotExist:
        raise HttpError(404, f"No user found with email {payload.email}")

    m, created = WorkspaceMembership.objects.get_or_create(
        workspace=ws, user=user,
        defaults={'role': payload.role or 'member'}
    )
    if not created:
        raise HttpError(409, "User is already a member")

    return 201, {
        "user_id": user.id, "username": user.username,
        "email": user.email, "role": m.role, "joined_at": m.joined_at,
    }


@router.delete("/{ws_uuid}/members/{user_id}/", response={200: dict}, auth=session_mfa_auth)
def remove_member(request: HttpRequest, ws_uuid: UUID, user_id: int):
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        caller_membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if ws.is_personal:
        raise HttpError(403, "Cannot remove members from a personal workspace")
    if caller_membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only owners or admins can remove members")

    try:
        m = ws.memberships.get(user_id=user_id)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Member not found")

    # Admins cannot remove owners
    if caller_membership.role == 'admin' and m.role == 'owner':
        raise HttpError(403, "Admins cannot remove owners")

    m.delete()
    return {"status": "removed"}


@router.patch("/{ws_uuid}/members/{user_id}/", response=MemberOut, auth=session_mfa_auth)
def change_member_role(request: HttpRequest, ws_uuid: UUID, user_id: int, payload: MemberRoleIn):
    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        caller_membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")
    if ws.is_personal:
        raise HttpError(403, "Cannot change member roles in a personal workspace")
    if caller_membership.role not in ('owner', 'admin'):
        raise HttpError(403, "Only owners or admins can change roles")

    try:
        m = ws.memberships.select_related('user').get(user_id=user_id)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Member not found")

    # Admins can only assign member/admin, not owner; cannot change an owner's role
    if caller_membership.role == 'admin':
        if m.role == 'owner':
            raise HttpError(403, "Admins cannot change an owner's role")
        if payload.role == 'owner':
            raise HttpError(403, "Admins cannot promote to owner")

    # Enforce single-owner: transferring ownership demotes the current owner to admin
    if payload.role == 'owner' and m.role != 'owner':
        ws.memberships.filter(role='owner').exclude(pk=m.pk).update(role='admin')

    m.role = payload.role
    m.save()
    return {
        "user_id": m.user.id, "username": m.user.username,
        "email": m.user.email, "role": m.role, "joined_at": m.joined_at,
    }


# ─── Workspace sessions / history ─────────────────────────────────────────────

@router.get("/{ws_uuid}/sessions/", response=list[dict], auth=session_mfa_auth)
def workspace_sessions(request: HttpRequest, ws_uuid: UUID):
    """Active sessions for this workspace (owners see all; members see own)."""
    from sessions.models import Container

    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    qs = Container.objects.filter(workspace=ws, active=True)
    if membership.role not in ('owner', 'admin'):
        qs = qs.filter(user=request.auth)

    return [
        {
            "uuid": str(c.uuid), "type": c.type, "user": c.user.username if c.user else None,
            "start_time": c.start_time.isoformat() if c.start_time else None,
        }
        for c in qs
    ]


@router.get("/{ws_uuid}/history/", response=list[dict], auth=session_mfa_auth)
def workspace_history(request: HttpRequest, ws_uuid: UUID):
    """Session history scoped to this workspace."""
    from sessions.models import Container

    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    qs = Container.objects.filter(workspace=ws).order_by('-date_created')
    if membership.role not in ('owner', 'admin'):
        qs = qs.filter(user=request.auth)

    return [
        {
            "uuid": str(c.uuid), "type": c.type,
            "user": c.user.username if c.user else None,
            "start_time": c.start_time.isoformat() if c.start_time else None,
            "closed_at": c.closed_at.isoformat() if c.closed_at else None,
            "session_cost_usd": str(c.session_cost_usd) if c.session_cost_usd else None,
        }
        for c in qs[:100]
    ]


# ─── Workspace browser access (admin only) ────────────────────────────────────

@router.get("/{ws_uuid}/browsers/", response=list[str], auth=session_mfa_auth)
def get_workspace_browsers(request: HttpRequest, ws_uuid: UUID):
    """Return slugs of browsers explicitly allowed in this workspace (empty = all)."""
    ws = _get_ws_for_user(ws_uuid, request.auth)
    return list(ws.allowed_browsers.values_list('slug', flat=True))


@router.get("/{ws_uuid}/dashboard/", response=dict, auth=session_mfa_auth)
def workspace_dashboard(request: HttpRequest, ws_uuid: UUID):
    """
    Aggregated dashboard data for the active workspace.

    Role-scoped:
    - owners/admins: full workspace view (all members, all sessions)
    - members: personal view (own sessions only)
    """
    from django.db.models import Sum, Count, Q
    from django.utils import timezone
    from datetime import timedelta
    from sessions.models import Container
    from cases.models import Case

    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    is_privileged = membership.role in ('owner', 'admin')
    now = timezone.now()
    thirty_days_ago = now - timedelta(days=30)

    # ── Base session querysets ─────────────────────────────────────────────────
    all_qs = Container.objects.filter(workspace=ws)
    if not is_privileged:
        all_qs = all_qs.filter(user=request.auth)

    active_qs = all_qs.filter(active=True)
    recent_qs = all_qs.filter(date_created__gte=thirty_days_ago)
    closed_recent = recent_qs.filter(active=False, closed_at__isnull=False)

    # ── Stat counts ───────────────────────────────────────────────────────────
    active_count = active_qs.count()
    total_sessions_30d = recent_qs.count()

    cost_agg = closed_recent.aggregate(total=Sum('session_cost_usd'))
    total_cost = float(cost_agg['total'] or 0)

    # Average duration (seconds) over the last 30 days
    durations = [
        (c.closed_at - c.start_time).total_seconds()
        for c in closed_recent.only('start_time', 'closed_at')
        if c.start_time and c.closed_at
    ]
    avg_duration = (sum(durations) / len(durations)) if durations else 0

    # ── Active sessions detail ────────────────────────────────────────────────
    active_sessions = []
    for c in active_qs.select_related('user').order_by('-start_time')[:10]:
        active_sessions.append({
            "uuid": str(c.uuid),
            "type": c.type,
            "user_email": c.user.email if c.user else None,
            "start_time": c.start_time.isoformat() if c.start_time else None,
            "capacity_provider": c.capacity_provider,
        })

    # ── Recent session history (last 5) ──────────────────────────────────────
    recent_history = []
    for c in all_qs.select_related('user', 'case').order_by('-date_created')[:5]:
        duration = None
        if c.start_time and c.closed_at:
            duration = (c.closed_at - c.start_time).total_seconds()
        recent_history.append({
            "uuid": str(c.uuid),
            "type": c.type,
            "user_email": c.user.email if c.user else None,
            "active": c.active,
            "start_time": c.start_time.isoformat() if c.start_time else None,
            "closed_at": c.closed_at.isoformat() if c.closed_at else None,
            "duration_seconds": duration,
            "capacity_provider": c.capacity_provider,
            "session_cost_usd": str(c.session_cost_usd) if c.session_cost_usd else None,
            "case_name": c.case.name if c.case else None,
            "case_uuid": str(c.case.uuid) if c.case else None,
        })

    # ── Cases summary ─────────────────────────────────────────────────────────
    cases_qs = Case.objects.filter(workspace=ws)
    if not is_privileged:
        cases_qs = cases_qs.filter(created_by=request.auth)

    cases_agg = cases_qs.aggregate(
        open=Count('id', filter=Q(status='open')),
        closed=Count('id', filter=Q(status='closed')),
        archived=Count('id', filter=Q(status='archived')),
    )
    recent_cases = []
    for case in cases_qs.order_by('-updated_at')[:5]:
        recent_cases.append({
            "uuid": str(case.uuid),
            "name": case.name,
            "status": case.status,
            "updated_at": case.updated_at.isoformat(),
            "session_count": case.sessions.count(),
        })

    # ── Most-used apps (last 30 days) ────────────────────────────────────────
    top_apps = list(
        recent_qs
        .exclude(type__isnull=True)
        .values('type')
        .annotate(count=Count('id'))
        .order_by('-count')[:5]
    )

    # ── Sessions + spend per day (last 14 days) ───────────────────────────────
    from django.db.models.functions import TruncDate
    import datetime as _dt

    fourteen_days_ago = now - timedelta(days=14)
    daily_qs = (
        all_qs
        .filter(date_created__gte=fourteen_days_ago)
        .annotate(day=TruncDate('date_created'))
        .values('day')
        .annotate(count=Count('id'), cost=Sum('session_cost_usd'))
        .order_by('day')
    )
    # Fill gaps so the chart line is continuous
    daily_map = {
        r['day']: {'sessions': r['count'], 'cost_usd': float(r['cost'] or 0)}
        for r in daily_qs if r['day']
    }
    sessions_per_day = []
    if daily_map:
        cursor = fourteen_days_ago.date()
        end = now.date()
        while cursor <= end:
            entry = daily_map.get(cursor, {'sessions': 0, 'cost_usd': 0.0})
            sessions_per_day.append({
                'date': cursor.strftime('%Y-%m-%d'),
                'sessions': entry['sessions'],
                'cost_usd': round(entry['cost_usd'], 4),
            })
            cursor += _dt.timedelta(days=1)

    # ── Member info (privileged only) ────────────────────────────────────────
    members = []
    if is_privileged:
        for m in ws.memberships.select_related('user').all():
            active_count_for_user = Container.objects.filter(
                workspace=ws, user=m.user, active=True
            ).count()
            members.append({
                "user_id": m.user.id,
                "email": m.user.email,
                "role": m.role,
                "active_sessions": active_count_for_user,
            })

    return {
        "role": membership.role,
        "is_personal": ws.is_personal,
        "stats": {
            "active_sessions": active_count,
            "total_sessions_30d": total_sessions_30d,
            "total_cost_30d_usd": round(total_cost, 4),
            "avg_duration_seconds": round(avg_duration),
        },
        "active_sessions": active_sessions,
        "recent_history": recent_history,
        "cases": {
            "open": cases_agg['open'],
            "closed": cases_agg['closed'],
            "archived": cases_agg['archived'],
            "recent": recent_cases,
        },
        "top_apps": top_apps,
        "sessions_per_day": sessions_per_day,
        "members": members,
    }


@router.put("/{ws_uuid}/browsers/", response=list[str], auth=session_mfa_auth)
def set_workspace_browsers(request: HttpRequest, ws_uuid: UUID, payload: BrowserSlugsIn):
    """Set the allowed browsers for a workspace.

    Constraints enforced by SiteSettings allowlists:
    - Personal workspaces: slugs must be a subset of default_personal_browser_slugs
      (or any globally-allowed slug when default_personal is empty).
    - Non-personal workspaces: slugs must be a subset of global_allowed_browser_slugs
      (empty global list = all browsers allowed).
    - Only site admins may bypass these restrictions.
    """
    import json
    from browsers.models import BrowserImage
    from users.models import UserProfile, SiteSettings

    try:
        ws = _get_ws_for_user(ws_uuid, request.auth)
        membership = ws.memberships.get(user=request.auth)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    profile, _ = UserProfile.objects.get_or_create(user=request.auth)
    if membership.role not in ('owner', 'admin') and not profile.is_admin:
        raise HttpError(403, "Only workspace owners, admins, or site admins can set browser access")

    # Site admins bypass allowlist restrictions
    if not profile.is_admin and payload.slugs:
        site = SiteSettings.get()
        global_slugs = json.loads(site.global_allowed_browser_slugs or '[]')
        personal_slugs = json.loads(site.default_personal_browser_slugs or '[]')

        if ws.is_personal:
            # Personal workspaces pick from the personal default list;
            # if that list is empty they may pick from the global list;
            # if both are empty all browsers are allowed.
            allowed_set = set(personal_slugs) if personal_slugs else set(global_slugs)
            if allowed_set:
                disallowed = set(payload.slugs) - allowed_set
                if disallowed:
                    raise HttpError(
                        400,
                        f"These browsers are not in the personal workspace allowlist: {', '.join(sorted(disallowed))}"
                    )
        else:
            # Non-personal workspaces pick from the global allowlist.
            if global_slugs:
                disallowed = set(payload.slugs) - set(global_slugs)
                if disallowed:
                    raise HttpError(
                        400,
                        f"These browsers are not in the global allowlist: {', '.join(sorted(disallowed))}"
                    )

    browsers = BrowserImage.objects.filter(slug__in=payload.slugs)
    ws.allowed_browsers.set(browsers)
    return list(ws.allowed_browsers.values_list('slug', flat=True))
