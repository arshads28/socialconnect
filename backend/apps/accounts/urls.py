from django.urls import path
from .views import signup_view, login_view, logout_view, ProfileViewSet, ConnectionViewSet

from rest_framework.routers import DefaultRouter



router = DefaultRouter()
router.register(r'profile', ProfileViewSet, basename='profile')
router.register(r'connect', ConnectionViewSet, basename='connect')




urlpatterns = [
    path("signup/", signup_view, name="signup"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    # path("profile/", profile_view, name="profile"),
    # path("profile/edit/", edit_profile_view, name="edit_profile"),
    # path('profile/<str:username>/', public_profile, name='public_profile'),
]

urlpatterns = router.urls