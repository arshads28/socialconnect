from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Message, Device, SignedPreKey, OneTimePreKey

User = get_user_model()

class InboxSerializer(serializers.ModelSerializer):
    unread_count = serializers.IntegerField(read_only=True)
    last_message = serializers.CharField(read_only=True)
    last_message_time = serializers.DateTimeField(read_only=True)
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
    

class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.ReadOnlyField(source='sender.username')
    receiver_username = serializers.ReadOnlyField(source='receiver.username')
    media = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'client_id', 'sender', 'sender_username', 
            'receiver', 'receiver_username', 
            'encrypted_content', 'status', 'timestamp',
            'media', 'media_type', 'processing', 'deleted_globally'
        ]

    def get_media(self, obj):
        if obj.deleted_globally:
            return None
            
        if obj.media:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.media.url)
            return obj.media.url
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)

        if instance.deleted_globally:
            data['encrypted_content'] = "" 
            data['media'] = None
            data['media_type'] = "none"
            data['status'] = "deleted"
        
        return data
    


class SignedPreKeySerializer(serializers.Serializer):
    keyId = serializers.IntegerField()
    publicKey = serializers.CharField()
    signature = serializers.CharField()

class PreKeySerializer(serializers.Serializer):
    keyId = serializers.IntegerField()
    publicKey = serializers.CharField()

class KeyBundleUploadSerializer(serializers.Serializer):
    registrationId = serializers.IntegerField()
    identityKey = serializers.CharField()
    signedPreKey = SignedPreKeySerializer()
    preKeys = PreKeySerializer(many=True)