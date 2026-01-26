import uuid
import mimetypes
from django.db import models, transaction
from django.conf import settings

class Message(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        NONE = "none", "None"
    
    client_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, null=True)
    
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="sent_messages",
        on_delete=models.CASCADE,
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="received_messages",
        on_delete=models.CASCADE,
    )

    status = models.CharField(
        max_length=20, 
        default='sent',
        choices=[
            ('sent', 'Sent'), 
            ('delivered', 'Delivered'), 
            ('read', 'Read'),
            ('deleted', 'Deleted') 
        ]
    )
    
    encrypted_content = models.TextField(blank=True) 

    media = models.FileField(upload_to="chat_media/", blank=True, null=True)
    media_type = models.CharField(
        max_length=10,
        choices=MediaType.choices,
        default=MediaType.NONE,
    )
    processing = models.BooleanField(default=False)

    timestamp = models.DateTimeField(auto_now_add=True)

    # List of user IDs who deleted this message locally
    deleted_for = models.JSONField(default=list, blank=True)  
    # Boolean to check if deleted for everyone
    deleted_globally = models.BooleanField(default=False)

    class Meta:
        ordering = ["timestamp", "id"]
        indexes = [
            models.Index(fields=['sender', 'receiver']),
            models.Index(fields=['receiver', 'timestamp']),
            models.Index(fields=['client_id']),
        ]

    def __str__(self):
        return f"{self.sender} -> {self.receiver} [{self.client_id}]"
    
    def save(self, *args, **kwargs):
        is_new = self._state.adding

        if is_new and self.media:
            self.processing = True

        super().save(*args, **kwargs)

        if is_new and self.media:
            content_type, _ = mimetypes.guess_type(self.media.name)
            
            if content_type and content_type.startswith('video'):
                Message.objects.filter(pk=self.pk).update(
                    media_type=self.MediaType.VIDEO, 
                    processing=False
                )
            else:
                # Trigger background processing
                def run_after_commit():
                    from .background import process_chat_image_background
                    from apps.posts.threadpool import thread_pool_executor 
                    thread_pool_executor.submit(process_chat_image_background, self.id)  

                transaction.on_commit(run_after_commit)