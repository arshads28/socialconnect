from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from .models import Post


@login_required
def home(request):
    posts = Post.objects.select_related("author").order_by("-created_at")
    return render(request, "home.html", {"posts": posts})
