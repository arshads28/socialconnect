from django.urls import path
from .views import chat_history

urlpatterns = [
    path("history/<str:username>/", chat_history),
]
