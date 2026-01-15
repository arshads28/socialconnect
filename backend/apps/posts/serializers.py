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
    post_author_id = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ['id', 'post', 'author', 'content', 'created_at', 'post_author_id']
        read_only_fields = ['post', 'author']

    def get_post_author_id(self, obj):
        return str(obj.post.author.id)
    

# 3. Main Post Serializer
class PostSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    comments_count = serializers.SerializerMethodField()
    is_liked = serializers.BooleanField(read_only=True)
    is_author = serializers.SerializerMethodField()
    media = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = Post
        fields = [
            'id', 'author', 'content', 'media', 'media_type', 
            'created_at', 'likes_count', 'comments_count', 'is_liked', 'is_author', 'processing'
        ]

    def get_is_author(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return request.user == obj.author
        return False
    
    def get_comments_count(self, obj):
        return obj.comments.count()

    # def get_likes_count(self, obj):
    #     return obj.likes.count()

    # def get_is_liked(self, obj):
    #     request = self.context.get('request')
    #     if request and request.user.is_authenticated:
    #         # Efficiently checks if the user liked this specific post
    #         return PostLike.objects.filter(post=obj, user=request.user).exists()
    #     return False

