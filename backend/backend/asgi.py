"""
ASGI config for backend project — Django Channels with Redis layer.
"""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# Must initialise Django before importing anything that touches models/settings
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402
from channels.auth import AuthMiddlewareStack  # noqa: E402
from django.urls import path  # noqa: E402
from notifications.consumers import NotificationConsumer  # noqa: E402

websocket_urlpatterns = [
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        ),
    }
)
