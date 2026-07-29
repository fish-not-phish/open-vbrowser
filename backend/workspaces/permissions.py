"""
Workspace role hierarchy and permission helpers.

Hierarchy: owner > admin > member > analyst > viewer

    viewer  — read-only: browse files, download, view cases, comment
    analyst — viewer + launch sessions, create/edit cases, manage case attachments/links
    member  — analyst + S3 storage writes (upload, delete, mkdir)
    admin   — member + workspace settings, member management
    owner   — admin + delete workspace
"""

from ninja.errors import HttpError

from .models import WorkspaceMembership


ROLE_RANK: dict[str, int] = {
    "viewer": 0,
    "analyst": 1,
    "member": 2,
    "admin": 3,
    "owner": 4,
}

ALL_ROLES = list(ROLE_RANK.keys())


def role_at_least(role: str | None, min_role: str) -> bool:
    """Return True if *role* is >= *min_role* in the hierarchy."""
    if role is None:
        return False
    return ROLE_RANK.get(role, -1) >= ROLE_RANK.get(min_role, 0)


def get_membership(ws, user) -> WorkspaceMembership | None:
    """Return the user's WorkspaceMembership in *ws*, or None."""
    try:
        return ws.memberships.get(user=user)
    except WorkspaceMembership.DoesNotExist:
        return None


def user_role_at_least(ws, user, min_role: str) -> bool:
    """Return True if *user*'s role in *ws* is >= *min_role*."""
    mem = get_membership(ws, user)
    return role_at_least(mem.role if mem else None, min_role)


def require_role(ws, user, min_role: str) -> WorkspaceMembership:
    """Raise 404/403 if *user*'s role in *ws* is below *min_role*.

    Returns the membership on success.
    """
    mem = get_membership(ws, user)
    if mem is None:
        raise HttpError(404, "Workspace not found")
    if not role_at_least(mem.role, min_role):
        raise HttpError(403, "Insufficient permissions for this action")
    return mem
