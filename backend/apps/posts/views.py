from django.shortcuts import render, redirect
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from .models import Post
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404

@login_required
def home(request):
    """
    Displays the feed.
    - Excludes posts from authors the current user has blocked.
    - Excludes posts from authors who have blocked the current user.
    """
    user = request.user

    posts = Post.objects.select_related("author").exclude(author__blocked_by=user).exclude(author__blocking=user).order_by("-created_at")

    return render(request, "home.html", {"posts": posts})


@require_POST
@login_required
def create_post(request):
    """
    Handles post creation with text, image, or video.
    """
    content = request.POST.get("content", "").strip()
    media = request.FILES.get("media")

    # Default to None
    media_type = Post.MediaType.NONE

    # Determine media type if file exists
    if media:
        if media.content_type.startswith("image"):
            media_type = Post.MediaType.IMAGE
        elif media.content_type.startswith("video"):
            media_type = Post.MediaType.VIDEO

    # Only create if there is content OR media
    if content or media:
        Post.objects.create(
            author=request.user,
            content=content,
            media=media,
            media_type=media_type,
        )

    return redirect("home")


@require_POST
@login_required
def delete_post(request,post_id):
    post = get_object_or_404(Post,id = post_id)

    if post.author != request.user:
        return HttpResponseForbidden("You do not have permission to delete this post.")
    
    post.delete()

    return redirect("home")