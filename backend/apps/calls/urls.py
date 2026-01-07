from django.urls import path
from .views import video_call_view


urlpatterns = [
    path('<str:username>/', video_call_view, name='video_call'),
]