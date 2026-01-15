import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async
from django.utils import timezone
from django.core.cache import cache

from .models import Message

User = get_user_model()

# CHAT CONSUMER (Handles Text, Images, Typing, Read Receipts)
class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]

        if not self.user.is_authenticated:
            await self.close()
            return

        self.other_username = self.scope["url_route"]["kwargs"]["username"]


        try:
            self.other_user = await sync_to_async(User.objects.get)(username=self.other_username)
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
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)

        # TYPING INDICATOR
        if data.get("typing"):
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "typing",
                    "user": self.user.username,
                }
            )
            return
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
        


        #  CHAT MESSAGE
        message = data.get("message")
        if not message:
            return

        msg_instance = await sync_to_async(Message.objects.create)(
            sender=self.user, receiver=self.other_user, content=message
        )

        # Send to Chat Room (Updates chat box)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message": message,
                "sender": self.user.username,
                "id": msg_instance.id,
                "timestamp": timezone.localtime(msg_instance.timestamp).strftime("%I:%M %p"),
            }
        )

        # end Notification to Receiver's Global Group (Updates Badges/Toasts)
        await self.channel_layer.group_send(
            f"user_{self.other_user.id}",
            {
                "type": "new_message_notification", 
                "message": message,
                "sender": self.user.username,
            }
        )

    # Handlers 
    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))
    async def typing(self, event):
        await self.send(text_data=json.dumps(event))
    async def message_read(self, event):
        await self.send(text_data=json.dumps(event))



# ONLINE STATUS CONSUMER (Handles Online/Offline, Global Notifications, WebRTC)

class OnlineStatusConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if self.user.is_authenticated:
            # 1. Join Personal Group (for notifications)
            self.group_name = f"user_{self.user.id}"
            await self.channel_layer.group_add(self.group_name, self.channel_name)

            # 2. Join Global Status Group (To receive other people's online updates)
            await self.channel_layer.group_add("status_updates", self.channel_name)

            await self.accept()
            
            #  Update Status (Cache + DB last_seen)
            await self.update_user_status(True)
            await self.broadcast_status(True)
        else:
            await self.close()

    async def disconnect(self, close_code):
        if self.user.is_authenticated:
            # Leave groups
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            await self.channel_layer.group_discard("status_updates", self.channel_name)
            
            #  Set Offline
            await self.update_user_status(False)
            await self.broadcast_status(False)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            command = data.get("command")

            if command == "call_signal":
                target_username = data.get("target")
                signal_data = data.get("data")

                # Find Target User
                try:
                    target_user = await sync_to_async(User.objects.get)(username__iexact=target_username)
                    
                    # Forward Signal to Target's Personal Group
                    await self.channel_layer.group_send(
                        f"user_{target_user.id}",
                        {
                            "type": "webrtc_signal_message",
                            "data": signal_data,
                            "sender": self.user.username
                        }
                    )
                except User.DoesNotExist:
                    print(f"❌ Target '{target_username}' not found")
        except Exception as e:
            print(f"❌ Error: {e}")

    async def broadcast_status(self, is_online):
        timestamp = timezone.localtime(timezone.now()).strftime("%I:%M %p") # e.g. "03:45 PM"
        await self.channel_layer.group_send(
            "status_updates",
            {
                "type": "user_status_event",
                "username": self.user.username,
                "is_online": is_online,
                "last_seen": timestamp
            }
        )

    async def user_status_event(self, event):
        await self.send(text_data=json.dumps({
            "type": "user_status",
            "username": event["username"],
            "is_online": event["is_online"],
            "last_seen": event["last_seen"]
        }))

    async def webrtc_signal_message(self, event):
        # Forward the WebRTC signal to the frontend
        await self.send(text_data=json.dumps({
            "type": "call_signal", 
            "data": event["data"],
            "sender": event["sender"]
        }))

    async def new_message_notification(self, event):
        # Forward the text notification to the frontend
        await self.send(text_data=json.dumps({
            "type": "notification",
            "message": event["message"],
            "sender": event["sender"],
        }))

    @sync_to_async
    def update_user_status(self, is_online):
        user_id = self.user.id
        online_key = f"user_online_{user_id}"
        last_seen_key = f"last_seen_updated_{user_id}"
        
        if is_online:
            # This saves DB writes.
            cache.set(online_key, True, timeout=3600)
            
            if not cache.get(last_seen_key):
                User.objects.filter(id=user_id).update(last_seen=timezone.now())
                cache.set(last_seen_key, True, timeout=500)
        else:
            # B. Remove "Online" status from RAM
            cache.delete(f'user_online_{user_id}')
            
            # C. Update "last_seen" in DB so we know when they left
            User.objects.filter(id=user_id).update(last_seen=timezone.now())








# UNIFIED CONSUMER (Handles Chat, Notifications, Status, Calls)
class UnifiedConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            print(f"❌ Unauthenticated user trying to connect")
            await self.close()
            return

        # Join personal group for notifications
        self.personal_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.personal_group, self.channel_name)

        # Join global status group
        await self.channel_layer.group_add("status_updates", self.channel_name)

        # Check if this is a chat connection
        self.other_username = self.scope["url_route"]["kwargs"].get("username")
        if self.other_username:
            try:
                self.other_user = await sync_to_async(User.objects.get)(username=self.other_username)
                user_ids = sorted([str(self.user.id), str(self.other_user.id)])
                self.chat_room = f"chat_{user_ids[0]}_{user_ids[1]}"
                await self.channel_layer.group_add(self.chat_room, self.channel_name)
            except ObjectDoesNotExist:
                print(f"❌ User {self.other_username} not found")
                self.other_user = None
                self.chat_room = None
        else:
            self.other_user = None
            self.chat_room = None

        await self.accept()
        print(f"✅ {self.user.username} connected to UnifiedConsumer")
        await self.update_user_status(True)
        await self.broadcast_status(True)

    async def disconnect(self, close_code):
        if self.user.is_authenticated:
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)
            await self.channel_layer.group_discard("status_updates", self.channel_name)
            if self.chat_room:
                await self.channel_layer.group_discard(self.chat_room, self.channel_name)
            await self.update_user_status(False)
            await self.broadcast_status(False)

    async def receive(self, text_data):
        data = json.loads(text_data)
        command = data.get("command")

        # TYPING INDICATOR
        if data.get("typing") and self.chat_room:
            await self.channel_layer.group_send(
                self.chat_room,
                {"type": "typing", "user": self.user.username}
            )
            return

        # READ RECEIPT
        if command == "read_receipt" and self.chat_room:
            await self.channel_layer.group_send(
                self.chat_room,
                {"type": "message_read", "message_id": data.get("message_id"), "reader": self.user.username}
            )
            return

        # CHAT MESSAGE
        message = data.get("message")
        if message and self.other_user:
            msg_instance = await sync_to_async(Message.objects.create)(
                sender=self.user, receiver=self.other_user, content=message
            )
            await self.channel_layer.group_send(
                self.chat_room,
                {
                    "type": "chat_message",
                    "message": message,
                    "sender": self.user.username,
                    "id": msg_instance.id,
                    "timestamp": timezone.localtime(msg_instance.timestamp).strftime("%I:%M %p"),
                }
            )
            await self.channel_layer.group_send(
                f"user_{self.other_user.id}",
                {"type": "new_message_notification", "message": message, "sender": self.user.username}
            )
            # Send push notification
            await self.send_push_notification(self.other_user, message)
            return

        # CALL SIGNAL
        if command == "call_signal":
            target_username = data.get("target")
            try:
                target_user = await sync_to_async(User.objects.get)(username__iexact=target_username)
                await self.channel_layer.group_send(
                    f"user_{target_user.id}",
                    {"type": "webrtc_signal_message", "data": data.get("data"), "sender": self.user.username}
                )
            except User.DoesNotExist:
                pass

    # Handlers
    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing(self, event):
        await self.send(text_data=json.dumps(event))

    async def message_read(self, event):
        await self.send(text_data=json.dumps(event))

    async def user_status_event(self, event):
        await self.send(text_data=json.dumps({
            "type": "user_status",
            "username": event["username"],
            "is_online": event["is_online"],
            "last_seen": event["last_seen"]
        }))

    async def webrtc_signal_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "call_signal",
            "data": event["data"],
            "sender": event["sender"]
        }))

    async def new_message_notification(self, event):
        await self.send(text_data=json.dumps({
            "type": "notification",
            "message": event["message"],
            "sender": event["sender"]
        }))

    async def broadcast_status(self, is_online):
        timestamp = timezone.localtime(timezone.now()).strftime("%I:%M %p")
        await self.channel_layer.group_send(
            "status_updates",
            {
                "type": "user_status_event",
                "username": self.user.username,
                "is_online": is_online,
                "last_seen": timestamp
            }
        )

    @sync_to_async
    def update_user_status(self, is_online):
        user_id = self.user.id
        online_key = f"user_online_{user_id}"
        last_seen_key = f"last_seen_updated_{user_id}"
        
        if is_online:
            cache.set(online_key, True, timeout=3600)
            if not cache.get(last_seen_key):
                User.objects.filter(id=user_id).update(last_seen=timezone.now())
                cache.set(last_seen_key, True, timeout=500)
        else:
            cache.delete(f'user_online_{user_id}')
            User.objects.filter(id=user_id).update(last_seen=timezone.now())

    async def send_push_notification(self, receiver, message):
        from apps.accounts.models import PushToken
        from apps.accounts.push_utils import send_push_notification
        
        tokens = await sync_to_async(list)(
            PushToken.objects.filter(user=receiver).values_list('token', flat=True)
        )
        if tokens:
            await sync_to_async(send_push_notification)(
                tokens,
                f"New message from {self.user.username}",
                message,
                {
                    "type": "message", 
                    "sender": self.user.username,
                    "url": f"/chat/{self.user.username}" 
                }
            )