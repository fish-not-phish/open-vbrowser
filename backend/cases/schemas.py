from ninja import Schema
from typing import Optional
from datetime import datetime
from uuid import UUID


class TagOut(Schema):
    uuid: UUID
    name: str
    color: str
    workspace_id: Optional[int] = None


class TagCreateIn(Schema):
    name: str
    color: Optional[str] = "#6366f1"
    workspace_uuid: Optional[UUID] = None


class CaseCreateIn(Schema):
    name: str
    description: Optional[str] = ""
    workspace_uuid: Optional[UUID] = None


class CaseUpdateIn(Schema):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class CaseSessionOut(Schema):
    uuid: UUID
    type: Optional[str] = None
    active: bool
    start_time: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    capacity_provider: Optional[str] = None
    session_cost_usd: Optional[str] = None


class CaseOut(Schema):
    uuid: UUID
    name: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int] = None
    workspace_id: Optional[int] = None
    session_count: int = 0
    sessions: list[CaseSessionOut] = []


class CaseCommentOut(Schema):
    uuid: UUID
    body: str
    author_id: Optional[int] = None
    author_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CaseCommentCreateIn(Schema):
    body: str


class CaseCommentUpdateIn(Schema):
    body: str


class CaseAttachmentOut(Schema):
    uuid: UUID
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_id: Optional[int] = None
    uploaded_by_email: Optional[str] = None
    created_at: datetime
    url: str
