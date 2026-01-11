from django.urls import path
from .views import signup_view, login_view, logout_view,edit_profile_api,profile_data_api

urlpatterns = [
    path("signup/", signup_view, name="signup"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    # path("profile/", profile_view, name="profile"),
    # path("profile/edit/", edit_profile_view, name="edit_profile"),
    # path('profile/<str:username>/', public_profile, name='public_profile'),
    path('api/profile/<str:username>/', profile_data_api, name='profile_api'),
    path('api/profile/edit/', edit_profile_api, name='edit_profile_api'),
]
