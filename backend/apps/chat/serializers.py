from rest_framework import serializers
from django.contrib.auth import get_user_model
User = get_user_model()

class InboxSerializer(serializers.ModelSerializer):
    unread_count = serializers.IntegerField(source='pending_count', read_only=True)
    last_message = serializers.CharField(source='last_msg_preview', read_only=True)
    last_message_time = serializers.DateTimeField(source='last_msg_timestamp', read_only=True)
    is_online = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'username', 'avatar_url', 
            'is_online', 'unread_count', 
            'last_message', 'last_message_time'
        )

    def get_is_online(self, obj):
        # Retrieve from context to avoid individual cache hits inside the loop
        online_statuses = self.context.get('online_statuses', {})
        return online_statuses.get(f"user_online_{obj.id}", False)

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None