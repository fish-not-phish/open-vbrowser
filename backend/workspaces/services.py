"""
Service functions for the workspaces app.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def provision_access_point(workspace) -> str | None:
    """
    Provision an S3 Files access point for a non-personal workspace.

    Idempotent: if the workspace already has an access_point_arn, returns it
    immediately without calling AWS.

    Returns the access point ARN on success, or None if skipped (personal
    workspace, DEV_MODE, or S3 Files not configured). Raises on AWS errors
    so callers can distinguish real failures from legitimate skips.
    """
    if workspace.is_personal:
        return None

    if workspace.s3files_access_point_arn:
        return workspace.s3files_access_point_arn

    if getattr(settings, 'DEV_MODE', False):
        return None

    fs_arn = getattr(settings, 'S3FILES_FILE_SYSTEM_ARN', '')
    fs_id = getattr(settings, 'S3FILES_FILE_SYSTEM_ID', '')
    if not fs_arn or not fs_id:
        return None

    import boto3
    _region = settings.AWS_REGION
    client = boto3.client('s3files', region_name=_region)

    resp = client.create_access_point(
        fileSystemId=fs_id,
        posixUser={'uid': 1000, 'gid': 1000},
        rootDirectory={
                'path': f'/{workspace.uuid}',
            'creationPermissions': {
                'ownerUid': 1000,
                'ownerGid': 1000,
                'permissions': '0755',
            },
        },
        tags=[
            {'key': 'workspace', 'value': str(workspace.uuid)},
            {'key': 'workspace-name', 'value': workspace.name[:250]},
        ],
    )

    arn = resp.get('accessPointArn', '')
    if arn:
        workspace.s3files_access_point_arn = arn
        workspace.save(update_fields=['s3files_access_point_arn'])
        logger.info(
            "Provisioned S3 Files access point %s for workspace %s",
            arn,
            workspace.uuid,
        )
        return arn
    else:
        logger.warning(
            "create_access_point returned no ARN for workspace %s",
            workspace.uuid,
        )
        return None


def _purge_s3files_prefix(prefix: str) -> int:
    """Delete every object version (incl. delete markers) under an S3 key prefix
    in the S3 Files bucket. Returns the number of versions deleted.

    The s3files bucket has versioning enabled, so current objects, historical
    versions, and delete markers are all enumerated and removed. Safe to call
    with a prefix that matches nothing — returns 0.
    """
    bucket = getattr(settings, 'S3FILES_BUCKET_NAME', '')
    if not bucket:
        return 0

    import boto3
    s3 = boto3.client('s3', region_name=settings.AWS_REGION)
    paginator = s3.get_paginator('list_object_versions')
    deleted = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        objects = []
        for entry in page.get('Versions', []):
            objects.append({'Key': entry['Key'], 'VersionId': entry['VersionId']})
        for entry in page.get('DeleteMarkers', []):
            objects.append({'Key': entry['Key'], 'VersionId': entry['VersionId']})
        # delete_objects accepts at most 1000 keys per request.
        for i in range(0, len(objects), 1000):
            chunk = objects[i:i + 1000]
            s3.delete_objects(Bucket=bucket, Delete={'Objects': chunk, 'Quiet': True})
            deleted += len(chunk)
    return deleted


def deprovision_access_point(workspace) -> None:
    """
    Deprovision the S3 Files access point and purge the workspace's data from
    the S3 Files bucket.

    Best-effort: logs failures but never raises, so workspace deletion is
    never blocked by AWS errors. Idempotent: safe to call on a workspace that
    was never provisioned (personal workspace, empty ARN, or DEV_MODE).

    - Deletes the S3 Files access point (when s3files_access_point_arn is set).
    - Deletes all objects and object versions under /<workspace.uuid>/ in the
      S3 Files bucket (versioning is enabled on that bucket). Both the
      ``<uuid>/`` and ``/<uuid>/`` key layouts are purged defensively, since
      the S3 Files service's exact key-prefix convention is not documented.
    """
    if workspace.is_personal:
        return

    if getattr(settings, 'DEV_MODE', False):
        return

    # 1. Delete the access point (so it can no longer be mounted).
    arn = workspace.s3files_access_point_arn or ''
    if arn:
        try:
            import boto3
            client = boto3.client('s3files', region_name=settings.AWS_REGION)
            ap_id = arn.split('/')[-1]
            client.delete_access_point(accessPointId=ap_id)
            logger.info(
                "Deleted S3 Files access point %s for workspace %s",
                ap_id, workspace.uuid,
            )
        except Exception:
            logger.exception(
                "Failed to delete S3 Files access point for workspace %s (arn=%s)",
                workspace.uuid, arn,
            )

    # 2. Purge the workspace's folder from the S3 Files bucket.
    if not getattr(settings, 'S3FILES_BUCKET_NAME', ''):
        return
    for prefix in (f'{workspace.uuid}/', f'/{workspace.uuid}/'):
        try:
            count = _purge_s3files_prefix(prefix)
            if count:
                logger.info(
                    "Purged %d S3 object version(s) under '%s' for workspace %s",
                    count, prefix, workspace.uuid,
                )
        except Exception:
            logger.exception(
                "Failed to purge S3 objects under '%s' for workspace %s",
                prefix, workspace.uuid,
            )


def verify_access_point_exists(arn: str) -> bool:
    """
    Check whether an S3 Files access point still exists in AWS.

    Returns True if the access point exists, False if it has been deleted
    or cannot be described. Swallows all exceptions — this is a best-effort
    stale-ARN check used by the backfill --verify flow.
    """
    if not arn:
        return False

    if getattr(settings, 'DEV_MODE', False):
        return True

    try:
        import boto3
        _region = settings.AWS_REGION
        client = boto3.client('s3files', region_name=_region)
        ap_id = arn.split('/')[-1]
        client.describe_access_point(accessPointId=ap_id)
        return True
    except Exception:
        return False
