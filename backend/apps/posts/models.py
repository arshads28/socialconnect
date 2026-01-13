from django.db import models
from django.conf import settings
import mimetypes

class Post(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        NONE = "none", "None"

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
    )
    content = models.TextField(blank=True)
    media = models.FileField(upload_to="posts/", blank=True, null=True)
    media_type = models.CharField(
        max_length=10,
        choices=MediaType.choices,
        default=MediaType.NONE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    processing = models.BooleanField(default=True)

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)

        
        if is_new and self.media:
            
            content_type, _ = mimetypes.guess_type(self.media.name)
            
            # Handle Video Immediately
            if content_type and content_type.startswith('video'):
                Post.objects.filter(pk=self.pk).update(media_type=self.MediaType.VIDEO, processing=False,)
            
            # Handle Image in Background
            else:
                from .background import process_post_image_background
                from .threadpool import thread_pool_executor
                
                thread_pool_executor.submit(process_post_image_background, self.id)                

    @property
    def likes_count(self):
        return self.likes.count()

    def __str__(self):
        return f"Post by {self.author} at {self.created_at}"


class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="post_likes")
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        unique_together = ("post", "user")

class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["created_at"]