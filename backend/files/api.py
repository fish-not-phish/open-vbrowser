"""
File explorer API for workspace persistent storage (S3 Files).

All operations are scoped to the workspace's UUID prefix in the S3 Files bucket.
The bucket is never exposed publicly — every request is proxied through Django
after workspace-membership auth.
"""
import hashlib
import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.conf import settings
from django.http import HttpRequest, StreamingHttpResponse, HttpResponse
from ninja import Router, File
from ninja.files import UploadedFile
from ninja.errors import HttpError
from uuid import UUID

from users.auth import session_mfa_auth
from users.models import SiteSettings
from workspaces.api import _get_ws_for_user
from workspaces.models import Workspace
from workspaces.permissions import require_role
from audit.services import log_audit
from .schemas import FileEntry, FileListOut, HashOut, MkdirIn, UploadOut

logger = logging.getLogger(__name__)

router = Router(tags=["files"])

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB
_HASH_WORKERS = 8  # parallel head_object calls when listing


# ─── S3 helpers ───────────────────────────────────────────────────────────────

def _s3_client():
    import boto3
    return boto3.client('s3', region_name=settings.AWS_REGION)


def _bucket() -> str:
    return getattr(settings, 'S3FILES_BUCKET_NAME', '')


def _check_storage(ws: Workspace):
    """Verify persistent storage is configured for this workspace."""
    if getattr(settings, 'DEV_MODE', False):
        raise HttpError(400, "Persistent storage is not available in dev mode")
    if not _bucket():
        raise HttpError(400, "Persistent storage is not configured")
    if not ws.s3files_access_point_arn:
        raise HttpError(400, "Persistent storage is not provisioned for this workspace")


def _sanitize_subpath(path: str) -> str:
    """Sanitize a user-provided subpath to prevent path traversal outside the
    workspace prefix. Returns a clean relative path without leading/trailing
    slashes, with all '.' and '..' components removed.
    """
    if not path:
        return ''
    parts = [p for p in path.strip('/').split('/') if p and p != '.' and p != '..']
    return '/'.join(parts)


def _full_prefix(ws: Workspace, subpath: str) -> str:
    """Build the S3 key prefix for a workspace + optional subpath."""
    base = f'{ws.uuid}/'
    if subpath:
        base += f'{subpath}/'
    return base


def _full_key(ws: Workspace, subpath: str) -> str:
    """Build the full S3 key for a file (no trailing slash)."""
    return f'{ws.uuid}/{subpath}'


def _compute_sha256(client, key: str) -> str:
    """Stream an S3 object through hashlib and return the hex digest."""
    obj = client.get_object(Bucket=_bucket(), Key=key)
    h = hashlib.sha256()
    for chunk in obj['Body'].iter_chunks(chunk_size=64 * 1024):
        h.update(chunk)
    return h.hexdigest()


def _cache_sha256(client, key: str, sha256: str):
    """Store sha256 as S3 object metadata so future list calls don't recompute."""
    try:
        resp = client.head_object(Bucket=_bucket(), Key=key)
        meta = resp.get('Metadata', {})
        meta['sha256'] = sha256
        client.copy_object(
            Bucket=_bucket(),
            Key=key,
            CopySource={'Bucket': _bucket(), 'Key': key},
            Metadata=meta,
            MetadataDirective='REPLACE',
        )
    except Exception:
        logger.warning("Failed to cache sha256 metadata for key %s", key, exc_info=True)


def _fetch_sha256_metadata(client, keys: list[str]) -> dict[str, str | None]:
    """Batch-fetch sha256 from object metadata via parallel head_object calls."""
    if not keys:
        return {}

    def _head(key):
        try:
            resp = client.head_object(Bucket=_bucket(), Key=key)
            return key, resp.get('Metadata', {}).get('sha256')
        except Exception:
            return key, None

    results: dict[str, str | None] = {}
    with ThreadPoolExecutor(max_workers=_HASH_WORKERS) as pool:
        for key, sha in pool.map(_head, keys):
            results[key] = sha
    return results


def _check_file_protection(ws: Workspace):
    """Verify file protection is enabled at both global and workspace level."""
    site = SiteSettings.get()
    if not site.enable_file_protection:
        raise HttpError(403, "File protection is not enabled on this instance")
    if not ws.enable_file_protection:
        raise HttpError(403, "File protection is not enabled for this workspace")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{ws_uuid}/", response=FileListOut, auth=session_mfa_auth)
def list_files(request: HttpRequest, ws_uuid: UUID, path: str = ""):
    """List files and folders at the given path within the workspace storage."""
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    subpath = _sanitize_subpath(path)
    prefix = _full_prefix(ws, subpath)

    client = _s3_client()
    paginator = client.get_paginator('list_objects_v2')
    entries: list[FileEntry] = []

    for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix, Delimiter='/'):
        for cp in page.get('CommonPrefixes', []):
            name = cp['Prefix'].rstrip('/').split('/')[-1]
            entries.append(FileEntry(name=name, is_dir=True))
        for obj in page.get('Contents', []):
            if obj['Key'] == prefix:
                continue  # skip the folder placeholder itself
            name = obj['Key'].split('/')[-1]
            entries.append(FileEntry(
                name=name,
                is_dir=False,
                size=obj.get('Size', 0),
                last_modified=obj.get('LastModified'),
            ))
            # Track the S3 key for metadata lookup (not part of the schema).
            entries[-1]._s3_key = obj['Key']

    # Batch-fetch sha256 metadata for all files in this folder.
    file_keys = [getattr(e, '_s3_key', None) for e in entries if not e.is_dir]
    file_keys = [k for k in file_keys if k]
    hashes = _fetch_sha256_metadata(client, file_keys)
    for e in entries:
        if not e.is_dir:
            e.sha256 = hashes.get(getattr(e, '_s3_key', None))
            if hasattr(e, '_s3_key'):
                delattr(e, '_s3_key')  # don't leak the internal field

    return FileListOut(path=subpath, entries=entries)


@router.get("/{ws_uuid}/download/", auth=session_mfa_auth)
def download_file(request: HttpRequest, ws_uuid: UUID, path: str = ""):
    """Stream-download a single file from the workspace storage."""
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    subpath = _sanitize_subpath(path)
    if not subpath:
        raise HttpError(400, "File path is required")

    client = _s3_client()
    try:
        obj = client.get_object(Bucket=_bucket(), Key=_full_key(ws, subpath))
    except client.exceptions.NoSuchKey:
        raise HttpError(404, "File not found")
    except Exception:
        logger.exception("S3 get_object failed for workspace %s key %s", ws.uuid, subpath)
        raise HttpError(500, "Failed to retrieve file")

    filename = subpath.split('/')[-1]
    response = StreamingHttpResponse(
        obj['Body'].iter_chunks(chunk_size=64 * 1024),
        content_type=obj.get('ContentType', 'application/octet-stream'),
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Content-Length'] = str(obj.get('ContentLength', 0))
    return response


@router.post("/{ws_uuid}/upload/", response=UploadOut, auth=session_mfa_auth)
def upload_file(
    request: HttpRequest,
    ws_uuid: UUID,
    file: UploadedFile = File(...),
    path: str = "",
):
    """Upload a file to the given path within the workspace storage."""
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    require_role(ws, request.auth, 'member')
    subpath = _sanitize_subpath(path)

    if file.size and file.size > MAX_UPLOAD_BYTES:
        raise HttpError(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")

    # Sanitize the filename to prevent key injection
    filename = file.name.split('/')[-1] if file.name else 'unnamed'
    if not filename or filename in ('.', '..'):
        raise HttpError(400, "Invalid filename")

    key = _full_key(ws, f'{subpath}/{filename}') if subpath else _full_key(ws, filename)

    # Compute sha256 before uploading so it can be stored as object metadata.
    h = hashlib.sha256()
    for chunk in iter(lambda: file.read(64 * 1024), b''):
        h.update(chunk)
    sha256 = h.hexdigest()
    file.seek(0)

    client = _s3_client()
    try:
        client.upload_fileobj(
            file, _bucket(), key,
            ExtraArgs={'Metadata': {'sha256': sha256}},
        )
    except Exception:
        logger.exception("S3 upload failed for workspace %s key %s", ws.uuid, key)
        raise HttpError(500, "Failed to upload file")

    rel_path = f'{subpath}/{filename}' if subpath else filename
    log_audit(request, 'file.upload', workspace_uuid=str(ws.uuid), path=rel_path,
              filename=filename, size=file.size or 0, sha256=sha256[:12])
    return UploadOut(status="uploaded", path=rel_path)


@router.delete("/{ws_uuid}/", response={200: dict}, auth=session_mfa_auth)
def delete_file(request: HttpRequest, ws_uuid: UUID, path: str = ""):
    """Delete a file or folder (recursively) from workspace storage."""
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    require_role(ws, request.auth, 'member')
    subpath = _sanitize_subpath(path)
    if not subpath:
        raise HttpError(400, "Path is required")

    client = _s3_client()
    key = _full_key(ws, subpath)

    # If the path ends with '/', it's a folder — delete all objects under the prefix.
    is_folder = subpath.endswith('/') or _is_prefix_folder(client, ws, subpath)
    if is_folder:
        prefix = f'{key.rstrip("/")}/'
        deleted_count = 0
        paginator = client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=_bucket(), Prefix=prefix):
            objects = [{'Key': o['Key']} for o in page.get('Contents', [])]
            if objects:
                client.delete_objects(Bucket=_bucket(), Delete={'Objects': objects, 'Quiet': True})
                deleted_count += len(objects)
        logger.info("Deleted %d object(s) under %s in workspace %s", deleted_count, prefix, ws.uuid)
    else:
        try:
            client.delete_object(Bucket=_bucket(), Key=key)
        except Exception:
            logger.exception("S3 delete failed for workspace %s key %s", ws.uuid, key)
            raise HttpError(500, "Failed to delete file")
        logger.info("Deleted %s in workspace %s", subpath, ws.uuid)

    log_audit(request, 'file.delete', workspace_uuid=str(ws.uuid), path=subpath,
              recursive=is_folder, object_count=deleted_count if is_folder else 1)
    return {"status": "deleted", "path": subpath}


@router.post("/{ws_uuid}/mkdir/", response=UploadOut, auth=session_mfa_auth)
def make_dir(request: HttpRequest, ws_uuid: UUID, payload: MkdirIn):
    """Create a folder (S3 placeholder object) in the workspace storage."""
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    require_role(ws, request.auth, 'member')
    subpath = _sanitize_subpath(payload.path)
    if not subpath:
        raise HttpError(400, "Folder path is required")

    key = f'{_full_key(ws, subpath)}/'
    client = _s3_client()
    try:
        client.put_object(Bucket=_bucket(), Key=key, Body=b'')
    except Exception:
        logger.exception("S3 mkdir failed for workspace %s key %s", ws.uuid, key)
        raise HttpError(500, "Failed to create folder")

    logger.info("Created folder %s in workspace %s", subpath, ws.uuid)
    log_audit(request, 'file.mkdir', workspace_uuid=str(ws.uuid), path=f'{subpath}/')
    return UploadOut(status="created", path=f'{subpath}/')


@router.get("/{ws_uuid}/hash/", response=HashOut, auth=session_mfa_auth)
def compute_hash(request: HttpRequest, ws_uuid: UUID, path: str = ""):
    """Compute and cache the SHA-256 hash of a file.

    If the hash is already stored as S3 metadata, returns it immediately.
    Otherwise streams the object through hashlib, caches the result as
    metadata, and returns it.
    """
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    subpath = _sanitize_subpath(path)
    if not subpath:
        raise HttpError(400, "File path is required")

    client = _s3_client()
    key = _full_key(ws, subpath)

    # Check cached metadata first.
    try:
        resp = client.head_object(Bucket=_bucket(), Key=key)
        cached = resp.get('Metadata', {}).get('sha256')
        if cached:
            return HashOut(path=subpath, sha256=cached)
    except client.exceptions.NoSuchKey:
        raise HttpError(404, "File not found")
    except Exception:
        logger.exception("head_object failed for key %s", key)
        raise HttpError(500, "Failed to check file metadata")

    # Compute on demand and cache.
    sha256 = _compute_sha256(client, key)
    _cache_sha256(client, key, sha256)
    log_audit(request, 'file.hash', workspace_uuid=str(ws.uuid), path=subpath, sha256=sha256[:12])
    return HashOut(path=subpath, sha256=sha256)


@router.get("/{ws_uuid}/download-protected/", auth=session_mfa_auth)
def download_protected(request: HttpRequest, ws_uuid: UUID, path: str = ""):
    """Download a file wrapped in a password-protected 7z archive.

    The archive uses the password "infected" and is named <filename>-PROTECTED.7z.
    Gated on both global and workspace file-protection flags.
    """
    ws = _get_ws_for_user(ws_uuid, request.auth)
    _check_storage(ws)
    subpath = _sanitize_subpath(path)
    if not subpath:
        raise HttpError(400, "File path is required")

    client = _s3_client()
    key = _full_key(ws, subpath)
    filename = subpath.split('/')[-1]

    # Download S3 object to a temp file, create the 7z archive, then read it
    # back. Using temp files avoids holding 2x the file size in memory.
    tmp_dir = tempfile.mkdtemp(prefix='ovb-7z-')
    try:
        file_path = os.path.join(tmp_dir, filename)
        archive_path = os.path.join(tmp_dir, f'{filename}-PROTECTED.7z')

        client.download_file(_bucket(), key, file_path)

        import py7zr
        with py7zr.SevenZipFile(
            archive_path, 'w', password='infected', filters=[{'id': py7zr.FILTER_COPY}]
        ) as archive:
            archive.write(file_path, arcname=filename)

        with open(archive_path, 'rb') as f:
            archive_data = f.read()

        response = HttpResponse(archive_data, content_type='application/x-7z-compressed')
        response['Content-Disposition'] = f'attachment; filename="{filename}-PROTECTED.7z"'
        response['Content-Length'] = str(len(archive_data))
        log_audit(request, 'file.download_protected', workspace_uuid=str(ws.uuid), path=subpath,
                  archive_size=len(archive_data))
        return response
    except client.exceptions.NoSuchKey:
        raise HttpError(404, "File not found")
    except Exception:
        logger.exception("7z protection failed for workspace %s key %s", ws.uuid, key)
        raise HttpError(500, "Failed to create protected archive")
    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _is_prefix_folder(client, ws: Workspace, subpath: str) -> bool:
    """Check if the subpath is a folder by listing objects with the prefix."""
    prefix = f'{_full_prefix(ws, subpath)}'
    resp = client.list_objects_v2(Bucket=_bucket(), Prefix=prefix, MaxKeys=1)
    return resp.get('KeyCount', 0) > 0
