import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async
from .models import Message

User = get_user_model()

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]

        # Block unauthenticated users
        if not self.user.is_authenticated:
            await self.close()
            return
        
        self.room_name = self.scope["url_route"]["kwargs"]["room"]
        self.room_group_name = f"chat_{self.room_name}"

        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )

        await self.accept()

    async def disconnect(self, close_code):
        # Leave room group
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
    
        message = data["message"]

        if not message:
            return

        # Extract receiver username from room name
        # room format: chat_username
        receiver_username = self.room_name.replace("chat_", "")
        receiver = await sync_to_async(User.objects.get)(
            username=receiver_username
        )

        # SAVE MESSAGE
        await sync_to_async(Message.objects.create)(
            sender=self.user,
            receiver=receiver,
            content=message
        )


        # Send message to room group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": message,
            },
        )

    async def chat_message(self, event):
        message = event["message"]

        # Send message to WebSocket
        await self.send(text_data=json.dumps({
            "message": message,
        }))
        
    async def typing(self, event):
        await self.send(text_data=json.dumps({
            "typing": True,
            "user": event["user"],
        }))
