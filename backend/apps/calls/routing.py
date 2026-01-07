# chat/routing.py
from django.urls import re_path
from .consumers import CallConsumer

websocket_urlpatterns = [
    # Change <call_id> to <username> and allow special chars for email/username lookup 
    re_path(r"ws/call/(?P<username>[^/]+)/$", CallConsumer.as_asgi()),
]