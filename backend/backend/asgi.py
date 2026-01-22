"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

from django.core.asgi import get_asgi_application
# THIS LINE INITIALIZES DJANGO (apps, models, settings)
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from apps.chat.routing import websocket_urlpatterns as chat_ws
from apps.calls.routing import websocket_urlpatterns as call_ws
from apps.chat.middleware import TokenAuthMiddleware

application = ProtocolTypeRouter({
    # Remove 'ASGIStaticFilesHandler'. 
    # Let WhiteNoise (Middleware) handle static files for HTTP.
    "http": django_asgi_app, 
    
    "websocket": TokenAuthMiddleware(
        URLRouter(chat_ws + call_ws)
    ),
})
