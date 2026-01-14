from django.db import models, transaction
from django.conf import settings
import mimetypes
import uuid

class Post(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        NONE = "none", "None"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

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
        is_new = self._state.adding
        super().save(*args, **kwargs)

        
        if is_new and self.media:
            
            content_type, _ = mimetypes.guess_type(self.media.name)
            
            # Handle Video Immediately
            if content_type and content_type.startswith('video'):
                Post.objects.filter(pk=self.pk).update(media_type=self.MediaType.VIDEO, processing=False,)
            
            # Handle Image in Background
            else:
                # TODO: replace ThreadPool with Celery when moving off free tier
                def run_after_commit():
                    from .background import process_post_image_background
                    from .threadpool import thread_pool_executor

                    thread_pool_executor.submit(process_post_image_background, self.id)  

                transaction.on_commit(run_after_commit)              


    def __str__(self):
        return f"Post by {self.author} at {self.created_at}"


    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["author", "-created_at"]),
            models.Index(fields=["-created_at"]),
        ]




class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="post_likes")
    created_at = models.DateTimeField(auto_now_add=True)


    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["post", "user"],name="unique_post_like"),
        ]
        indexes = [
            models.Index(fields=["post"]),
            models.Index(fields=["user"]),
        ]




class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)


    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["post", "created_at"]),
        ]