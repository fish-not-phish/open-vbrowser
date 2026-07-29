import os
import shutil
import tempfile
import logging

from ninja import Router, File
from ninja.files import UploadedFile
from django.http import HttpRequest, FileResponse, HttpResponse, StreamingHttpResponse
from ninja.errors import HttpError
from users.auth import session_mfa_auth
from audit.services import log_audit
from workspaces.permissions import require_role, user_role_at_least
from .models import Case, Tag, SessionNote, CaseComment, CaseAttachment, CaseFileLink
from .schemas import (
    CaseCreateIn, CaseUpdateIn, CaseOut, TagCreateIn, TagOut,
    CaseCommentOut, CaseCommentCreateIn, CaseCommentUpdateIn,
    CaseAttachmentOut, CaseFileLinkCreateIn, CaseFileLinkOut, CaseFileOut,
)
from uuid import UUID
from typing import Optional

logger = logging.getLogger(__name__)

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
        require_role(workspace, request.auth, 'analyst')

    case = Case.objects.create(
        name=payload.name,
        description=payload.description or '',
        workspace=workspace,
        created_by=request.auth,
    )
    log_audit(request, 'case.create', case_uuid=str(case.uuid), case_name=case.name,
              workspace_uuid=str(workspace.uuid) if workspace else None)
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
    """Return case if caller created it or has analyst+ role in the case's workspace."""
    try:
        case = Case.objects.get(uuid=case_uuid)
    except Case.DoesNotExist:
        raise HttpError(404, "Case not found")
    if case.created_by == request.auth:
        return case
    if case.workspace and user_role_at_least(case.workspace, request.auth, 'analyst'):
        return case
    raise HttpError(403, "Not allowed")


@router.patch("/{case_uuid}/", response=CaseOut, auth=session_mfa_auth)
def update_case(request: HttpRequest, case_uuid: UUID, payload: CaseUpdateIn):
    case = _get_editable_case(request, case_uuid)

    changes = {}
    if payload.name is not None:
        changes['name'] = payload.name
        case.name = payload.name
    if payload.description is not None:
        changes['description'] = payload.description
        case.description = payload.description
    if payload.status is not None:
        changes['status'] = payload.status
        case.status = payload.status
    case.save()
    if changes:
        log_audit(request, 'case.update', case_uuid=str(case.uuid), case_name=case.name, **changes)
    return _case_out(case)


@router.delete("/{case_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_case(request: HttpRequest, case_uuid: UUID):
    case = _get_editable_case(request, case_uuid)
    log_audit(request, 'case.delete', case_uuid=str(case.uuid), case_name=case.name)
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
    case = _get_editable_case(request, case_uuid)
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
    log_audit(request, 'case.attachment.upload', case_uuid=str(case.uuid), case_name=case.name,
              attachment_uuid=str(att.uuid), filename=att.filename, size=att.size_bytes)
    return 201, _attachment_out(att, request)


@router.delete("/{case_uuid}/attachments/{attachment_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_attachment(request: HttpRequest, case_uuid: UUID, attachment_uuid: UUID):
    case = _get_accessible_case(request, case_uuid)
    try:
        att = CaseAttachment.objects.get(uuid=attachment_uuid, case=case)
    except CaseAttachment.DoesNotExist:
        raise HttpError(404, "Attachment not found")
    # Only uploader or analyst+ workspace members can delete
    is_uploader = att.uploaded_by == request.auth
    if not is_uploader and not user_role_at_least(case.workspace, request.auth, 'analyst'):
        from users.models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=request.auth)
        if not profile.is_admin:
            raise HttpError(403, "Not allowed")
    log_audit(request, 'case.attachment.delete', case_uuid=str(case.uuid), case_name=case.name,
              attachment_uuid=str(att.uuid), filename=att.filename)
    att.file.delete(save=False)
    att.delete()
    return {"status": "deleted"}


# ─── Workspace file links + unified Files list ─────────────────────────────────
#
# A CaseFileLink is a read-only reference from a case to a file that already
# lives in the workspace's S3 persistent storage. No bytes are copied — the S3
# object stays in the session-exposed storage zone; the case only holds a
# metadata pointer (path, size, sha256) so the Files list stays useful even if
# the source object is later removed.

def _link_out(link: CaseFileLink, exists: bool = True) -> dict:
    return {
        "uuid": link.uuid,
        "s3_path": link.s3_path,
        "filename": link.filename,
        "size_bytes": link.size_bytes,
        "sha256": link.sha256 or None,
        "linked_by_id": link.linked_by_id,
        "linked_by_email": link.linked_by.email if link.linked_by else None,
        "created_at": link.created_at,
        "exists": exists,
    }


def _file_out_from_attachment(att: CaseAttachment, request: HttpRequest) -> dict:
    return {
        "uuid": att.uuid,
        "source": "upload",
        "filename": att.filename,
        "content_type": att.content_type,
        "size_bytes": att.size_bytes,
        "uploaded_by_id": att.uploaded_by_id,
        "uploaded_by_email": att.uploaded_by.email if att.uploaded_by else None,
        "created_at": att.created_at,
        "url": None,
        "s3_path": None,
        "exists": True,
    }


def _file_out_from_link(link: CaseFileLink, exists: bool = True) -> dict:
    return {
        "uuid": link.uuid,
        "source": "workspace",
        "filename": link.filename,
        "content_type": "",
        "size_bytes": link.size_bytes,
        "uploaded_by_id": link.linked_by_id,
        "uploaded_by_email": link.linked_by.email if link.linked_by else None,
        "created_at": link.created_at,
        "url": None,
        "s3_path": link.s3_path,
        "exists": exists,
    }


def _check_workspace_storage(ws):
    """Ensure the workspace has S3 persistent storage provisioned."""
    from files.api import _check_storage
    _check_storage(ws)


def _s3_head_exists(ws, subpath: str) -> tuple[bool, dict]:
    """Return (exists, head_metadata) for an S3 object in the workspace."""
    from files.api import _s3_client, _bucket, _full_key
    client = _s3_client()
    try:
        resp = client.head_object(Bucket=_bucket(), Key=_full_key(ws, subpath))
        return True, resp
    except client.exceptions.ClientError:
        return False, {}
    except Exception:
        return False, {}


@router.get("/{case_uuid}/files/", response=list[CaseFileOut], auth=session_mfa_auth)
def list_case_files(request: HttpRequest, case_uuid: UUID):
    """Unified list of all files on a case — uploaded attachments and linked
    workspace (S3) files — sorted newest-first. For linked files, `exists`
    reflects whether the S3 object is still present."""
    case = _get_accessible_case(request, case_uuid)
    items: list[dict] = []
    for att in case.attachments.select_related('uploaded_by').all():
        items.append(_file_out_from_attachment(att, request))

    links = list(case.file_links.select_related('linked_by').all())
    if links and case.workspace:
        from concurrent.futures import ThreadPoolExecutor
        from files.api import _s3_client, _bucket, _full_key
        client = _s3_client()
        ws = case.workspace

        def _head(link: CaseFileLink) -> tuple[CaseFileLink, bool]:
            try:
                client.head_object(Bucket=_bucket(), Key=_full_key(ws, link.s3_path))
                return link, True
            except Exception:
                return link, False

        with ThreadPoolExecutor(max_workers=8) as pool:
            for link, exists in pool.map(_head, links):
                items.append(_file_out_from_link(link, exists))
    else:
        for link in links:
            items.append(_file_out_from_link(link, exists=False))

    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


@router.post("/{case_uuid}/file-links/", response={201: CaseFileOut}, auth=session_mfa_auth)
def create_file_link(request: HttpRequest, case_uuid: UUID, payload: CaseFileLinkCreateIn):
    """Link an existing workspace (S3) file to a case without copying it.

    Requires the case to belong to a workspace with persistent storage enabled.
    """
    case = _get_editable_case(request, case_uuid)
    if not case.workspace:
        raise HttpError(400, "Only workspace-scoped cases can link workspace files")
    _check_workspace_storage(case.workspace)

    from files.api import _sanitize_subpath
    subpath = _sanitize_subpath(payload.path)
    if not subpath:
        raise HttpError(400, "File path is required")

    # Verify the object actually exists in S3 and snapshot its metadata.
    exists, head = _s3_head_exists(case.workspace, subpath)
    if not exists:
        raise HttpError(404, "File not found in workspace storage")

    filename = subpath.split('/')[-1]
    size = head.get('ContentLength', 0) or 0
    sha256 = head.get('Metadata', {}).get('sha256', '') or ''

    link, created = CaseFileLink.objects.get_or_create(
        case=case, s3_path=subpath,
        defaults={
            'workspace': case.workspace,
            'filename': filename,
            'size_bytes': size,
            'sha256': sha256,
            'linked_by': request.auth,
        },
    )
    if not created:
        raise HttpError(409, "This file is already linked to the case")

    log_audit(request, 'case.file_link.create', case_uuid=str(case.uuid), case_name=case.name,
              link_uuid=str(link.uuid), s3_path=subpath, filename=filename, size=size)
    return 201, _file_out_from_link(link, exists=True)


@router.delete("/{case_uuid}/file-links/{link_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_file_link(request: HttpRequest, case_uuid: UUID, link_uuid: UUID):
    """Remove a file link from a case. Does NOT delete the S3 object."""
    case = _get_accessible_case(request, case_uuid)
    try:
        link = CaseFileLink.objects.get(uuid=link_uuid, case=case)
    except CaseFileLink.DoesNotExist:
        raise HttpError(404, "File link not found")

    is_linker = link.linked_by == request.auth
    if not is_linker and not user_role_at_least(case.workspace, request.auth, 'analyst'):
        from users.models import UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=request.auth)
        if not profile.is_admin:
            raise HttpError(403, "Not allowed")

    log_audit(request, 'case.file_link.delete', case_uuid=str(case.uuid), case_name=case.name,
              link_uuid=str(link.uuid), s3_path=link.s3_path, filename=link.filename)
    link.delete()
    return {"status": "deleted"}


def _protected_7z_response(file_path: str, filename: str) -> HttpResponse:
    """Wrap a local file in a password-protected 7z archive and return it as
    an HttpResponse. The archive uses the password "infected" and is named
    <filename>-PROTECTED.7z. Uses store mode (no compression) so the CPU cost
    is negligible — the goal is password protection, not compression."""
    import py7zr
    archive_path = os.path.join(
        os.path.dirname(file_path), f'{filename}-PROTECTED.7z'
    )
    with py7zr.SevenZipFile(
        archive_path, 'w', password='infected', filters=[{'id': py7zr.FILTER_COPY}]
    ) as archive:
        archive.write(file_path, arcname=filename)
    with open(archive_path, 'rb') as f:
        archive_data = f.read()
    response = HttpResponse(archive_data, content_type='application/x-7z-compressed')
    response['Content-Disposition'] = f'attachment; filename="{filename}-PROTECTED.7z"'
    response['Content-Length'] = str(len(archive_data))
    return response


@router.get("/{case_uuid}/file-links/{link_uuid}/download/", auth=session_mfa_auth)
def download_file_link(request: HttpRequest, case_uuid: UUID, link_uuid: UUID):
    """Download the S3 object referenced by a file link, wrapped in a
    password-protected 7z archive. The caller must have access to the case."""
    case = _get_accessible_case(request, case_uuid)
    try:
        link = CaseFileLink.objects.get(uuid=link_uuid, case=case)
    except CaseFileLink.DoesNotExist:
        raise HttpError(404, "File link not found")
    if not case.workspace:
        raise HttpError(400, "Case has no workspace storage")

    from files.api import _s3_client, _bucket, _full_key
    client = _s3_client()
    key = _full_key(case.workspace, link.s3_path)

    tmp_dir = tempfile.mkdtemp(prefix='ovb-case-7z-')
    try:
        file_path = os.path.join(tmp_dir, link.filename)
        try:
            client.download_file(_bucket(), key, file_path)
        except client.exceptions.NoSuchKey:
            raise HttpError(404, "File no longer exists in workspace storage")
        except Exception:
            logger.exception("S3 download failed for case %s key %s", case.uuid, key)
            raise HttpError(500, "Failed to retrieve file")

        response = _protected_7z_response(file_path, link.filename)
        log_audit(request, 'case.file_link.download', case_uuid=str(case.uuid), case_name=case.name,
                  link_uuid=str(link.uuid), s3_path=link.s3_path, protected=True)
        return response
    except HttpError:
        raise
    except Exception:
        logger.exception("7z protection failed for file link %s", link.uuid)
        raise HttpError(500, "Failed to create protected archive")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.get("/{case_uuid}/attachments/{attachment_uuid}/download/", auth=session_mfa_auth)
def download_attachment(request: HttpRequest, case_uuid: UUID, attachment_uuid: UUID):
    """Download an uploaded attachment wrapped in a password-protected 7z
    archive."""
    case = _get_accessible_case(request, case_uuid)
    try:
        att = CaseAttachment.objects.get(uuid=attachment_uuid, case=case)
    except CaseAttachment.DoesNotExist:
        raise HttpError(404, "Attachment not found")

    if not att.file:
        raise HttpError(404, "File not found")

    tmp_dir = tempfile.mkdtemp(prefix='ovb-case-7z-')
    try:
        file_path = os.path.join(tmp_dir, att.filename)
        with att.file.open('rb') as src, open(file_path, 'wb') as dst:
            shutil.copyfileobj(src, dst)

        response = _protected_7z_response(file_path, att.filename)
        log_audit(request, 'case.attachment.download', case_uuid=str(case.uuid), case_name=case.name,
                  attachment_uuid=str(att.uuid), filename=att.filename, protected=True)
        return response
    except Exception:
        logger.exception("7z protection failed for attachment %s", att.uuid)
        raise HttpError(500, "Failed to create protected archive")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
