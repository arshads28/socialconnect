from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Connection

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    is_own_profile = serializers.SerializerMethodField()
    connection_status = serializers.SerializerMethodField()
    # followers_count = serializers.SerializerMethodField()
    # following_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'username', 'email', 'bio', 'interests',
            'avatar', 'avatar_url',
            'is_own_profile',
            'connection_status',
        )
        read_only_fields = ('username', 'email')

    def get_avatar_url(self, obj):
        request = self.context['request']
        return request.build_absolute_uri(obj.avatar.url) if obj.avatar else None

    def get_is_own_profile(self, obj):
        return self.context['request'].user == obj
    
    def validate_avatar(self, value):
        if value.size > 1 * 1024 * 1024:
            raise serializers.ValidationError("Avatar must be under 1MB")

        if not value.content_type.startswith("image/"):
            raise serializers.ValidationError("Invalid image type")

        return value


    def get_connection_status(self, obj):
        request = self.context.get('request')
        if not request or request.user.is_anonymous:
            return 'NONE'

        if request.user == obj:
            return 'SELF'

        # Check if the logged-in user has this profile in their 'blocking' list
        if request.user.blocking.filter(pk=obj.pk).exists():
            return 'BLOCKED'

        return 'NONE'

    def validate_avatar(self, value):
        if value.size > 1 * 1024 * 1024:
            raise serializers.ValidationError("Avatar must be under 1MB")
        return value



    #     conn = Connection.objects.filter(sender=request.user,receiver=obj).first()

    #     return conn.status if conn else 'NONE'

    # def get_followers_count(self, obj):
    #     return obj.received_connections.filter(status=Connection.Status.ACCEPTED).count()

    # def get_following_count(self, obj):
    #     return obj.sent_connections.filter(status=Connection.Status.ACCEPTED).count()


class ProfileUpdateSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = ('bio', 'interests', 'avatar', 'avatar_url')

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        return request.build_absolute_uri(obj.avatar.url) if obj.avatar and request else None




# class ConnectionSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Connection
#         fields = ['id', 'sender', 'receiver', 'status', 'created_at']
#         read_only_fields = ['sender', 'receiver', 'created_at']