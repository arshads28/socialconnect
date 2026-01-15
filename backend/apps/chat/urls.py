from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import chat_history, chat_view, inbox_view, search_user, InboxViewSet

router = DefaultRouter()
router.register(r'api/inbox', InboxViewSet, basename='inbox-api')

urlpatterns = [
    path("", include(router.urls)),
    path("inbox/", inbox_view, name="inbox"),
    path("search/", search_user, name="search"),
    path("history/<str:username>/", chat_history, name="chat_history"),
    path("<str:username>/", chat_view, name="chat"),
]