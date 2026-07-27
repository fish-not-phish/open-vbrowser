"""
Signals for the workspaces app.

- post_save on User: create a personal workspace for every new user.
  Uses get_or_create so it's idempotent even if called more than once.
- post_save on Workspace: provision an S3 Files access point for non-personal
  workspaces (when persistent storage is configured).
- pre_delete on Workspace: deprovision the S3 Files access point and purge the
  workspace's folder from the S3 Files bucket.
"""
import re
import logging

from django.db.models.signals import post_save, pre_delete
from django.contrib.auth.models import User
from django.dispatch import receiver

from .models import Workspace
from .services import provision_access_point, deprovision_access_point

logger = logging.getLogger(__name__)


def _personal_slug(user: User) -> str:
    """
    Derive a unique, URL-safe slug for the personal workspace.
    Uses the username, strips non-alphanumeric chars, and appends -personal.
    e.g.  "john.doe" → "johndoe-personal"
          "user#42"  → "user42-personal"
    """
    base = re.sub(r'[^a-z0-9]', '', user.username.lower()) or f'user{user.pk}'
    return f'{base}-personal'


@receiver(post_save, sender=User)
def create_personal_workspace(sender, instance: User, created: bool, **kwargs):
    """Create a 'Personal' workspace the first time a User record is saved.

    Skipped when SiteSettings.allow_personal_workspaces is False.
    """
    if not created:
        return

    try:
        # Inline import to avoid circular imports at module load time.
        from workspaces.models import Workspace, WorkspaceMembership
        from users.models import SiteSettings
        if not SiteSettings.get().allow_personal_workspaces:
            return

        slug = _personal_slug(instance)

        # Handle slug collision (extremely rare — two identical usernames on the
        # same install shouldn't happen, but be safe).
        counter = 0
        candidate = slug
        while Workspace.objects.filter(slug=candidate).exists():
            counter += 1
            candidate = f'{slug}-{counter}'

        ws, created_ws = Workspace.objects.get_or_create(
            slug=candidate,
            defaults={
                'name': 'Personal',
                'created_by': instance,
                'is_personal': True,
            },
        )

        WorkspaceMembership.objects.get_or_create(
            workspace=ws,
            user=instance,
            defaults={'role': 'owner'},
        )
    except Exception:
        logger.exception(
            "Failed to create personal workspace for user pk=%s (%s)",
            instance.pk,
            instance.username,
        )


@receiver(post_save, sender=Workspace)
def provision_s3files_access_point(sender, instance: Workspace, created: bool, **kwargs):
    """Provision an S3 Files access point for non-personal workspaces.

    Each non-personal workspace gets exactly one access point, keyed by the
    workspace UUID. The access point enforces POSIX user 1000:1000 (matching
    the PUID/PGID used by the browser containers) and roots at
    /<workspace.uuid>/ with 0755 creation permissions.

    Personal workspaces are skipped — they don't get persistent storage.
    Skipped silently when DEV_MODE is on or when S3 Files isn't configured.
    AWS errors are logged but do NOT crash workspace creation; run
    `python manage.py backfill_access_points` to retry.
    """
    if not created:
        return
    try:
        provision_access_point(instance)
    except Exception:
        logger.exception(
            "Failed to provision S3 Files access point for workspace %s (%s). "
            "Run: python manage.py backfill_access_points",
            instance.uuid,
            instance.name,
        )


@receiver(pre_delete, sender=Workspace)
def deprovision_s3files_access_point(sender, instance: Workspace, **kwargs):
    """Deprovision the S3 Files access point and purge workspace data on delete.

    Fires before the DB record is removed so instance.uuid and
    s3files_access_point_arn are still available. Best-effort — AWS failures
    are logged by the service function and never block deletion. Covers every
    instance-level delete path (API endpoints, admin single-object delete).
    """
    try:
        deprovision_access_point(instance)
    except Exception:
        logger.exception(
            "Failed to deprovision S3 Files for workspace %s (%s)",
            instance.uuid,
            instance.name,
        )
