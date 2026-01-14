from django.urls import path
from .views import home, create_post, delete_post,toggle_like,add_comment,delete_comment

urlpatterns = [
    path("", home, name="home"),
    path("post/create/", create_post, name="create_post"),
    path('post/delete/<uuid:post_id>/', delete_post, name='delete_post'),
    path('post/like/<uuid:post_id>/', toggle_like, name='toggle_like'),
    path('post/comment/<uuid:post_id>/', add_comment, name='add_comment'),
    path('post/comment/delete/<int:comment_id>/', delete_comment, name='delete_comment'),
    
]
