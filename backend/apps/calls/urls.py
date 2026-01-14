from django.urls import path
from .views import video_call_view,health_check


urlpatterns = [
    path('health/', health_check),
    path('<str:username>/', video_call_view, name='video_call'),
    
]