import uuid
import mimetypes
from django.db import models, transaction
from django.conf import settings

class Message(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        AUDIO = "audio"
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
    
    # Single Source of Truth for Media Types
    def infer_media_type(self):
        if not self.media:
            return self.MediaType.NONE
        content_type, _ = mimetypes.guess_type(self.media.name)
        if content_type:
            if content_type.startswith("video"):
                return self.MediaType.VIDEO
            if content_type.startswith("image"):
                return self.MediaType.IMAGE
            if content_type.startswith("audio"):
                return self.MediaType.AUDIO
        return self.MediaType.NONE


    def save(self, *args, **kwargs):
        is_new = self._state.adding

        # Auto-detect media type if not set
        if is_new and self.media and self.media_type == self.MediaType.NONE:
            self.media_type = self.infer_media_type()
            self.processing = True

        super().save(*args, **kwargs)

        # Trigger processing if needed
        if is_new and self.media:
            if self.media_type == self.MediaType.VIDEO or self.media_type == self.MediaType.AUDIO:
                Message.objects.filter(pk=self.pk).update(processing=False)
            else:
                def run_after_commit():
                    from .background import process_chat_image_background
                    from apps.posts.threadpool import thread_pool_executor 
                    thread_pool_executor.submit(process_chat_image_background, self.id)  

                transaction.on_commit(run_after_commit)