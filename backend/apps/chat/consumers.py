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

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name, self.channel_name
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

        #  READ RECEIPT (New Addition for Blue Ticks)
        # This handles when the frontend says "I read message #123"
        if data.get("command") == "read_receipt":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "message_read",
                    "message_id": data.get("message_id"),
                    "reader": self.user.username,
                }
            )
            return
        
        if data.get("command") == "call_notification":
            await self.channel_layer.group_send(
                f"user_{self.other_user.id}", 
                {
                    "type": "incoming_call",
                    "caller": self.user.username,
                }
            )
            return

        message = data.get("message")
        if not message:
            return

        # Assigned to 'msg_instance' to get the ID
        msg_instance = await sync_to_async(Message.objects.create)(
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
                "id": msg_instance.id,
                "timestamp": msg_instance.timestamp.strftime("%I:%M %p"),
            }
        )

        #Send Notification to Receiver's Global Group
        # unread_count = await sync_to_async(Message.objects.filter(receiver=self.other_user, is_read=False).count)()
        
        await self.channel_layer.group_send(
            f"user_{self.other_user.id}",
            {
                "type": "new_message_notification", # Matches handler in OnlineStatusConsumer
                "message": message,
                "sender": self.user.username,
                # "count": unread_count   # We calculate on frontend.
            }
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "chat_message", # Added type identifier
            "message": event["message"],
            "sender": event["sender"],
            "id": event["id"], # Added ID
            "timestamp": event["timestamp"], # Added Timestamp
        }))

    async def typing(self, event):
        await self.send(text_data=json.dumps({
            "type": "typing", # Added type identifier
            "typing": True,
            "user": event["user"],
        }))

    # New Handler for Read Receipts
    async def message_read(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_read",
            "message_id": event["message_id"],
            "reader": event["reader"],
        }))



class OnlineStatusConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if self.user.is_authenticated:
            # 1. Join a private group for this user (for notifications)
            self.group_name = f"user_{self.user.id}"
            await self.channel_layer.group_add(self.group_name, self.channel_name)

            # 2. Update Online Status
            await self.update_user_status(True)
            await self.accept()
        else:
            await self.close()

    async def disconnect(self, close_code):
        if self.user.is_authenticated:
            # Leave group
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            await self.update_user_status(False)

    async def new_message_notification(self, event):
        # Send notification data to the frontend
        await self.send(text_data=json.dumps({
            "type": "notification",
            "message": event["message"],
            "sender": event["sender"],
            # "count": event["count"]
        }))

    @sync_to_async
    def update_user_status(self, is_online):
        User.objects.filter(id=self.user.id).update(
            is_online=is_online,
            last_seen=timezone.now()
        )

    async def incoming_call(self, event):
        await self.send(text_data=json.dumps({
            "type": "incoming_call",
            "caller": event["caller"]
        }))
