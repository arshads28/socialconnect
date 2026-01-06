from django.urls import path
from .views import chat_history,chat_view,inbox_view

urlpatterns = [
    path("inbox/", inbox_view, name="inbox"),
    path("<str:username>/", chat_view, name="chat"),
    path("history/<str:username>/", chat_history, name="chat_history"),
]