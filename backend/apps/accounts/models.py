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


class PushToken(models.Model):
    PLATFORM_CHOICES = [
        ('android', 'Android'),
        ('ios', 'iOS'),
        ('web', 'Web'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_tokens')
    token = models.CharField(max_length=1024, unique=True)
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES, default='android')
    device_name = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'token'])]
        verbose_name = "Push Token"
        verbose_name_plural = "Push Tokens"

    def __str__(self):
        return f"{self.user.username} - {self.platform} - {self.token[:10]}..."
        









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