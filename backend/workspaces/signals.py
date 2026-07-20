"""
Signals for the workspaces app.

- post_save on User: create a personal workspace for every new user.
  Uses get_or_create so it's idempotent even if called more than once.
"""
import re
import logging

from django.db.models.signals import post_save
from django.contrib.auth.models import User
from django.dispatch import receiver

from .models import Workspace

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
