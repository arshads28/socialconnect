from django.urls import re_path
from .consumers import UnifiedConsumer

websocket_urlpatterns = [
    re_path(r"ws/chat/(?P<username>[^/]+)/$", UnifiedConsumer.as_asgi()),
    re_path(r"ws/unified/$", UnifiedConsumer.as_asgi()),
    re_path(r"ws/online-status/$", UnifiedConsumer.as_asgi()),
]
