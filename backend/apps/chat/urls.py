from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    chat_history, 
    search_user, 
    InboxViewSet, 
    sync_messages, 
    clear_chat_history, 
    SendMessageAPIView, 
    ChatUploadAPIView,
    delete_for_me,
    delete_for_everyone,
    UploadKeysView,
    FetchKeyBundleView
)


router = DefaultRouter()
router.register(r'inbox', InboxViewSet, basename='inbox-api')

urlpatterns = [
    path("", include(router.urls)),
    
    path("search/", search_user, name="search"),
    path("sync/", sync_messages, name="sync_messages"),
    path('clear/<str:username>/', clear_chat_history),
    path("history/<str:username>/", chat_history, name="chat_history"),
    
    path('send/', SendMessageAPIView.as_view(), name='chat_send_api'),
    path('upload/', ChatUploadAPIView.as_view(), name='chat_upload'),

    path('delete/self/', delete_for_me, name='delete_for_me'),
    path('delete/global/', delete_for_everyone, name='delete_for_everyone'),

    path('e2ee/keys/', UploadKeysView.as_view(), name='upload_keys'),
    path('e2ee/keys/<str:username>/', FetchKeyBundleView.as_view(), name='fetch_keys'),
]