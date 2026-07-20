from ninja import Router, File
from ninja.files import UploadedFile
from django.http import HttpRequest, FileResponse
from ninja.errors import HttpError
from users.auth import session_mfa_auth
from .models import Case, Tag, SessionNote, CaseComment, CaseAttachment
from .schemas import (
    CaseCreateIn, CaseUpdateIn, CaseOut, TagCreateIn, TagOut,
    CaseCommentOut, CaseCommentCreateIn, CaseCommentUpdateIn,
    CaseAttachmentOut,
)
from uuid import UUID
from typing import Optional

router = Router(tags=["cases"])


def _case_out(case: Case) -> dict:
    sessions_qs = case.sessions.order_by('-date_created')
    sessions = []
    for s in sessions_qs:
        dur = None
        if s.start_time and s.closed_at:
            dur = (s.closed_at - s.start_time).total_seconds()
        elif s.start_time and s.active:
            from django.utils import timezone
            dur = (timezone.now() - s.start_time).total_seconds()
        sessions.append({
            "uuid": s.uuid,
            "type": s.type,
            "active": s.active,
            "start_time": s.start_time,
            "closed_at": s.closed_at,
            "duration_seconds": dur,
            "capacity_provider": s.capacity_provider,
            "session_cost_usd": str(s.session_cost_usd) if s.session_cost_usd else None,
        })
    return {
        "uuid": case.uuid,
        "name": case.name,
        "description": case.description,
        "status": case.status,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
        "created_by_id": case.created_by_id,
        "workspace_id": case.workspace_id,
        "session_count": len(sessions),
        "sessions": sessions,
    }


# ─── Cases ─────────────────────────────────────────────────────────────────────

@router.get("/", response=list[CaseOut], auth=session_mfa_auth)
def list_cases(request: HttpRequest, workspace_uuid: UUID = None):
    if workspace_uuid:
        # Any workspace member can see all cases in that workspace
        from workspaces.models import Workspace
        try:
            ws = Workspace.objects.get(uuid=workspace_uuid, memberships__user=request.auth)
        except Workspace.DoesNotExist:
            raise HttpError(404, "Workspace not found")
        qs = Case.objects.filter(workspace=ws)
    else:
        # Personal / unscoped — show only the caller's own cases
        qs = Case.objects.filter(created_by=request.auth, workspace__isnull=True)
    return [_case_out(c) for c in qs.order_by('-created_at')]


@router.post("/", response={201: CaseOut}, auth=session_mfa_auth)
def create_case(request: HttpRequest, payload: CaseCreateIn):
    workspace = None
    if payload.workspace_uuid:
        from workspaces.models import Workspace
        try:
            workspace = Workspace.objects.get(
                uuid=payload.workspace_uuid,
                memberships__user=request.auth
            )
        except Workspace.DoesNotExist:
            raise HttpError(404, "Workspace not found")

    case = Case.objects.create(
        name=payload.name,
        description=payload.description or '',
        workspace=workspace,
        created_by=request.auth,
    )
    return 201, _case_out(case)


# ─── Tags ──────────────────────────────────────────────────────────────────────
# Must be registered before /{case_uuid}/ routes to avoid the path param
# swallowing the literal "tags" segment.

@router.get("/tags/", response=list[TagOut], auth=session_mfa_auth)
def list_tags(request: HttpRequest, workspace_uuid: Optional[UUID] = None, personal: bool = False):
    qs = Tag.objects.all()
    if workspace_uuid:
        qs = qs.filter(workspace__uuid=workspace_uuid)
    elif personal:
        qs = qs.filter(workspace__isnull=True)
    return [{"uuid": t.uuid, "name": t.name, "color": t.color, "workspace_id": t.workspace_id} for t in qs]


@router.post("/tags/", response={201: TagOut}, auth=session_mfa_auth)
def create_tag(request: HttpRequest, payload: TagCreateIn):
    workspace = None
    if payload.workspace_uuid:
        from workspaces.models import Workspace
        try:
            workspace = Workspace.objects.get(uuid=payload.workspace_uuid, memberships__user=request.auth)
        except Workspace.DoesNotExist:
            raise HttpError(404, "Workspace not found")

    tag = Tag.objects.create(name=payload.name, color=payload.color or '#6366f1', workspace=workspace)
    return 201, {"uuid": tag.uuid, "name": tag.name, "color": tag.color, "workspace_id": tag.workspace_id}


# ─── Case CRUD ─────────────────────────────────────────────────────────────────

@router.get("/{case_uuid}/", response=CaseOut, auth=session_mfa_auth)
def get_case(request: HttpRequest, case_uuid: UUID):
    try:
        case = Case.objects.get(uuid=case_uuid)
    except Case.DoesNotExist:
        raise HttpError(404, "Case not found")
    return _case_out(case)


def _get_editable_case(request, case_uuid):
    """Return case if caller created it or is a workspace owner/admin."""
    from workspaces.models import WorkspaceMembership
    try:
        case = Case.objects.get(uuid=case_uuid)
    except Case.DoesNotExist:
        raise HttpError(404, "Case not found")
    if case.created_by == request.auth:
        return case
    if case.workspace:
        mem = WorkspaceMembership.objects.filter(workspace=case.workspace, user=request.auth).first()
        if mem and mem.role in ('owner', 'admin'):
            return case
    raise HttpError(403, "Not allowed")


@router.patch("/{case_uuid}/", response=CaseOut, auth=session_mfa_auth)
def update_case(request: HttpRequest, case_uuid: UUID, payload: CaseUpdateIn):
    case = _get_editable_case(request, case_uuid)

    if payload.name is not None:
        case.name = payload.name
    if payload.description is not None:
        case.description = payload.description
    if payload.status is not None:
        case.status = payload.status
    case.save()
    return _case_out(case)


@router.delete("/{case_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_case(request: HttpRequest, case_uuid: UUID):
    case = _get_editable_case(request, case_uuid)
    case.status = 'archived'
    case.save()
    return {"status": "archived"}


# ─── Case comments ─────────────────────────────────────────────────────────────

def _comment_out(comment: CaseComment) -> dict:
    return {
        "uuid": comment.uuid,
        "body": comment.body,
        "author_id": comment.author_id,
        "author_email": comment.author.email if comment.author else None,
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
    }


def _get_accessible_case(request, case_uuid: UUID) -> Case:
    """Return case if the caller is the creator or a workspace member."""
    from workspaces.models import WorkspaceMembership
    try:
        case = Case.objects.get(uuid=case_uuid)
    except Case.DoesNotExist:
        raise HttpError(404, "Case not found")
    if case.created_by == request.auth:
        return case
    if case.workspace:
        if WorkspaceMembership.objects.filter(workspace=case.workspace, user=request.auth).exists():
            return case
    raise HttpError(403, "Not allowed")


@router.get("/{case_uuid}/comments/", response=list[CaseCommentOut], auth=session_mfa_auth)
def list_comments(request: HttpRequest, case_uuid: UUID):
    case = _get_accessible_case(request, case_uuid)
    return [_comment_out(c) for c in case.comments.select_related('author').all()]


@router.post("/{case_uuid}/comments/", response={201: CaseCommentOut}, auth=session_mfa_auth)
def add_comment(request: HttpRequest, case_uuid: UUID, payload: CaseCommentCreateIn):
    case = _get_accessible_case(request, case_uuid)
    if not payload.body.strip():
        raise HttpError(400, "Comment body cannot be empty")
    comment = CaseComment.objects.create(case=case, author=request.auth, body=payload.body.strip())
    return 201, _comment_out(comment)


@router.patch("/{case_uuid}/comments/{comment_uuid}/", response=CaseCommentOut, auth=session_mfa_auth)
def edit_comment(request: HttpRequest, case_uuid: UUID, comment_uuid: UUID, payload: CaseCommentUpdateIn):
    _get_accessible_case(request, case_uuid)
    try:
        comment = CaseComment.objects.get(uuid=comment_uuid, case__uuid=case_uuid, author=request.auth)
    except CaseComment.DoesNotExist:
        raise HttpError(404, "Comment not found")
    if not payload.body.strip():
        raise HttpError(400, "Comment body cannot be empty")
    comment.body = payload.body.strip()
    comment.save()
    return _comment_out(comment)


@router.delete("/{case_uuid}/comments/{comment_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_comment(request: HttpRequest, case_uuid: UUID, comment_uuid: UUID):
    _get_accessible_case(request, case_uuid)
    try:
        comment = CaseComment.objects.get(uuid=comment_uuid, case__uuid=case_uuid, author=request.auth)
    except CaseComment.DoesNotExist:
        raise HttpError(404, "Comment not found")
    comment.delete()
    return {"status": "deleted"}


# ─── Case attachments ──────────────────────────────────────────────────────────

def _attachment_out(att: CaseAttachment, request: HttpRequest) -> dict:
    return {
        "uuid": att.uuid,
        "filename": att.filename,
        "content_type": att.content_type,
        "size_bytes": att.size_bytes,
        "uploaded_by_id": att.uploaded_by_id,
        "uploaded_by_email": att.uploaded_by.email if att.uploaded_by else None,
        "created_at": att.created_at,
        "url": request.build_absolute_uri(att.file.url),
    }


@router.get("/{case_uuid}/attachments/", response=list[CaseAttachmentOut], auth=session_mfa_auth)
def list_attachments(request: HttpRequest, case_uuid: UUID):
    case = _get_accessible_case(request, case_uuid)
    return [_attachment_out(a, request) for a in case.attachments.select_related('uploaded_by').all()]


@router.post("/{case_uuid}/attachments/", response={201: CaseAttachmentOut}, auth=session_mfa_auth)
def upload_attachment(request: HttpRequest, case_uuid: UUID, file: UploadedFile = File(...)):
    case = _get_accessible_case(request, case_uuid)
    MAX_SIZE = 50 * 1024 * 1024  # 50 MB
    if file.size and file.size > MAX_SIZE:
        raise HttpError(413, "File too large (max 50 MB)")
    att = CaseAttachment.objects.create(
        case=case,
        uploaded_by=request.auth,
        file=file,
        filename=file.name,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=file.size or 0,
    )
    return 201, _attachment_out(att, request)


@router.delete("/{case_uuid}/attachments/{attachment_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_attachment(request: HttpRequest, case_uuid: UUID, attachment_uuid: UUID):
    case = _get_accessible_case(request, case_uuid)
    try:
        att = CaseAttachment.objects.get(uuid=attachment_uuid, case=case)
    except CaseAttachment.DoesNotExist:
        raise HttpError(404, "Attachment not found")
    # Only uploader or workspace owner/admin can delete
    from workspaces.models import WorkspaceMembership
    from users.models import UserProfile
    is_uploader = att.uploaded_by == request.auth
    is_privileged = False
    if case.workspace:
        mem = WorkspaceMembership.objects.filter(workspace=case.workspace, user=request.auth).first()
        if mem and mem.role in ('owner', 'admin'):
            is_privileged = True
    profile, _ = UserProfile.objects.get_or_create(user=request.auth)
    if not is_uploader and not is_privileged and not profile.is_admin:
        raise HttpError(403, "Not allowed")
    att.file.delete(save=False)
    att.delete()
    return {"status": "deleted"}
