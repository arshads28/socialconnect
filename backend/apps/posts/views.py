from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponseForbidden
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.template.loader import render_to_string
from django.db.models import Count, Prefetch, Exists, OuterRef
from django.core.paginator import Paginator


from rest_framework import viewsets, permissions, status, parsers
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Post, PostLike
from .serializers import PostSerializer, CommentSerializer


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













class UpdateViewSet(viewsets.ModelViewSet):
    """
    Handles:
    - GET /api/updates/       (The Feed/updates)
    - POST /api/updates/      (Create Update with Image/Video)
    - DELETE /api/updates/id/ (Delete Update)
    """
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticated]
    # 'MultiPartParser' is required to handle file uploads (images/videos)
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get_queryset(self):
        # FEED LOGIC: Exclude blocked users, order by newest
        user = self.request.user

        liked_subquery = PostLike.objects.filter(
                            post=OuterRef("pk"),
                            user=user
                        )

        return (Post.objects
            .select_related("author")
            .annotate(likes_count=Count("likes", distinct=True),is_liked=Exists(liked_subquery))
            .exclude(author__blocked_by=user)
            .exclude(author__blocking=user)
            .order_by("-created_at")
            )

    def perform_create(self, serializer):
        media_file = self.request.data.get('media')
        media_type = Post.MediaType.NONE

        # Check if it's a real file
        if media_file and hasattr(media_file, 'content_type'):
            if media_file.content_type.startswith('image'):
                media_type = Post.MediaType.IMAGE
            elif media_file.content_type.startswith('video'):
                media_type = Post.MediaType.VIDEO
        
        serializer.save(author=self.request.user, media_type=media_type)

    def destroy(self, request, *args, **kwargs):
        # SECURITY: Only allow deletion if the user is the author
        post = self.get_object()
        if post.author != request.user:
            return Response(
                {"error": "You can only delete your own posts."}, 
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    # Custom Action for Liking (APIView logic moved inside ViewSet)
    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        post = self.get_object()
        like = PostLike.objects.filter(post=post, user=request.user).first()
        
        liked = False
        if like:
            like.delete()
        else:
            PostLike.objects.create(post=post, user=request.user)
            liked = True
        
        # Use annotation instead of count() to avoid extra query
        likes_count = PostLike.objects.filter(post=post).count()
            
        return Response({
            "liked": liked, 
            "likes_count": likes_count
        })
    


class CommentViewSet(viewsets.ModelViewSet):
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        # For delete/retrieve, don't filter by post_id
        if self.action in ['destroy', 'retrieve']:
            return Comment.objects.select_related('author', 'post__author')
        
        # For list, filter by post_id
        post_id = self.request.query_params.get('post_id')
        if post_id:
            return Comment.objects.filter(post_id=post_id).select_related('author', 'post__author')
        return Comment.objects.none()

    def perform_create(self, serializer):
        # Auto-assign the Post ID and Author
        post_id = self.request.data.get('post_id')
        post = get_object_or_404(Post, id=post_id)
        serializer.save(author=self.request.user, post=post)

    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        # Security: Allow if User is Comment Author OR Post Author
        if request.user == comment.author or request.user == comment.post.author:
            return super().destroy(request, *args, **kwargs)
        return Response({"error": "Permission denied"}, status=status.HTTP_403_FORBIDDEN)