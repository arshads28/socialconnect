import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.exceptions import ObjectDoesNotExist
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from django.utils import timezone
from django.core.cache import cache
import asyncio

from .models import Message

User = get_user_model()

# UNIFIED CONSUMER (Handles Chat, Notifications, Status, Calls)

class UnifiedConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        #  Personal (Use ID for stability)
        self.personal_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.personal_group, self.channel_name)

        #  Status Monitor (I broadcast my status TO this group)
        self.my_status_monitor_group = f"status_monitor_{self.user.id}"
        
        self.current_room = None
        self.watched_user_group = None 
        self.other_user_in_room = None

        await self.accept()
        
        # Await directly to ensure status is set BEFORE anything else happens
        await self.update_user_status(True)
        await self.broadcast_status_to_watchers(True)
        

    async def disconnect(self, close_code):
        if self.user.is_authenticated:
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)
            
            if self.current_room:
                await self.channel_layer.group_discard(self.current_room, self.channel_name)
                # Cleanup presence immediately
                await sync_to_async(cache.delete)(f"presence_room_{self.user.id}")

            if self.watched_user_group:
                await self.channel_layer.group_discard(self.watched_user_group, self.channel_name)

            # Await offline status to ensure DB is updated correctly
            await self.update_user_status(False)
            await self.broadcast_status_to_watchers(False)

    async def receive(self, text_data):
        """
        Central command handler for the Single Socket.
        """
        try:
            data = json.loads(text_data)
            command = data.get("command")

            # -----------------------------------------------------------
            #  HEARTBEAT (Critical for accurate Online Status)
            # -----------------------------------------------------------
            if command == "ping":
                # Direct await is fast (Redis)
                await self.update_user_status(True)

            # -----------------------------------------------------------
            # NAVIGATION (Virtual Rooms)
            # -----------------------------------------------------------
            elif command == "join_room":
                await self.handle_join_room(data.get("username"))

            elif command == "leave_room":
                await self.handle_leave_room()

            # -----------------------------------------------------------
            # MESSAGING (Idempotent & Postman Logic)
            # -----------------------------------------------------------
            elif command == "send_message":
                await self.handle_send_message(data)

            elif command == "mark_read":
                await self.handle_mark_read(data)

            elif command == "typing":
                await self.handle_typing()

            # -----------------------------------------------------------
            #  CALLING (WebRTC Signaling)
            # -----------------------------------------------------------
            elif command == "call_signal":
                await self.handle_call_signal(data)

        except Exception as e:
            print(f"WS Error: {e}")

    # ===============================================================
    #  LOGIC HANDLERS
    # ===============================================================

    async def handle_join_room(self, target_username):
        try:
            other_user = await self.get_user_optimized(target_username)
            self.other_user_in_room = other_user
            
            user_ids = sorted([str(self.user.id), str(other_user.id)])
            new_room = f"chat_{user_ids[0]}_{user_ids[1]}"

            if self.current_room and self.current_room != new_room:
                await self.handle_leave_room()

            self.current_room = new_room
            await self.channel_layer.group_add(self.current_room, self.channel_name)
            
            await sync_to_async(cache.set)(f"presence_room_{self.user.id}", self.current_room, timeout=None)

            # Subscribe to THEIR status updates
            self.watched_user_group = f"status_monitor_{other_user.id}"
            await self.channel_layer.group_add(self.watched_user_group, self.channel_name)

            #Get immediate status
            is_online = await sync_to_async(cache.get)(f"user_online_{other_user.id}")
            
            await self.send(text_data=json.dumps({
                "type": "user_status_event", # Unified event name
                "username": target_username,
                "is_online": bool(is_online),
                "last_seen": timezone.now().isoformat() # Best effort timestamp
            }))
            
        except ObjectDoesNotExist:
            pass


    async def handle_leave_room(self):
        if self.current_room:
            await self.channel_layer.group_discard(self.current_room, self.channel_name)
        
        if self.watched_user_group:
            await self.channel_layer.group_discard(self.watched_user_group, self.channel_name)
            self.watched_user_group = None
            
        await sync_to_async(cache.delete)(f"presence_room_{self.user.id}")
        self.current_room = None
        self.other_user_in_room = None


    async def handle_leave_room(self):
        if self.current_room:
            await self.channel_layer.group_discard(self.current_room, self.channel_name)
            if self.watched_user_group:
                await self.channel_layer.group_discard(self.watched_user_group, self.channel_name)
                self.watched_user_group = None
            
            await sync_to_async(cache.delete)(f"presence_room_{self.user.id}")
            self.current_room = None
            self.other_user_in_room = None

    async def handle_typing(self):
        if not self.current_room: return
        await self.channel_layer.group_send(
            self.current_room, 
            {"type": "typing_event", "sender": self.user.username}
        )

    async def handle_send_message(self, data):
        client_id = data.get("client_id")
        ciphertext = data.get("ciphertext")
        
        if not client_id or not ciphertext or not self.current_room:
            return

        if await self.message_exists(client_id):
            existing_msg = await self.get_message_by_client_id(client_id)
            if existing_msg:
                await self.send_ack(client_id, existing_msg.id, existing_msg.status)
            return

        # 1. Save to DB (Status=Sent)
        msg_instance = await self.create_message(client_id, ciphertext)
        
        payload = {
            "type": "chat_message",
            "ciphertext": ciphertext,
            "sender": self.user.username,
            "id": msg_instance.id,
            "client_id": str(msg_instance.client_id),
            "timestamp": msg_instance.timestamp.isoformat(),
        }

        # 2. Routing Logic
        if self.other_user_in_room:
            presence = await sync_to_async(cache.get)(f"presence_room_{self.other_user_in_room.id}")
            
            if presence == self.current_room:
                # A. Target in room -> DELIVERED immediately
                await self.channel_layer.group_send(self.current_room, payload)
                await self.mark_message_delivered(msg_instance)
                await self.send_ack(client_id, msg_instance.id, "delivered")
                return

        # B. Target not in room -> SENT
        await self.send_ack(client_id, msg_instance.id, "sent")
        
        # C. Notifications (Check if Online -> Mark Delivered)
        await self.handle_notifications(self.other_user_in_room, msg_instance)

    async def handle_call_signal(self, data):
        target_username = data.get("target")
        try:
            target_user = await self.get_user_optimized(target_username)
            await self.channel_layer.group_send(
                f"user_{target_user.id}",
                {"type": "webrtc_signal_message", "data": data.get("data"), "sender": self.user.username}
            )
        except ObjectDoesNotExist:
            pass

    async def handle_notifications(self, receiver, msg_instance):
        is_online = await sync_to_async(cache.get)(f"user_online_{receiver.id}")
        
        if is_online:
            # 1. Send Toast to Receiver (via Personal Group)
            await self.channel_layer.group_send(
                f"user_{receiver.id}",
                {"type": "new_message_notification", "sender": self.user.username}
            )
            
            # 2.Mark Delivered because they are Online
            await self.mark_message_delivered(msg_instance)

            # 3. Notify ME (Sender) that it is Delivered
            await self.send_ack(msg_instance.client_id, msg_instance.id, "delivered")
        
        else:
            # Push Notification (Keep this async/task as it is external and slow)
            import asyncio
            asyncio.create_task(self.send_push_notification(receiver))

    async def handle_mark_read(self, data):
        sender_username = data.get('sender') 
        if not sender_username: return

        # 1. Update DB
        count = await self.update_messages_to_read(sender_username)

        # 2. Notify Sender
        if count > 0:
            try:
                sender_user = await self.get_user_optimized(sender_username)
                await self.channel_layer.group_send(
                    f"user_{sender_user.id}", # ✅ FIX: Use ID Group
                    {
                        'type': 'status_update',
                        'status': 'read',
                        'reader': self.user.username,
                        'conversation_id': self.user.username 
                    }
                )
            except ObjectDoesNotExist:
                pass

    # ===============================================================
    # 📡 SENDERS (Server -> Client Events)
    # ===============================================================

    async def chat_message(self, event):
        if event["sender"] == self.user.username:
            return
        await self.send(text_data=json.dumps(event))

    async def seen_receipt(self, event):
        if event["reader"] == self.user.username:
            return
        await self.send(text_data=json.dumps(event))

    async def status_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def typing_event(self, event):
        if event["sender"] != self.user.username:
            await self.send(text_data=json.dumps(event))

    async def user_status_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def new_message_notification(self, event):
        await self.send(text_data=json.dumps(event))

    async def webrtc_signal_message(self, event):
        await self.send(text_data=json.dumps(event))


    # ===============================================================
    # 🛠 UTILITIES & DATABASE
    # ===============================================================

    @database_sync_to_async
    def get_user_optimized(self, username):
        return User.objects.only('id', 'username').get(username=username)

    @database_sync_to_async
    def message_exists(self, client_id):
        return Message.objects.filter(client_id=client_id).exists()

    @database_sync_to_async
    def get_message_by_client_id(self, client_id):
        return Message.objects.filter(client_id=client_id).only('id', 'status').first()

    @database_sync_to_async
    def create_message(self, client_id, content):
        return Message.objects.create(
            client_id=client_id,
            sender=self.user, 
            receiver=self.other_user_in_room, 
            encrypted_content=content,
            status='sent'
        )
    
    @database_sync_to_async
    def mark_message_delivered(self, msg):
        msg.status = 'delivered'
        msg.save(update_fields=['status'])

    @database_sync_to_async
    def delete_message(self, msg_instance):
        msg_instance.delete()

    @sync_to_async
    def update_user_status(self, is_online):
        key = f"user_online_{self.user.id}"
        if is_online:
            cache.set(key, True, timeout=65) 
        else:
            cache.delete(key)
            User.objects.filter(id=self.user.id).update(last_seen=timezone.now())

    @database_sync_to_async
    def update_messages_to_read(self, sender_username):
        try:
            sender = User.objects.get(username=sender_username)
            return Message.objects.filter(
                sender=sender, 
                receiver=self.user, 
                status__in=['sent', 'delivered']
            ).update(status='read')
        except User.DoesNotExist:
            return 0

    async def broadcast_status_to_watchers(self, is_online):
        await self.channel_layer.group_send(
            self.my_status_monitor_group, 
            {
                "type": "user_status_event",
                "username": self.user.username,
                "is_online": is_online,
                "last_seen": timezone.now().isoformat()
            }
        )

    async def send_ack(self, client_id, server_id, status):
        await self.send(text_data=json.dumps({
            "type": "status_update",
            "client_id": str(client_id),
            "id": server_id,
            "status": status
        }))

    async def send_push_notification(self, receiver):
        # This is SLOW (external API). Always run in background.
        try:
            from apps.accounts.models import PushToken
            from apps.accounts.push_utils import send_push_notification
            
            tokens = await database_sync_to_async(list)(
                PushToken.objects.filter(user=receiver).values_list('token', flat=True)
            )
            if tokens:
                await database_sync_to_async(send_push_notification)(
                    tokens,
                    f"New message from {self.user.username}",
                    "You have a new encrypted message",
                    {"type": "chat", "sender": self.user.username}
                )
        except Exception as e:
            print(f"Push Notification Error: {e}")














# # CHAT CONSUMER (Handles Text, Images, Typing, Read Receipts)
# class ChatConsumer(AsyncWebsocketConsumer):
#     async def connect(self):
#         self.user = self.scope["user"]

#         if not self.user.is_authenticated:
#             await self.close()
#             return

#         self.other_username = self.scope["url_route"]["kwargs"]["username"]


#         try:
#             self.other_user = await sync_to_async(User.objects.get)(username=self.other_username)
#         except ObjectDoesNotExist:
#             await self.close()
#             return

#         user_ids = sorted([str(self.user.id), str(self.other_user.id)])
#         self.room_name = f"chat_{user_ids[0]}_{user_ids[1]}"
#         self.room_group_name = self.room_name

#         await self.channel_layer.group_add(self.room_group_name, self.channel_name)
#         await self.accept()

#     async def disconnect(self, close_code):
#         if hasattr(self, "room_group_name"):
#             await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

#     async def receive(self, text_data):
#         data = json.loads(text_data)

#         # TYPING INDICATOR
#         if data.get("typing"):
#             await self.channel_layer.group_send(
#                 self.room_group_name,
#                 {
#                     "type": "typing",
#                     "user": self.user.username,
#                 }
#             )
#             return
#         if data.get("command") == "read_receipt":
#             await self.channel_layer.group_send(
#                 self.room_group_name,
#                 {
#                     "type": "message_read",
#                     "message_id": data.get("message_id"),
#                     "reader": self.user.username,
#                 }
#             )
#             return
        


#         #  CHAT MESSAGE
#         message = data.get("message")
#         if not message:
#             return

#         msg_instance = await sync_to_async(Message.objects.create)(
#             sender=self.user, receiver=self.other_user, content=message
#         )

#         # Send to Chat Room (Updates chat box)
#         await self.channel_layer.group_send(
#             self.room_group_name,
#             {
#                 "type": "chat_message",
#                 "message": message,
#                 "sender": self.user.username,
#                 "id": msg_instance.id,
#                 "timestamp": timezone.localtime(msg_instance.timestamp).strftime("%I:%M %p"),
#             }
#         )

#         # end Notification to Receiver's Global Group (Updates Badges/Toasts)
#         await self.channel_layer.group_send(
#             f"user_{self.other_user.id}",
#             {
#                 "type": "new_message_notification", 
#                 "message": message,
#                 "sender": self.user.username,
#             }
#         )

#     # Handlers 
#     async def chat_message(self, event):
#         await self.send(text_data=json.dumps(event))
#     async def typing(self, event):
#         await self.send(text_data=json.dumps(event))
#     async def message_read(self, event):
#         await self.send(text_data=json.dumps(event))



# # ONLINE STATUS CONSUMER (Handles Online/Offline, Global Notifications, WebRTC)

# class OnlineStatusConsumer(AsyncWebsocketConsumer):
#     async def connect(self):
#         self.user = self.scope["user"]
#         if self.user.is_authenticated:
#             # 1. Join Personal Group (for notifications)
#             self.group_name = f"user_{self.user.id}"
#             await self.channel_layer.group_add(self.group_name, self.channel_name)

#             # 2. Join Global Status Group (To receive other people's online updates)
#             await self.channel_layer.group_add("status_updates", self.channel_name)

#             await self.accept()
            
#             #  Update Status (Cache + DB last_seen)
#             await self.update_user_status(True)
#             await self.broadcast_status(True)
#         else:
#             await self.close()

#     async def disconnect(self, close_code):
#         if self.user.is_authenticated:
#             # Leave groups
#             await self.channel_layer.group_discard(self.group_name, self.channel_name)
#             await self.channel_layer.group_discard("status_updates", self.channel_name)
            
#             #  Set Offline
#             await self.update_user_status(False)
#             await self.broadcast_status(False)

#     async def receive(self, text_data):
#         try:
#             data = json.loads(text_data)
#             command = data.get("command")

#             if command == "call_signal":
#                 target_username = data.get("target")
#                 signal_data = data.get("data")

#                 # Find Target User
#                 try:
#                     target_user = await sync_to_async(User.objects.get)(username__iexact=target_username)
                    
#                     # Forward Signal to Target's Personal Group
#                     await self.channel_layer.group_send(
#                         f"user_{target_user.id}",
#                         {
#                             "type": "webrtc_signal_message",
#                             "data": signal_data,
#                             "sender": self.user.username
#                         }
#                     )
#                 except User.DoesNotExist:
#                     print(f"❌ Target '{target_username}' not found")
#         except Exception as e:
#             print(f"❌ Error: {e}")

#     async def broadcast_status(self, is_online):
#         timestamp = timezone.localtime(timezone.now()).strftime("%I:%M %p") # e.g. "03:45 PM"
#         await self.channel_layer.group_send(
#             "status_updates",
#             {
#                 "type": "user_status_event",
#                 "username": self.user.username,
#                 "is_online": is_online,
#                 "last_seen": timestamp
#             }
#         )

#     async def user_status_event(self, event):
#         await self.send(text_data=json.dumps({
#             "type": "user_status",
#             "username": event["username"],
#             "is_online": event["is_online"],
#             "last_seen": event["last_seen"]
#         }))

#     async def webrtc_signal_message(self, event):
#         # Forward the WebRTC signal to the frontend
#         await self.send(text_data=json.dumps({
#             "type": "call_signal", 
#             "data": event["data"],
#             "sender": event["sender"]
#         }))

#     async def new_message_notification(self, event):
#         # Forward the text notification to the frontend
#         await self.send(text_data=json.dumps({
#             "type": "notification",
#             "message": event["message"],
#             "sender": event["sender"],
#         }))

#     @sync_to_async
#     def update_user_status(self, is_online):
#         user_id = self.user.id
#         online_key = f"user_online_{user_id}"
#         last_seen_key = f"last_seen_updated_{user_id}"
        
#         if is_online:
#             # This saves DB writes.
#             cache.set(online_key, True, timeout=3600)
            
#             if not cache.get(last_seen_key):
#                 User.objects.filter(id=user_id).update(last_seen=timezone.now())
#                 cache.set(last_seen_key, True, timeout=500)
#         else:
#             # B. Remove "Online" status from RAM
#             cache.delete(f'user_online_{user_id}')
            
#             # C. Update "last_seen" in DB so we know when they left
#             User.objects.filter(id=user_id).update(last_seen=timezone.now())



