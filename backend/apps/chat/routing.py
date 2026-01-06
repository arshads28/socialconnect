from django.urls import re_path
from .consumers import ChatConsumer,OnlineStatusConsumer

websocket_urlpatterns = [
    re_path(r"ws/chat/(?P<username>[^/]+)/$", ChatConsumer.as_asgi()),
    # NEW Global Route for Online Status
    re_path(r"ws/online-status/$", OnlineStatusConsumer.as_asgi()),
]
