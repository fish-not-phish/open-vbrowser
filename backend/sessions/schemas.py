from ninja import Schema
from typing import Optional
from datetime import datetime
from decimal import Decimal
import uuid
from uuid import UUID


class SessionCreateIn(Schema):
    browser_type: str
    auto_open_url: Optional[str] = ""
    session_type: Optional[str] = "vstandard"  # "vstandard" or "vspot"
    workspace_uuid: Optional[UUID] = None
    enable_traffic_log: bool = False   # mitmproxy network logging
    file_protection: bool = False      # 7z-encrypt downloaded files
    persistent_storage: bool = False   # mount S3 Files at /config/Downloads


class SessionStatusOut(Schema):
    uuid: uuid.UUID
    status: str  # "pending" | "active" | "closed"
    container_url: Optional[str] = None
    max_wait_time: int = 300000  # ms


class SessionDetailOut(Schema):
    uuid: uuid.UUID
    type: Optional[str] = None
    container_url: Optional[str] = None
    session_token: Optional[str] = None
    active: bool
    start_time: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    capacity_provider: Optional[str] = None
    subdomain: Optional[str] = None
    ip_address: Optional[str] = None
    vcpu: Optional[Decimal] = None
    memory_gb: Optional[Decimal] = None
    session_cost_usd: Optional[Decimal] = None
    workspace_slug: Optional[str] = None
    workspace_uuid: Optional[UUID] = None
    case_id: Optional[int] = None
    tags: list[str] = []
    enable_traffic_log: bool = False
    persistent_storage: bool = False


class SessionCallbackIn(Schema):
    uuid: str
    public_ip: str
    private_ip: str
    task_arn: str
    capacity_provider: str
    vcpu: Optional[float] = 0.25
    memory_gb: Optional[float] = 0.5


class SessionHistoryOut(Schema):
    uuid: uuid.UUID
    type: Optional[str] = None
    url: Optional[str] = None
    category: Optional[str] = None
    active: bool = False
    container_url: Optional[str] = None
    start_time: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    subdomain: Optional[str] = None
    ip_address: Optional[str] = None
    capacity_provider: Optional[str] = None
    session_cost_usd: Optional[Decimal] = None
    notes_count: int = 0
    tags: list[str] = []
    tag_uuids: list[str] = []
    case_name: Optional[str] = None
    case_uuid: Optional[str] = None
    enable_traffic_log: bool = False
    traffic_event_count: int = 0


class TrafficEventOut(Schema):
    id: int
    timestamp: datetime
    host: str
    url: str
    method: str
    flagged: bool = False



class NoteCreateIn(Schema):
    body: str


class NoteOut(Schema):
    uuid: UUID
    body: str
    author_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class TagAssignIn(Schema):
    tag_uuids: list[UUID]


class CaseAssignIn(Schema):
    case_uuid: Optional[UUID] = None  # None to unassign


class SpendOut(Schema):
    total_usd: Decimal
    period: str
    by_browser: list[dict]
    by_capacity_provider: dict
    by_day: list[dict]


class TrafficEventIn(Schema):
    t: str           # ISO-8601 UTC timestamp from the container proxy
    h: str           # hostname or raw IP
    u: str           # full URI (e.g. https://example.com/path?q=1)
    m: Optional[str] = ""  # HTTP method (GET, POST, …)
