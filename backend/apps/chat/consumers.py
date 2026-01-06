import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async
from .models import Message
from django.utils import timezone

User = get_user_model()

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]

        if not self.user.is_authenticated:
            await self.close()
            return

        self.other_username = self.scope["url_route"]["kwargs"]["username"]

        await sync_to_async(User.objects.filter(id=self.user.id).update)(
            is_online=True,
            last_seen=timezone.now()
        )
        try:
            self.other_user = await sync_to_async(User.objects.get)(
                username=self.other_username
            )
        except ObjectDoesNotExist:
            await self.close()
            return

        user_ids = sorted([str(self.user.id), str(self.other_user.id)])
        self.room_name = f"chat_{user_ids[0]}_{user_ids[1]}"
        self.room_group_name = self.room_name

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await sync_to_async(User.objects.filter(id=self.user.id).update)(
            is_online=False,
            last_seen=timezone.now()
        )
        
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name,
        )



    async def receive(self, text_data):
        data = json.loads(text_data)

        if data.get("typing"):
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "typing",
                    "user": self.user.username,
                }
            )
            return

        message = data.get("message")
        if not message:
            return

        await sync_to_async(Message.objects.create)(
            sender=self.user,
            receiver=self.other_user,
            content=message
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": message,
                "sender": self.user.username,
            }
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            "message": event["message"],
            "sender": event["sender"],
        }))

    async def typing(self, event):
        await self.send(text_data=json.dumps({
            "typing": True,
            "user": event["user"],
        }))
