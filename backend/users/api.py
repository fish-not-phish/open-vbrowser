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
        "enable_network_logging", "enable_file_protection",
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

    if payload.first_name is not None:
        user.first_name = payload.first_name
    if payload.last_name is not None:
        user.last_name = payload.last_name
    if payload.email is not None:
        user.email = payload.email
    if payload.is_active is not None:
        user.is_active = payload.is_active
    user.save()

    if payload.is_admin is not None:
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.is_admin = payload.is_admin
        profile.save()

    return _admin_user_out(user)


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
    return {"generated_password": password}