from django.urls import path
from .views import chat_history,chat_view,inbox_view,search_user

urlpatterns = [
    path("inbox/", inbox_view, name="inbox"),
    path("search/", search_user, name="search"),
    path("history/<str:username>/", chat_history, name="chat_history"),
    path("<str:username>/", chat_view, name="chat"),
]