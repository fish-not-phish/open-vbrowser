from ninja import Schema
from datetime import datetime
from typing import Optional
from uuid import UUID


class AuthStatusOut(Schema):
    isLoggedIn: bool


class MessageOut(Schema):
    success: bool
    message: str


class MeOut(Schema):
    id: int
    username: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    isAdmin: bool
    canCreateWorkspaces: bool
    personalWorkspacesEnabled: bool
    phone: Optional[str] = None


class ProfileUpdateIn(Schema):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None


class PasswordChangeIn(Schema):
    current_password: str
    new_password: str


class SiteSettingsOut(Schema):
    allow_registration: bool
    allow_personal_workspaces: bool
    allow_workspace_creation: bool
    oidc_enabled: bool
    oidc_provider_type: str
    oidc_client_id: str
    oidc_server_url: str
    oidc_client_secret_set: bool
    default_idle_timeout_minutes: int
    default_max_concurrent_sessions: int
    default_max_session_duration_hours: Optional[int] = None
    # Browser allowlists
    global_allowed_browser_slugs: list[str] = []
    default_personal_browser_slugs: list[str] = []
    # Feature flags
    enable_network_logging: bool = False
    enable_file_protection: bool = False
    # Resource provisioning
    browser_vcpu: float = 0.5
    browser_memory_gb: float = 2.0
    os_vcpu: float = 2.0
    os_memory_gb: float = 4.0


class SiteSettingsIn(Schema):
    allow_registration: Optional[bool] = None
    allow_personal_workspaces: Optional[bool] = None
    allow_workspace_creation: Optional[bool] = None
    oidc_enabled: Optional[bool] = None
    oidc_provider_type: Optional[str] = None
    oidc_client_id: Optional[str] = None
    oidc_client_secret: Optional[str] = None
    oidc_server_url: Optional[str] = None
    default_idle_timeout_minutes: Optional[int] = None
    default_max_concurrent_sessions: Optional[int] = None
    default_max_session_duration_hours: Optional[int] = None
    # Browser allowlists
    global_allowed_browser_slugs: Optional[list[str]] = None
    default_personal_browser_slugs: Optional[list[str]] = None
    # Feature flags
    enable_network_logging: Optional[bool] = None
    enable_file_protection: Optional[bool] = None
    # Resource provisioning
    browser_vcpu: Optional[float] = None
    browser_memory_gb: Optional[float] = None
    os_vcpu: Optional[float] = None
    os_memory_gb: Optional[float] = None


class APIKeyOut(Schema):
    uuid: UUID
    name: str
    key: str
    active: bool
    created_at: datetime
    last_used_at: Optional[datetime] = None


class APIKeyCreateIn(Schema):
    name: Optional[str] = ""


class UserLimitsOut(Schema):
    max_concurrent_sessions: Optional[int] = None
    idle_timeout_minutes: Optional[int] = None
    max_session_duration_hours: Optional[int] = None
    # Resolved effective values (user override or site default)
    effective_max_concurrent_sessions: int
    effective_idle_timeout_minutes: int
    effective_max_session_duration_hours: Optional[int] = None


class AdminUserOut(Schema):
    id: int
    username: str
    email: str
    first_name: str
    last_name: str
    is_active: bool
    is_admin: bool
    date_joined: datetime


class AdminUserCreateIn(Schema):
    email: str
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    is_admin: bool = False


class AdminUserUpdateIn(Schema):
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None


class DjangoSessionOut(Schema):
    session_key: str
    last_activity: Optional[datetime] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_current: bool


class MFAStatusOut(Schema):
    totp_enabled: bool
    oidc_active: bool
