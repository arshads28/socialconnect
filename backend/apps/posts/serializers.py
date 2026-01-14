from rest_framework import serializers
from .models import Post, PostLike, Comment
from django.contrib.auth import get_user_model

User = get_user_model()

# 1. Author Info (So we know who posted)
class AuthorSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'avatar']

# 2. Comment Serializer
class CommentSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    class Meta:
        model = Comment
        fields = ['id', 'author', 'content', 'created_at']

# 3. Main Post Serializer
class PostSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    is_liked = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    
    # We use this to get the full absolute URL for the image/video
    media = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            'id', 'author', 'content', 'media', 'media_type', 
            'created_at', 'likes_count', 'is_liked', 'processing'
        ]

    def get_likes_count(self, obj):
        return obj.likes.count()

    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            # Efficiently checks if the user liked this specific post
            return PostLike.objects.filter(post=obj, user=request.user).exists()
        return False

    def get_media(self, obj):
        if obj.media:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.media.url)
        return None