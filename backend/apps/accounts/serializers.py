from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Connection

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    is_own_profile = serializers.SerializerMethodField()
    # connection_status = serializers.SerializerMethodField()
    # followers_count = serializers.SerializerMethodField()
    # following_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'username', 'email', 'bio', 'interests',
            'avatar', 'avatar_url',
            'is_own_profile',
        )
        read_only_fields = ('username', 'email')

    def get_avatar_url(self, obj):
        request = self.context['request']
        return request.build_absolute_uri(obj.avatar.url) if obj.avatar else None

    def get_is_own_profile(self, obj):
        return self.context['request'].user == obj

    # def get_connection_status(self, obj):
    #     request = self.context['request']
    #     if request.user == obj:
    #         return 'SELF'

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
        return request.build_absolute_uri(obj.avatar.url) if obj.avatar else None




# class ConnectionSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Connection
#         fields = ['id', 'sender', 'receiver', 'status', 'created_at']
#         read_only_fields = ['sender', 'receiver', 'created_at']