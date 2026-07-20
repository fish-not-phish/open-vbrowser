from ninja import Schema
from typing import Optional
from datetime import datetime
from uuid import UUID


class WorkspaceCreateIn(Schema):
    name: str
    slug: str


class WorkspaceUpdateIn(Schema):
    name: Optional[str] = None
    max_concurrent_sessions_per_member: Optional[int] = None
    idle_timeout_minutes: Optional[int] = None
    max_session_duration_hours: Optional[int] = None
    # Per-workspace feature flags (only effective when globally enabled)
    enable_network_logging: Optional[bool] = None
    enable_file_protection: Optional[bool] = None


class MemberOut(Schema):
    user_id: int
    username: str
    email: str
    role: str
    joined_at: datetime


class WorkspaceOut(Schema):
    id: int
    uuid: UUID
    name: str
    slug: str
    created_at: datetime
    max_concurrent_sessions_per_member: Optional[int] = None
    idle_timeout_minutes: Optional[int] = None
    max_session_duration_hours: Optional[int] = None
    member_count: int
    role: str  # caller's role in this workspace
    is_personal: bool = False
    allowed_browser_slugs: list[str] = []  # empty = all browsers allowed
    logo_url: Optional[str] = None
    # Per-workspace feature flags
    enable_network_logging: bool = False
    enable_file_protection: bool = False


class MemberInviteIn(Schema):
    email: str
    role: Optional[str] = "member"


class MemberRoleIn(Schema):
    role: str  # must be 'owner', 'admin', or 'member'
