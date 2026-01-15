from rest_framework import serializers

class InboxSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    username = serializers.CharField()
    avatar_url = serializers.SerializerMethodField()
    is_online = serializers.BooleanField()
    status_text = serializers.CharField()
    unread_count = serializers.IntegerField()

    def get_avatar_url(self, obj):
        return obj.get('avatar_url')
