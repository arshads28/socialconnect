from django.urls import path
from .views import home, create_post, delete_post

urlpatterns = [
    path("", home, name="home"),
    path("post/create/", create_post, name="create_post"),
    path('post/delete/<uuid:post_id>/', delete_post, name='delete_post'),
    
]
