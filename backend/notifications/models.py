from django.db import models
from django.contrib.auth.models import User
import uuid as _uuid


class Notification(models.Model):
    uuid = models.UUIDField(default=_uuid.uuid4, editable=False, unique=True)

    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notifications"
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name="sent_notifications"
    )

    # What happened
    verb = models.CharField(max_length=64, default="mentioned_you")

    # Context
    case = models.ForeignKey(
        "cases.Case", on_delete=models.CASCADE, null=True, blank=True,
        related_name="notifications"
    )
    comment = models.ForeignKey(
        "cases.CaseComment", on_delete=models.CASCADE, null=True, blank=True,
        related_name="notifications"
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, null=True, blank=True,
        related_name="notifications"
    )

    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Notification for {self.recipient_id}: {self.verb}"
