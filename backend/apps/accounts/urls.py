from django.urls import path
from .views import signup_view, login_view, logout_view, ProfileViewSet, password_reset_confirm_view, password_reset_request_view, save_push_token
# from django.contrib.auth import views as auth_views
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView



router = DefaultRouter()
router.register(r'profile', ProfileViewSet, basename='profile')
# router.register(r'connect', ConnectionViewSet, basename='connect')




urlpatterns = [
    path("signup/", signup_view, name="signup"),
    path("login/", login_view, name="login"),
    path("logout/", logout_view, name="logout"),

    path('reset-password/', password_reset_request_view, name='password_reset_request'),
    path('reset-password/confirm/', password_reset_confirm_view, name='password_reset_confirm'),

    # MOBILE API VIEWS 
    path("api/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/me/", ProfileViewSet.as_view({'get': 'me'}), name="api_me"),
    path("api/push-token/", save_push_token, name="save_push_token"),
]

urlpatterns += router.urls