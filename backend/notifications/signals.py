import json
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from cases.models import CaseComment

logger = logging.getLogger(__name__)


def _extract_mention_emails(body: str) -> list[str]:
    """Walk BlockNote JSON blocks and collect all mention email values."""
    try:
        blocks = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return []

    emails = []

    def _walk(nodes):
        if not isinstance(nodes, list):
            return
        for node in nodes:
            if not isinstance(node, dict):
                continue
            # Inline content items
            if node.get("type") == "mention":
                email = node.get("props", {}).get("email")
                if email:
                    emails.append(email)
            # Recurse into content and children
            _walk(node.get("content", []))
            _walk(node.get("children", []))

    _walk(blocks)
    return list(set(emails))


@receiver(post_save, sender=CaseComment)
def create_mention_notifications(sender, instance: CaseComment, created: bool, **kwargs):
    """On new comment, create a Notification for each @mentioned user."""
    if not created:
        return  # don't re-notify on edits

    emails = _extract_mention_emails(instance.body)
    if not emails:
        return

    from notifications.models import Notification
    from notifications.consumers import push_notification

    actor = instance.author
    case = instance.case
    workspace = case.workspace

    for email in emails:
        try:
            recipient = User.objects.get(email=email)
        except User.DoesNotExist:
            continue

        # Don't notify yourself
        if actor and recipient.pk == actor.pk:
            continue

        notif = Notification.objects.create(
            recipient=recipient,
            actor=actor,
            verb="mentioned_you",
            case=case,
            comment=instance,
            workspace=workspace,
        )

        # Push via WebSocket
        try:
            push_notification(notif)
        except Exception:
            logger.exception("Failed to push notification %s", notif.uuid)
