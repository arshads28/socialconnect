from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.template.loader import render_to_string
from django.db.models import Count, Prefetch, Exists, OuterRef
from django.core.paginator import Paginator


from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .serializers import PostSerializer


from .models import Post, PostLike, Comment

@login_required
def home(request):
    """
    Displays the feed.
    - Optimized with prefetch_related and annotations to avoid N+1 queries.
    """
    user = request.user

    #check if current user liked the post
    is_liked_subquery = PostLike.objects.filter(
        post=OuterRef("pk"),
        user=user
    )

    # avoid N+1 queries
    comments_prefetch = Prefetch(
        "comments",
        queryset=Comment.objects.select_related("author")
    )

    # 3. Main Query
    posts_all = (Post.objects
             .select_related("author")
             .prefetch_related(comments_prefetch) 
             .exclude(author__blocked_by=user)
             .exclude(author__blocking=user)
             .annotate(
                 likes_count=Count("likes", distinct=True),
                 is_liked=Exists(is_liked_subquery) 
             )
             .order_by("-created_at")
    )

    # 4. Pagination
    paginator = Paginator(posts_all, 8)
    page_number = request.GET.get("page")
    posts = paginator.get_page(page_number)

    return render(request, "home.html", {"posts": posts})


@require_POST
@login_required
def create_post(request):
    """
    Async Post Creation.
    Returns the HTML of the single new post to inject into the feed.
    """
    content = request.POST.get("content", "").strip()
    media = request.FILES.get("media")
    media_type = Post.MediaType.NONE

    if media:
        if media.content_type.startswith("image"):
            media_type = Post.MediaType.IMAGE
        elif media.content_type.startswith("video"):
            media_type = Post.MediaType.VIDEO

    if content or media:
        post = Post.objects.create(
            author=request.user,
            content=content,
            media=media,
            media_type=media_type,
        )

        # Render just the card for this specific post
        post_html = render_to_string(
            "includes/single_post.html", 
            {"post": post, "user": request.user}, 
            request=request
        )
        
        return JsonResponse({"status": "success", "post_html": post_html})

    return JsonResponse({"error": "Empty post"}, status=400)


@require_POST
@login_required
def delete_post(request, post_id):
    """
    Async Post Deletion.
    """
    post = get_object_or_404(Post, id=post_id)

    if post.author != request.user:
        return JsonResponse({"error": "Permission denied"}, status=403)
    
    post.delete()

    return JsonResponse({"status": "deleted", "post_id": post_id})


@require_POST
@login_required
def toggle_like(request, post_id):
    """
    Async Like/Unlike.
    """
    post = get_object_or_404(Post, id=post_id)
    like = PostLike.objects.filter(post=post, user=request.user).first()
    
    liked = False
    if like:
        like.delete()
        liked = False
    else:
        PostLike.objects.create(post=post, user=request.user)
        liked = True

    return JsonResponse({
        "liked": liked, 
        "likes_count": post.likes.count()
    })


@require_POST
@login_required
def add_comment(request, post_id):
    """
    Async Comment Creation.
    """
    post = get_object_or_404(Post, id=post_id)
    content = request.POST.get("content", "").strip()

    if not content:
        return JsonResponse({"error": "Empty comment"}, status=400)

    comment = Comment.objects.create(
        post=post,
        author=request.user,
        content=content
    )

    return JsonResponse({
        "comment_id": comment.id,
        "author": comment.author.username,
        "content": comment.content,
        "count": post.comments.count()
    })


@require_POST
@login_required
def delete_comment(request, comment_id):
    """
    Async Comment Deletion.
    Allows deletion if user is Comment Author OR Post Author.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    # Permission Check
    if request.user == comment.author or request.user == comment.post.author:
        comment.delete()
        return JsonResponse({"status": "deleted"})
    
    return JsonResponse({"error": "Permission denied"}, status=403)













class PostFeedAPIView(generics.ListAPIView):
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Replicating your existing logic: exclude blocked/blocking users
        return Post.objects.select_related("author")\
            .exclude(author__blocked_by=user)\
            .exclude(author__blocking=user)\
            .order_by("-created_at")

class ToggleLikeAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, id=post_id)
        like = PostLike.objects.filter(post=post, user=request.user).first()
        
        if like:
            like.delete()
            liked = False
        else:
            PostLike.objects.create(post=post, user=request.user)
            liked = True
            
        return Response({
            "liked": liked, 
            "likes_count": post.likes.count()
        }, status=status.HTTP_200_OK)