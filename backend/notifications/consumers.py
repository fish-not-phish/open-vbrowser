import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def user_group_name(user_id: int) -> str:
    return f"notifications_user_{user_id}"


def push_notification(notif) -> None:
    """Synchronously push a notification payload to the user's WS group."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    payload = {
        "type": "notify",
        "notification": {
            "uuid": str(notif.uuid),
            "verb": notif.verb,
            "actor_email": notif.actor.email if notif.actor else None,
            "case_uuid": str(notif.case.uuid) if notif.case else None,
            "case_name": notif.case.name if notif.case else None,
            "workspace_uuid": str(notif.workspace.uuid) if notif.workspace else None,
            "comment_uuid": str(notif.comment.uuid) if notif.comment else None,
            "read": notif.read,
            "created_at": notif.created_at.isoformat(),
        },
    }

    async_to_sync(channel_layer.group_send)(
        user_group_name(notif.recipient_id),
        payload,
    )


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close()
            return

        self.group_name = user_group_name(user.pk)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Client can send {"action": "mark_read", "uuid": "..."}
        if not text_data:
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        if data.get("action") == "mark_read":
            await self._mark_read(data.get("uuid"))

    async def _mark_read(self, uuid: str):
        from notifications.models import Notification
        from asgiref.sync import sync_to_async

        user = self.scope["user"]

        @sync_to_async
        def do_mark():
            Notification.objects.filter(uuid=uuid, recipient=user).update(read=True)

        await do_mark()

    # Handler for group_send messages with type "notify"
    async def notify(self, event):
        await self.send(text_data=json.dumps(event["notification"]))
