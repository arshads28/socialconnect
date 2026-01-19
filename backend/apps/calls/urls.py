from django.urls import path
from .views import system_health_check, run_cleanup_job


urlpatterns = [
    path('system/health/', system_health_check),
    path('system/cleanup/', run_cleanup_job),
]



# in urls.py where setting is   
# path("call/", include("apps.calls.urls")),