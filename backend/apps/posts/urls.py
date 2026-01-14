from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    home, create_post, delete_post, toggle_like, add_comment, delete_comment,
    PostViewSet ,CommentViewSet
)

# Create the Router
router = DefaultRouter()
router.register(r'api/posts', PostViewSet, basename='api_posts')
router.register(r'api/comments', CommentViewSet, basename='api_comments')

urlpatterns = [

    path("", home, name="home"),
    path("post/create/", create_post, name="create_post"),
    path('post/delete/<uuid:post_id>/', delete_post, name='delete_post'),
    path('post/like/<uuid:post_id>/', toggle_like, name='toggle_like'),
    path('post/comment/<uuid:post_id>/', add_comment, name='add_comment'),
    path('post/comment/delete/<int:comment_id>/', delete_comment, name='delete_comment'),

    # --- Add the Router URLs for Mobile ---
    path('', include(router.urls)),
]