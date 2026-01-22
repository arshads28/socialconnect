from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.contrib.auth import authenticate
# from .models import Connection

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    is_own_profile = serializers.SerializerMethodField()
    connection_status = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()


    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'bio', 'interests',
            'avatar', 'avatar_url',
            'is_own_profile',
            'connection_status',
            'is_online',
            'last_seen'
        )
        read_only_fields = ('id', 'username', 'email')

    def get_avatar_url(self, obj):
        request = self.context['request']
        return request.build_absolute_uri(obj.avatar.url) if obj.avatar else None

    def get_is_own_profile(self, obj):
        return self.context['request'].user == obj
    

    def get_connection_status(self, obj):
        request = self.context.get('request')
        if not request or request.user.is_anonymous:
            return 'NONE'

        if request.user == obj:
            return 'SELF'

        # We read the attribute annotated in get_queryset
        is_blocked = getattr(obj, 'is_blocked_by_me', False)
        
        if is_blocked:
            return 'BLOCKED'

        return 'NONE'
    
    def get_is_online(self,obj):
        is_online = (f"user_online_{obj.id}")
        return True if is_online else False

    def validate_avatar(self, value):
        if value.size > 1 * 1024 * 1024:
            raise serializers.ValidationError("Avatar must be under 1MB")

        if not value.content_type.startswith("image/"):
            raise serializers.ValidationError("Invalid image type")

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




# --- AUTH SERIALIZERS ---
class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password']
        )
        return user

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        user = authenticate(**data)
        if user and user.is_active:
            return user
        raise serializers.ValidationError("Invalid Credentials")