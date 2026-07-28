from ninja import Schema
from typing import Optional, Any


class AuditLogOut(Schema):
    id: int
    timestamp: str
    actor_id: Optional[int] = None
    actor_username: Optional[str] = None
    action: str
    target_user_id: Optional[int] = None
    target_user_username: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: dict[str, Any] = {}
