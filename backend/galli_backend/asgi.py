import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from django.urls import path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "galli_backend.settings")

django_asgi_app = get_asgi_application()

from api.realtime import BroadcastConsumer  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": URLRouter(
            [
                path("ws", BroadcastConsumer.as_asgi()),
                path("ws/", BroadcastConsumer.as_asgi()),
            ]
        ),
    }
)
