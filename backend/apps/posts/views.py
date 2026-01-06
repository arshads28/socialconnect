from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import Post
from django.shortcuts import redirect
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required


@login_required
def home(request):
    posts = Post.objects.select_related("author").order_by("-created_at")
    return render(request, "home.html", {"posts": posts})


@require_POST
@login_required
def create_post(request):
    content = request.POST.get("content", "").strip()

    if content:
        Post.objects.create(
            author=request.user,
            content=content
        )

    return redirect("home")



@require_POST
@login_required
def create_post(request):
    content = request.POST.get("content", "").strip()
    media = request.FILES.get("media")

    media_type = Post.MediaType.NONE

    if media:
        if media.content_type.startswith("image"):
            media_type = Post.MediaType.IMAGE
        elif media.content_type.startswith("video"):
            media_type = Post.MediaType.VIDEO

    if content or media:
        Post.objects.create(
            author=request.user,
            content=content,
            media=media,
            media_type=media_type,
        )

    return redirect("home")
