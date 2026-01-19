import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.postgres.indexes import GinIndex

class User(AbstractUser):

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    bio = models.TextField(max_length=200, blank=True)
    interests = models.TextField(max_length=200, blank=True)
    blocking = models.ManyToManyField(
        'self', 
        related_name='blocked_by', 
        symmetrical=False, 
        blank=True
    )

    # Metadata
    # is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.username

    class Meta:
        ordering = ['-date_joined']
        indexes = [
            GinIndex(
                fields=["username"],
                name ="user_name_gin",
                opclasses=["gin_trgm_ops"],
            )
        ]




class PushDevice(models.Model):
    PLATFORM_CHOICES = (
        ('ios', 'iOS'),
        ('android', 'Android'),
        ('web', 'Web'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_devices')
    
    # device_id comes from our frontend utils/deviceId.ts (the UUID)
    device_id = models.CharField(max_length=255) 
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    
    # The actual address for the notification
    token = models.CharField(max_length=1024) 
    device_name = models.CharField(max_length=255, blank=True, null=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One token per Installation ID per User
        unique_together = ('user', 'device_id') 
        indexes = [
            models.Index(fields=['user', 'last_seen_at']),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.device_name}"







# class Connection(models.Model):

#     class Status(models.TextChoices):
#         PENDING = 'PENDING', _('Pending')
#         ACCEPTED = 'ACCEPTED', _('Accepted')
#         REJECTED = 'REJECTED', _('Rejected')
#         BLOCKED = 'BLOCKED', _('Blocked')

#     id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
#     sender = models.ForeignKey(
#         User, 
#         on_delete=models.CASCADE, 
#         related_name='sent_connections'
#     )
#     receiver = models.ForeignKey(
#         User, 
#         on_delete=models.CASCADE, 
#         related_name='received_connections'
#     )
#     status = models.CharField(
#         max_length=10, 
#         choices=Status.choices, 
#         default=Status.PENDING
#     )
#     created_at = models.DateTimeField(auto_now_add=True)
#     updated_at = models.DateTimeField(auto_now=True)

#     class Meta:
#         unique_together = ('sender', 'receiver')
#         indexes = [
#             models.Index(fields=['sender', 'receiver']),
#             models.Index(fields=['status']),
#         ]

#     def __str__(self):
#         return f"{self.sender} -> {self.receiver} ({self.status})"

#     def block(self):
#         self.status = self.Status.BLOCKED
#         self.save()

#     def accept(self):
#         self.status = self.Status.ACCEPTED
#         self.save()