from ninja import Router
from django.middleware.csrf import get_token
from django.http import HttpRequest
from django.utils import timezone
from django.http import Http404
from .schemas import *
from .models import UserProfile, SiteSettings, ExtendProfile, APIKey, UserLimit
import json
import secrets
import string
from .auth import session_mfa_auth, admin_session_auth
from audit.services import log_audit

router = Router(tags=["auth"])

def _sync_oidc_social_app(config: SiteSettings):
    from allauth.socialaccount.models import SocialApp
    from django.contrib.sites.models import Site

    SocialApp.objects.filter(provider='openid_connect').delete()

    if not config.oidc_enabled or not all([config.oidc_provider_type, config.oidc_client_id, config.oidc_server_url]):
        return

    app = SocialApp.objects.create(
        provider='openid_connect',
        provider_id=config.oidc_provider_type,
        name='SSO',
        client_id=config.oidc_client_id,
        secret=config.oidc_client_secret,
        settings={'server_url': config.oidc_server_url},
    )
    app.sites.add(Site.objects.get_current())

# ======================
# CSRF
# ======================

@router.get("/csrf", response=dict)
def get_csrf(request: HttpRequest):
    """Fetch CSRF token for frontend (Next.js, etc.)"""
    return {"csrfToken": get_token(request)}


# ======================
# Auth status
# ======================

@router.get("/status", response=AuthStatusOut)
def auth_status(request: HttpRequest):
    return {"isLoggedIn": request.user.is_authenticated}


@router.get("/me", response=MeOut, auth=session_mfa_auth)
def me(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.auth)
    site = SiteSettings.get()
    u = request.auth
    phone = None
    try:
        phone = u.extend_profile.phone
    except ExtendProfile.DoesNotExist:
        pass
    return {
        "id": u.id,
        "username": u.get_username() if hasattr(u, "get_username") else u.username,
        "email": getattr(u, "email", None),
        "first_name": getattr(u, "first_name", None),
        "last_name": getattr(u, "last_name", None),
        "isAdmin": profile.is_admin,
        "canCreateWorkspaces": profile.is_admin or site.allow_workspace_creation,
        "personalWorkspacesEnabled": site.allow_personal_workspaces,
        "phone": phone,
    }


# ======================
# Profile update
# ======================

@router.patch("/profile", response=MeOut, auth=session_mfa_auth)
def update_profile(request, payload: ProfileUpdateIn):
    """Update user's name and phone."""
    u = request.auth
    if payload.first_name is not None:
        u.first_name = payload.first_name
    if payload.last_name is not None:
        u.last_name = payload.last_name
    u.save()

    if payload.phone is not None:
        ep, _ = ExtendProfile.objects.get_or_create(user=u)
        ep.phone = payload.phone
        ep.save()

    profile, _ = UserProfile.objects.get_or_create(user=u)
    site = SiteSettings.get()
    phone = None
    try:
        phone = u.extend_profile.phone
    except ExtendProfile.DoesNotExist:
        pass
    return {
        "id": u.id,
        "username": u.get_username(),
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "isAdmin": profile.is_admin,
        "canCreateWorkspaces": profile.is_admin or site.allow_workspace_creation,
        "personalWorkspacesEnabled": site.allow_personal_workspaces,
        "phone": phone,
    }


@router.post("/change-password", response=MessageOut, auth=session_mfa_auth)
def change_password(request, payload: PasswordChangeIn):
    """Change user password"""
    user = request.auth

    if not user.check_password(payload.current_password):
        return {"success": False, "message": "Current password is incorrect"}

    if len(payload.new_password) < 8:
        return {"success": False, "message": "New password must be at least 8 characters"}

    user.set_password(payload.new_password)
    user.save()

    return {"success": True, "message": "Password changed successfully"}


# ======================
# API Keys
# ======================

@router.get("/api-keys", response=list[APIKeyOut], auth=session_mfa_auth)
def list_api_keys(request):
    """List all active API keys for the current user."""
    keys = APIKey.objects.filter(user=request.auth, active=True).order_by("-created_at")
    return list(keys)


@router.post("/api-keys", response=APIKeyOut, auth=session_mfa_auth)
def create_api_key(request, payload: APIKeyCreateIn):
    """Create a new API key."""
    key = APIKey.objects.create(user=request.auth, name=payload.name or "")
    log_audit(request, 'api_key.create', key_name=key.name)
    return key


@router.delete("/api-keys/{key_uuid}", response=MessageOut, auth=session_mfa_auth)
def delete_api_key(request, key_uuid: str):
    """Revoke an API key."""
    try:
        key = APIKey.objects.get(uuid=key_uuid, user=request.auth)
    except APIKey.DoesNotExist:
        return {"success": False, "message": "API key not found"}
    key.active = False
    key.save()
    log_audit(request, 'api_key.delete', key_name=key.name)
    return {"success": True, "message": "API key revoked"}


# ======================
# User limits (read-only for users, admin can see all)
# ======================

def _resolve_limits(user) -> dict:
    site = SiteSettings.get()
    try:
        ul = user.limits
        max_conc = ul.max_concurrent_sessions
        idle = ul.idle_timeout_minutes
        max_dur = ul.max_session_duration_hours
    except UserLimit.DoesNotExist:
        max_conc = None
        idle = None
        max_dur = None

    return {
        "max_concurrent_sessions": max_conc,
        "idle_timeout_minutes": idle,
        "max_session_duration_hours": max_dur,
        "effective_max_concurrent_sessions": max_conc if max_conc is not None else site.default_max_concurrent_sessions,
        "effective_idle_timeout_minutes": idle if idle is not None else site.default_idle_timeout_minutes,
        "effective_max_session_duration_hours": max_dur if max_dur is not None else site.default_max_session_duration_hours,
    }


@router.get("/limits", response=UserLimitsOut, auth=session_mfa_auth)
def get_my_limits(request):
    """Get the current user's effective resource limits."""
    return _resolve_limits(request.auth)


# ======================
# Site Settings (admin only)
# ======================

def _site_settings_out(config: SiteSettings) -> dict:
    return {
        "allow_registration": config.allow_registration,
        "allow_personal_workspaces": config.allow_personal_workspaces,
        "allow_workspace_creation": config.allow_workspace_creation,
        "oidc_enabled": config.oidc_enabled,
        "oidc_provider_type": config.oidc_provider_type,
        "oidc_client_id": config.oidc_client_id,
        "oidc_server_url": config.oidc_server_url,
        "oidc_client_secret_set": bool(config.oidc_client_secret),
        "default_idle_timeout_minutes": config.default_idle_timeout_minutes,
        "default_max_concurrent_sessions": config.default_max_concurrent_sessions,
        "default_max_session_duration_hours": config.default_max_session_duration_hours,
        "global_allowed_browser_slugs": json.loads(config.global_allowed_browser_slugs or '[]'),
        "default_personal_browser_slugs": json.loads(config.default_personal_browser_slugs or '[]'),
        "enable_network_logging": config.enable_network_logging,
        "enable_file_protection": config.enable_file_protection,
        "enable_persistent_storage": config.enable_persistent_storage,
        "browser_vcpu": float(config.browser_vcpu),
        "browser_memory_gb": float(config.browser_memory_gb),
        "os_vcpu": float(config.os_vcpu),
        "os_memory_gb": float(config.os_memory_gb),
    }


@router.get("/site-settings", response=SiteSettingsOut, auth=admin_session_auth)
def get_site_settings(request: HttpRequest):
    return _site_settings_out(SiteSettings.get())


@router.patch("/site-settings", response=SiteSettingsOut, auth=admin_session_auth)
def update_site_settings(request: HttpRequest, payload: SiteSettingsIn):
    config = SiteSettings.get()
    prev_oidc_enabled = config.oidc_enabled

    fields = [
        "allow_registration", "allow_personal_workspaces", "allow_workspace_creation",
        "oidc_enabled", "oidc_provider_type",
        "oidc_client_id", "oidc_client_secret", "oidc_server_url",
        "default_idle_timeout_minutes", "default_max_concurrent_sessions",
        "default_max_session_duration_hours",
        "enable_network_logging", "enable_file_protection", "enable_persistent_storage",
        "browser_vcpu", "browser_memory_gb", "os_vcpu", "os_memory_gb",
    ]
    for field in fields:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(config, field, val)

    # JSON list fields — use sentinel None to detect "not provided"
    if payload.global_allowed_browser_slugs is not None:
        config.global_allowed_browser_slugs = json.dumps(payload.global_allowed_browser_slugs)
    if payload.default_personal_browser_slugs is not None:
        config.default_personal_browser_slugs = json.dumps(payload.default_personal_browser_slugs)

    config.save()
    _sync_oidc_social_app(config)

    # Auto-disable MFA when OIDC is enabled; restore when OIDC is disabled.
    if payload.oidc_enabled is not None and payload.oidc_enabled != prev_oidc_enabled:
        _sync_mfa_on_oidc_change(config.oidc_enabled)

    log_audit(request, 'site_settings.update')
    return _site_settings_out(config)


def _sync_mfa_on_oidc_change(oidc_now_enabled: bool):
    """
    When OIDC is toggled:
    - Enabling OIDC: deactivate TOTP for all users and record who had it
      (stored in SiteSettings.mfa_suspended_user_ids via a JSON field, or just
      use ExtendProfile since we have it — we'll store a simple flag on a new
      model field-free approach using the DB session).
    - Disabling OIDC: re-activate TOTP for users who had it before.

    We store suspended user IDs in SiteSettings.mfa_suspended_user_ids (JSON).
    """
    from allauth.mfa.models import Authenticator
    from django.contrib.auth.models import User as DjangoUser
    import json

    config = SiteSettings.get()

    if oidc_now_enabled:
        # Find all users with active TOTP and suspend them
        totp_users = list(
            Authenticator.objects.filter(type=Authenticator.Type.TOTP)
            .values_list('user_id', flat=True)
        )
        # Save the list for restoration later
        config.mfa_suspended_user_ids = json.dumps(totp_users)
        config.save(update_fields=['mfa_suspended_user_ids'])
        # Delete their TOTP authenticators
        Authenticator.objects.filter(type=Authenticator.Type.TOTP).delete()
    else:
        # Restore TOTP for users who had it — they'll need to re-enrol
        # (we can't restore the secret, but we can notify them).
        # For now, simply clear the suspended list — users must re-setup MFA.
        config.mfa_suspended_user_ids = json.dumps([])
        config.save(update_fields=['mfa_suspended_user_ids'])


# ======================
# Admin: User Management
# ======================

def _admin_user_out(user) -> dict:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "is_admin": profile.is_admin,
        "date_joined": user.date_joined,
    }


@router.get("/admin/users", response=list[AdminUserOut], auth=admin_session_auth)
def list_users(request: HttpRequest):
    """List all users (admin only)."""
    from django.contrib.auth.models import User as DjangoUser
    users = DjangoUser.objects.all().order_by('date_joined')
    return [_admin_user_out(u) for u in users]


@router.get("/admin/check-email", response=dict, auth=admin_session_auth)
def check_email_availability(request: HttpRequest, email: str):
    """Check whether an email address is already registered."""
    from django.contrib.auth.models import User as DjangoUser
    exists = DjangoUser.objects.filter(email__iexact=email).exists()
    return {"available": not exists}


def _derive_username(email: str) -> str:
    """Derive a unique username from an email address."""
    from django.contrib.auth.models import User as DjangoUser
    base = email.split("@")[0].lower()
    # Keep only safe characters
    base = ''.join(c if c.isalnum() or c in ('-', '_', '.') else '_' for c in base)
    base = base[:30]
    candidate = base
    counter = 1
    while DjangoUser.objects.filter(username=candidate).exists():
        suffix = str(counter)
        candidate = f"{base[:30 - len(suffix)]}{suffix}"
        counter += 1
    return candidate


@router.post("/admin/users", response={201: AdminUserOut}, auth=admin_session_auth)
def create_user(request: HttpRequest, payload: AdminUserCreateIn):
    """Create a new user with a randomly generated password (admin only)."""
    from django.contrib.auth.models import User as DjangoUser
    if DjangoUser.objects.filter(email__iexact=payload.email).exists():
        raise HttpError(409, "Email already in use")

    username = _derive_username(payload.email)

    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(16))

    user = DjangoUser.objects.create_user(
        username=username,
        email=payload.email,
        password=password,
        first_name=payload.first_name or '',
        last_name=payload.last_name or '',
    )
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.is_admin = payload.is_admin
    profile.save()

    # Always provision a personal workspace for admin-created users, regardless
    # of the allow_personal_workspaces site setting (which only gates the signal
    # path used during self-registration).
    from workspaces.models import Workspace, WorkspaceMembership
    from workspaces.signals import _personal_slug
    slug = _personal_slug(user)
    counter = 0
    candidate = slug
    while Workspace.objects.filter(slug=candidate).exists():
        counter += 1
        candidate = f'{slug}-{counter}'
    ws, _ = Workspace.objects.get_or_create(
        slug=candidate,
        defaults={'name': 'Personal', 'created_by': user, 'is_personal': True},
    )
    WorkspaceMembership.objects.get_or_create(
        workspace=ws, user=user, defaults={'role': 'owner'},
    )

    out = _admin_user_out(user)
    out['generated_password'] = password
    log_audit(request, 'user.create', target_user=user, email=user.email, is_admin=payload.is_admin)
    return 201, out


# ======================
# Django Sessions (user's own login sessions)
# ======================

@router.get("/sessions", response=list[DjangoSessionOut], auth=session_mfa_auth)
def list_my_sessions(request: HttpRequest):
    """List all active Django sessions for the current user."""
    from django.contrib.sessions.models import Session
    import json

    user_id = request.auth.id
    current_key = request.session.session_key

    now = timezone.now()
    active_sessions = Session.objects.filter(expire_date__gt=now)

    result = []
    for s in active_sessions:
        try:
            data = s.get_decoded()
        except Exception:
            continue
        if str(data.get('_auth_user_id', '')) != str(user_id):
            continue
        result.append({
            "session_key": s.session_key,
            "last_activity": s.expire_date,
            "ip_address": data.get('_session_ip'),
            "user_agent": data.get('_session_ua'),
            "is_current": s.session_key == current_key,
        })

    return result


@router.delete("/sessions/{session_key}", response=MessageOut, auth=session_mfa_auth)
def revoke_session(request: HttpRequest, session_key: str):
    """Revoke a specific Django session for the current user."""
    from django.contrib.sessions.models import Session
    import json

    user_id = request.auth.id

    try:
        s = Session.objects.get(session_key=session_key)
        data = s.get_decoded()
        if str(data.get('_auth_user_id', '')) != str(user_id):
            return {"success": False, "message": "Session not found"}
        s.delete()
        log_audit(request, 'session.revoke', session_key=session_key[:8])
        return {"success": True, "message": "Session revoked"}
    except Session.DoesNotExist:
        return {"success": False, "message": "Session not found"}


# ======================
# MFA Status
# ======================

@router.get("/mfa/status", response=MFAStatusOut, auth=session_mfa_auth)
def mfa_status(request: HttpRequest):
    """Return whether TOTP is enabled for this user and whether OIDC is active."""
    from allauth.mfa.models import Authenticator
    config = SiteSettings.get()
    totp_enabled = Authenticator.objects.filter(
        user=request.auth,
        type=Authenticator.Type.TOTP,
    ).exists()
    return {
        "totp_enabled": totp_enabled,
        "oidc_active": config.oidc_enabled,
    }


@router.patch("/admin/users/{user_id}", response=AdminUserOut, auth=admin_session_auth)
def update_user(request: HttpRequest, user_id: int, payload: AdminUserUpdateIn):
    """Update a user's profile or admin status (admin only)."""
    from django.contrib.auth.models import User as DjangoUser
    try:
        user = DjangoUser.objects.get(id=user_id)
    except DjangoUser.DoesNotExist:
        raise HttpError(404, "User not found")

    changes = {}
    if payload.first_name is not None:
        changes['first_name'] = payload.first_name
        user.first_name = payload.first_name
    if payload.last_name is not None:
        changes['last_name'] = payload.last_name
        user.last_name = payload.last_name
    if payload.email is not None:
        changes['email'] = payload.email
        user.email = payload.email
    if payload.is_active is not None:
        changes['is_active'] = payload.is_active
        user.is_active = payload.is_active
    user.save()

    if payload.is_admin is not None:
        changes['is_admin'] = payload.is_admin
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.is_admin = payload.is_admin
        profile.save()

    if changes:
        log_audit(request, 'user.update', target_user=user, **changes)
    return _admin_user_out(user)


@router.get("/admin/analytics", response=AdminAnalyticsOut, auth=admin_session_auth)
def admin_analytics(
    request: HttpRequest,
    from_date: str = None,
    to_date: str = None,
    user_id: int = None,
    workspace_uuid: str = None,
):
    """
    Return aggregated analytics for the global admin dashboard.

    Supports optional date range (from_date / to_date as ISO date strings)
    and optional scoping to a single user (user_id) or workspace (workspace_uuid).
    When scoped, all metrics are filtered to that entity.
    """
    from django.contrib.auth.models import User as DjangoUser
    from django.db.models import Sum, Count, Avg, Q
    from django.utils.dateparse import parse_date
    from sessions.models import Container
    from workspaces.models import Workspace
    from cases.models import Case
    from browsers.models import BrowserImage
    import datetime

    # ── Date range filter ─────────────────────────────────────────────────────
    date_filter = Q()
    if from_date:
        try:
            fd = parse_date(from_date)
            if fd:
                date_filter &= Q(date_created__date__gte=fd)
        except Exception:
            pass
    if to_date:
        try:
            td = parse_date(to_date)
            if td:
                date_filter &= Q(date_created__date__lte=td)
        except Exception:
            pass

    # ── Scope filter ──────────────────────────────────────────────────────────
    scope_filter = Q()
    if user_id:
        scope_filter &= Q(user_id=user_id)
    if workspace_uuid:
        scope_filter &= Q(workspace__uuid=workspace_uuid)

    base_qs = Container.objects.filter(date_filter & scope_filter)

    # ── Core session aggregates ───────────────────────────────────────────────
    from django.db.models import ExpressionWrapper, DurationField, F

    agg = base_qs.aggregate(
        total_cost=Sum('session_cost_usd'),
        total_sessions=Count('id'),
    )

    # Average duration — derived from start_time/closed_at since duration_seconds
    # is not a stored field on the Container model.
    closed_qs = base_qs.filter(closed_at__isnull=False, start_time__isnull=False)
    avg_dur = 0.0
    if closed_qs.exists():
        dur_agg = closed_qs.annotate(
            dur=ExpressionWrapper(F('closed_at') - F('start_time'), output_field=DurationField())
        ).aggregate(avg_dur=Avg('dur'))
        if dur_agg['avg_dur']:
            avg_dur = dur_agg['avg_dur'].total_seconds()

    active_count = base_qs.filter(active=True).count()
    total_sessions = agg['total_sessions']
    total_cost = float(agg['total_cost'] or 0)

    # ── Cases ─────────────────────────────────────────────────────────────────
    cases_qs = Case.objects.filter(status='open')
    if user_id:
        cases_qs = cases_qs.filter(created_by_id=user_id)
    if workspace_uuid:
        cases_qs = cases_qs.filter(workspace__uuid=workspace_uuid)
    if from_date or to_date:
        if from_date:
            try:
                fd = parse_date(from_date)
                if fd:
                    cases_qs = cases_qs.filter(created_at__date__gte=fd)
            except Exception:
                pass
        if to_date:
            try:
                td = parse_date(to_date)
                if td:
                    cases_qs = cases_qs.filter(created_at__date__lte=td)
            except Exception:
                pass
    open_cases = cases_qs.count()

    # ── Workspaces (non-personal) ─────────────────────────────────────────────
    ws_qs = Workspace.objects.filter(is_personal=False)
    if user_id:
        ws_qs = ws_qs.filter(members__id=user_id)
    if workspace_uuid:
        ws_qs = ws_qs.filter(uuid=workspace_uuid)
    total_workspaces = ws_qs.count()

    # ── Browser display name lookup ───────────────────────────────────────────
    browser_names = {b.slug: b.display_name for b in BrowserImage.objects.all()}

    # ── Most active users (top 10 by session count) ───────────────────────────
    user_session_qs = (
        base_qs
        .values('user_id', 'user__email', 'user__first_name', 'user__last_name')
        .annotate(session_count=Count('id'), total_cost=Sum('session_cost_usd'))
        .order_by('-session_count')[:10]
    )
    most_active_users = [
        {
            'user_id': r['user_id'],
            'email': r['user__email'] or '',
            'name': f"{r['user__first_name'] or ''} {r['user__last_name'] or ''}".strip() or r['user__email'] or '',
            'session_count': r['session_count'],
            'total_cost_usd': float(r['total_cost'] or 0),
        }
        for r in user_session_qs
    ]

    # ── Most used apps (top 10 by session count) ──────────────────────────────
    app_qs = (
        base_qs
        .values('type')
        .annotate(session_count=Count('id'))
        .order_by('-session_count')[:10]
    )
    most_used_apps = [
        {
            'slug': r['type'] or '',
            'display_name': browser_names.get(r['type'] or '', r['type'] or ''),
            'session_count': r['session_count'],
        }
        for r in app_qs
    ]

    # ── Most active workspaces (top 10, non-personal) ─────────────────────────
    ws_session_qs = (
        base_qs
        .filter(workspace__is_personal=False)
        .values('workspace__uuid', 'workspace__name')
        .annotate(session_count=Count('id'), total_cost=Sum('session_cost_usd'))
        .order_by('-session_count')[:10]
    )
    most_active_workspaces = [
        {
            'uuid': str(r['workspace__uuid']) if r['workspace__uuid'] else '',
            'name': r['workspace__name'] or '',
            'session_count': r['session_count'],
            'total_cost_usd': float(r['total_cost'] or 0),
        }
        for r in ws_session_qs
    ]

    # ── Cost per user (top 10 by total cost) ─────────────────────────────────
    cost_user_qs = (
        base_qs
        .values('user_id', 'user__email', 'user__first_name', 'user__last_name')
        .annotate(session_count=Count('id'), total_cost=Sum('session_cost_usd'))
        .order_by('-total_cost')[:10]
    )
    cost_per_user = [
        {
            'user_id': r['user_id'],
            'email': r['user__email'] or '',
            'name': f"{r['user__first_name'] or ''} {r['user__last_name'] or ''}".strip() or r['user__email'] or '',
            'session_count': r['session_count'],
            'total_cost_usd': float(r['total_cost'] or 0),
        }
        for r in cost_user_qs
    ]

    # ── Cost per workspace (top 10 by total cost, non-personal) ──────────────
    cost_ws_qs = (
        base_qs
        .filter(workspace__is_personal=False)
        .values('workspace__uuid', 'workspace__name')
        .annotate(session_count=Count('id'), total_cost=Sum('session_cost_usd'))
        .order_by('-total_cost')[:10]
    )
    cost_per_workspace = [
        {
            'uuid': str(r['workspace__uuid']) if r['workspace__uuid'] else '',
            'name': r['workspace__name'] or '',
            'session_count': r['session_count'],
            'total_cost_usd': float(r['total_cost'] or 0),
        }
        for r in cost_ws_qs
    ]

    # ── Sessions + spend per day (time-series, for the trend line chart) ────────
    from django.db.models.functions import TruncDate
    import datetime as dt

    daily_qs = (
        base_qs
        .annotate(day=TruncDate('date_created'))
        .values('day')
        .annotate(sessions=Count('id'), cost=Sum('session_cost_usd'))
        .order_by('day')
    )

    # Fill gaps so the chart line is continuous
    daily_map = {
        r['day']: {'sessions': r['sessions'], 'cost_usd': float(r['cost'] or 0)}
        for r in daily_qs if r['day']
    }
    if daily_map:
        first_day = min(daily_map)
        last_day = max(daily_map)
        sessions_per_day = []
        cursor = first_day
        while cursor <= last_day:
            entry = daily_map.get(cursor, {'sessions': 0, 'cost_usd': 0.0})
            sessions_per_day.append({
                'date': cursor.strftime('%Y-%m-%d'),
                'sessions': entry['sessions'],
                'cost_usd': round(entry['cost_usd'], 4),
            })
            cursor += dt.timedelta(days=1)
    else:
        sessions_per_day = []

    return {
        'total_cost_usd': total_cost,
        'active_sessions': active_count,
        'total_sessions': total_sessions,
        'avg_session_duration_seconds': avg_dur,
        'total_open_cases': open_cases,
        'total_workspaces': total_workspaces,
        'sessions_per_day': sessions_per_day,
        'most_active_users': most_active_users,
        'most_used_apps': most_used_apps,
        'most_active_workspaces': most_active_workspaces,
        'cost_per_user': cost_per_user,
        'cost_per_workspace': cost_per_workspace,
    }


@router.get("/admin/search-entities", response=dict, auth=admin_session_auth)
def admin_search_entities(request: HttpRequest, q: str = ''):
    """
    Search users and non-personal workspaces by name/email for the scope selector.
    Returns up to 10 users and 10 workspaces matching the query.
    """
    from django.contrib.auth.models import User as DjangoUser
    from workspaces.models import Workspace
    from django.db.models import Q as DQ

    users = []
    workspaces = []

    if q:
        user_qs = DjangoUser.objects.filter(
            is_active=True
        ).filter(
            DQ(email__icontains=q) | DQ(first_name__icontains=q) | DQ(last_name__icontains=q)
        ).order_by('email')[:10]
        users = [
            {
                'id': u.id,
                'email': u.email,
                'name': f"{u.first_name} {u.last_name}".strip() or u.email,
            }
            for u in user_qs
        ]

        ws_qs = Workspace.objects.filter(
            is_personal=False
        ).filter(
            DQ(name__icontains=q) | DQ(slug__icontains=q)
        ).order_by('name')[:10]
        workspaces = [
            {'uuid': str(ws.uuid), 'name': ws.name}
            for ws in ws_qs
        ]

    return {'users': users, 'workspaces': workspaces}


# ======================
# Admin: Workspace Management
# ======================

@router.get("/admin/workspaces", response=list[AdminWorkspaceOut], auth=admin_session_auth)
def admin_list_workspaces(request: HttpRequest, q: str = ''):
    """List all non-personal workspaces (admin only). Optionally filter by name/slug."""
    from workspaces.models import Workspace
    from django.db.models import Q as DQ

    qs = Workspace.objects.filter(is_personal=False).order_by('name')
    if q:
        qs = qs.filter(DQ(name__icontains=q) | DQ(slug__icontains=q))

    result = []
    for ws in qs:
        result.append({
            'id': ws.id,
            'uuid': str(ws.uuid),
            'name': ws.name,
            'slug': ws.slug,
            'created_at': ws.created_at,
            'created_by_email': ws.created_by.email if ws.created_by else None,
            'member_count': ws.memberships.count(),
        })
    return result


@router.get("/admin/workspaces/{ws_uuid}/members", response=list[AdminMemberOut], auth=admin_session_auth)
def admin_list_workspace_members(request: HttpRequest, ws_uuid: str):
    """List all members of any workspace (admin only)."""
    from workspaces.models import Workspace, WorkspaceMembership
    try:
        ws = Workspace.objects.get(uuid=ws_uuid)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    memberships = WorkspaceMembership.objects.filter(workspace=ws).select_related('user').order_by('role', 'joined_at')
    return [
        {
            'user_id': m.user.id,
            'username': m.user.username,
            'email': m.user.email,
            'first_name': m.user.first_name,
            'last_name': m.user.last_name,
            'role': m.role,
            'joined_at': m.joined_at,
        }
        for m in memberships
    ]


@router.post("/admin/workspaces/{ws_uuid}/members", response=AdminMemberOut, auth=admin_session_auth)
def admin_add_workspace_member(request: HttpRequest, ws_uuid: str, payload: AdminMemberInviteIn):
    """Add a user to any workspace by email (admin only)."""
    from django.contrib.auth.models import User as DjangoUser
    from workspaces.models import Workspace, WorkspaceMembership

    try:
        ws = Workspace.objects.get(uuid=ws_uuid)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    try:
        user = DjangoUser.objects.get(email__iexact=payload.email)
    except DjangoUser.DoesNotExist:
        raise HttpError(404, "No user found with that email address")

    if WorkspaceMembership.objects.filter(workspace=ws, user=user).exists():
        raise HttpError(409, "User is already a member of this workspace")

    role = payload.role if payload.role in ('owner', 'admin', 'member') else 'member'
    membership = WorkspaceMembership.objects.create(workspace=ws, user=user, role=role)

    log_audit(request, 'workspace.member.add', target_user=user,
              workspace_uuid=str(ws.uuid), workspace_name=ws.name, role=role)
    return {
        'user_id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'role': membership.role,
        'joined_at': membership.joined_at,
    }


@router.patch("/admin/workspaces/{ws_uuid}/members/{user_id}", response=AdminMemberOut, auth=admin_session_auth)
def admin_change_workspace_member_role(request: HttpRequest, ws_uuid: str, user_id: int, payload: AdminMemberRoleIn):
    """Change any member's role in any workspace (admin only). Ownership transfer supported."""
    from workspaces.models import Workspace, WorkspaceMembership

    try:
        ws = Workspace.objects.get(uuid=ws_uuid)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    try:
        membership = WorkspaceMembership.objects.select_related('user').get(workspace=ws, user_id=user_id)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Member not found")

    new_role = payload.role
    if new_role not in ('owner', 'admin', 'member'):
        raise HttpError(400, "Role must be 'owner', 'admin', or 'member'")

    # Ownership transfer: demote existing owner to admin first
    if new_role == 'owner':
        WorkspaceMembership.objects.filter(workspace=ws, role='owner').exclude(user_id=user_id).update(role='admin')

    membership.role = new_role
    membership.save()

    log_audit(request, 'workspace.member.role_change', target_user=membership.user,
              workspace_uuid=str(ws.uuid), workspace_name=ws.name, new_role=new_role)
    return {
        'user_id': membership.user.id,
        'username': membership.user.username,
        'email': membership.user.email,
        'first_name': membership.user.first_name,
        'last_name': membership.user.last_name,
        'role': membership.role,
        'joined_at': membership.joined_at,
    }


@router.delete("/admin/workspaces/{ws_uuid}/members/{user_id}", response=MessageOut, auth=admin_session_auth)
def admin_remove_workspace_member(request: HttpRequest, ws_uuid: str, user_id: int):
    """Remove any member from any workspace (admin only)."""
    from workspaces.models import Workspace, WorkspaceMembership

    try:
        ws = Workspace.objects.get(uuid=ws_uuid)
    except Workspace.DoesNotExist:
        raise HttpError(404, "Workspace not found")

    try:
        membership = WorkspaceMembership.objects.select_related('user').get(workspace=ws, user_id=user_id)
    except WorkspaceMembership.DoesNotExist:
        raise HttpError(404, "Member not found")

    log_audit(request, 'workspace.member.remove', target_user=membership.user,
              workspace_uuid=str(ws.uuid), workspace_name=ws.name)
    membership.delete()
    return {"success": True, "message": "Member removed"}


@router.post("/admin/users/{user_id}/reset-password", response=dict, auth=admin_session_auth)
def reset_user_password(request: HttpRequest, user_id: int):
    """Generate and set a new random password for a user (admin only)."""
    from django.contrib.auth.models import User as DjangoUser
    try:
        user = DjangoUser.objects.get(id=user_id)
    except DjangoUser.DoesNotExist:
        raise HttpError(404, "User not found")

    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    password = ''.join(secrets.choice(alphabet) for _ in range(16))
    user.set_password(password)
    user.save()
    log_audit(request, 'user.password_reset', target_user=user)
    return {"generated_password": password}