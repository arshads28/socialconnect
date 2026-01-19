from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import chat_history, inbox_view, search_user, InboxViewSet, sync_messages, clear_chat_history, SendMessageAPIView

router = DefaultRouter()
router.register(r'inbox', InboxViewSet, basename='inbox-api')

urlpatterns = [
    path("", include(router.urls)),
    path("search/", search_user, name="search"),
    path("sync/", sync_messages, name="sync_messages"),
    path('clear/<str:username>/', clear_chat_history),
    path("history/<str:username>/", chat_history, name="chat_history"),
    path('send/', SendMessageAPIView.as_view(), name='chat_send_api'),
    # path("<str:username>/", chat_view, name="chat"),
]