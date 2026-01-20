import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.exceptions import ValidationError, ObjectDoesNotExist
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from django.utils import timezone
from django.core.cache import cache
import asyncio
import uuid

from .models import Message

User = get_user_model()

# UNIFIED CONSUMER (Handles Chat, Notifications, Status, Calls)

class UnifiedConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        # 1. Personal Group (Notifications)
        self.personal_group = f"user_{self.user.id}"

        print(f"🔌 [CONNECT] User: {self.user.username} (ID: {self.user.id})")
        print(f"👂 [LISTENING] Listening on Group: {self.personal_group}")


        await self.channel_layer.group_add(self.personal_group, self.channel_name)

        # 2. Status Monitor (Broadcasting MY status)
        self.my_status_monitor_group = f"status_monitor_{self.user.id}"
        
        self.current_room = None
        self.watched_user_group = None 
        self.other_user_in_room = None

        await self.accept()
        
        await self.update_user_status(True)
        await self.broadcast_status_to_watchers(True)

    async def disconnect(self, close_code):
        if self.user.is_authenticated:
            await self.channel_layer.group_discard(self.personal_group, self.channel_name)
            
            if self.current_room:
                await self.channel_layer.group_discard(self.current_room, self.channel_name)
                # Cleanup presence
                await sync_to_async(cache.delete)(f"presence_room_{self.user.id}")

            if self.watched_user_group:
                await self.channel_layer.group_discard(self.watched_user_group, self.channel_name)

            #  Let TTL expire naturally to prevent "flickering" offline during reconnects user_status
            pass 

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            command = data.get("command")

            if command == "ping":
                # Keep session alive
                await self.update_user_status(True)

            elif command == "join_room":
                await self.handle_join_room(data.get("recipient_id"))

            elif command == "leave_room":
                await self.handle_leave_room()

            elif command == "send_message":
                await self.handle_send_message(data)

            elif command == "mark_read":
                await self.handle_mark_read(data)

            elif command == "typing":
                await self.handle_typing()

            elif command == "call_signal":
                await self.handle_call_signal(data)

        except Exception as e:
            print(f"WS Error: {e}")

    # ===============================================================
    #  LOGIC HANDLERS
    # ===============================================================

    async def handle_join_room(self, target_id):
        try:
            if not target_id: return

            other_user = await self.get_user_by_id(target_id)
            self.other_user_in_room = other_user
            
            user_ids = sorted([str(self.user.id), str(other_user.id)])
            new_room = f"chat_{user_ids[0]}_{user_ids[1]}"

            if self.current_room and self.current_room != new_room:
                await self.handle_leave_room()

            self.current_room = new_room
            await self.channel_layer.group_add(self.current_room, self.channel_name)
            
            # ✅ Set Presence (Infinite Timeout while connected)
            await sync_to_async(cache.set)(f"presence_room_{self.user.id}", self.current_room, timeout=None)

            self.watched_user_group = f"status_monitor_{other_user.id}"
            await self.channel_layer.group_add(self.watched_user_group, self.channel_name)

            # Broadcast I am Online
            # await self.update_user_status(True)
            # await self.broadcast_status_to_watchers(True)

            # Check THEIR status
            is_online = await sync_to_async(cache.get)(f"user_online_{other_user.id}")
            
            await self.send(text_data=json.dumps({
                "type": "user_status_event",
                "username": other_user.username,
                "user_id": str(other_user.id),
                "is_online": bool(is_online),
                "last_seen": timezone.now().isoformat()
            }))
            
        except (ObjectDoesNotExist, ValueError):
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

    async def handle_typing(self):
        # Throttle typing events (1 per second) to reduce spam
        typing_key = f"typing_{self.user.id}"
        if await sync_to_async(cache.get)(typing_key):
            return
        await sync_to_async(cache.set)(typing_key, True, 1)

        await self.update_user_status(True)
        
        payload = {"type": "typing_event", "sender": self.user.username, "sender_id": str(self.user.id)}

        if self.current_room:
            await self.channel_layer.group_send(self.current_room, payload)
        elif self.other_user_in_room:
            # Fallback to personal group if room logic fails
            await self.channel_layer.group_send(f"user_{self.other_user_in_room.id}", payload)

    async def handle_send_message(self, data):
        client_id = data.get("client_id")
        ciphertext = data.get("ciphertext")
        recipient_id = data.get("recipient_id")

        if not client_id or not ciphertext: return

        # 1. Resolve Receiver
        target_user = self.other_user_in_room
        if not target_user and recipient_id:
            try:
                target_user = await self.get_user_by_id(recipient_id)
            except ObjectDoesNotExist:
                return

        if not target_user: return

        # Update my status
        await self.update_user_status(True)

        # 2. Idempotency
        if await self.message_exists(client_id):
            existing_msg = await self.get_message_by_client_id(client_id)
            if existing_msg:
                await self.send_ack(client_id, existing_msg.id, existing_msg.status)
            return

        # 3. Save DB
        msg_instance = await self.create_message(client_id, ciphertext, target_user)
        
        payload = {
            "type": "chat_message",
            "ciphertext": ciphertext,
            "sender": self.user.username,
            "sender_id": str(self.user.id),
            "id": str(msg_instance.id),
            "client_id": str(msg_instance.client_id),
            "timestamp": msg_instance.timestamp.isoformat(),
        }

        # 4. Routing Logic
        presence = await sync_to_async(cache.get)(f"presence_room_{target_user.id}")
        
        user_ids = sorted([str(self.user.id), str(target_user.id)])
        target_room = f"chat_{user_ids[0]}_{user_ids[1]}"


        if presence == target_room:
            # A. Target is IN THE ROOM -> Deliver Immediately
            await self.channel_layer.group_send(target_room, payload)
            await self.mark_message_delivered(msg_instance)
            await self.send_ack(client_id, msg_instance.id, "delivered")
        else:
            # B. Target is ELSEWHERE -> Send to Personal Group + Push
            await self.send_ack(client_id, msg_instance.id, "sent")
            
            # Send to socket (in case they are online but in a different screen)
            await self.channel_layer.group_send(f"user_{target_user.id}", payload)
            
            # Trigger Notification Logic
            asyncio.create_task(self.handle_notifications(target_user, msg_instance))

    async def handle_notifications(self, receiver, msg_instance):
        """
        Sends notifications. 
        CRITICAL FIX: Always try PUSH if not in room.
        """
        # 1. Send Socket Toast (Only works if socket is open)
        await self.channel_layer.group_send(
            f"user_{receiver.id}",
            {"type": "new_message_notification", "sender": self.user.username}
        )

        # 2. Send PUSH Notification (Reliability Layer)
        # Even if they are "Online" in cache, their socket might be dead (backgrounded).
        # We send the push; the phone OS will handle deduplication if the app is open.
        await self.send_push_notification(receiver)

    async def handle_call_signal(self, data):
        target_input = data.get("target") 
        print(f"📞 [SIGNAL START] From {self.user.username} -> Target Input: {target_input}")

        target_user = None

        # 1. CHECK IF INPUT IS A VALID UUID
        is_uuid = False
        try:
            uuid_obj = uuid.UUID(str(target_input))
            is_uuid = True
        except ValueError:
            is_uuid = False

        # 2. IF UUID, TRY ID LOOKUP
        if is_uuid:
            try:
                target_user = await self.get_user_by_id(target_input)
            except ObjectDoesNotExist:
                # UUID valid, but user not found. Fallback unlikely but safe.
                pass

        # 3. IF NOT UUID (OR ID FAILED), TRY USERNAME LOOKUP
        if not target_user:
            try:
                target_user = await self.get_user_optimized(target_input)
            except ObjectDoesNotExist:
                pass

        # 4. PROCESS RESULT
        if target_user:
            target_group = f"user_{target_user.id}"
            print(f"🎯 [SIGNAL RESOLVED] Target User: {target_user.username} (ID: {target_user.id})")
            
            await self.channel_layer.group_send(
                target_group,
                {
                    "type": "webrtc_signal_message", 
                    "data": data.get("data"), 
                    "sender": self.user.username
                }
            )
        else:
            print(f"❌ [SIGNAL FAILED] Target user '{target_input}' not found.")

    async def handle_mark_read(self, data):
        sender_username = data.get('sender') 
        if not sender_username: return
        count = await self.update_messages_to_read(sender_username)
        if count > 0:
            try:
                sender_user = await self.get_user_optimized(sender_username)
                await self.channel_layer.group_send(
                    f"user_{sender_user.id}", 
                    {
                        'type': 'status_update',
                        'status': 'read',
                        'reader': self.user.username,
                        'conversation_id': self.user.username 
                    }
                )
            except ObjectDoesNotExist:
                pass

    # ... (EVENT SENDERS remain the same: chat_message, status_update, etc) ...
    async def chat_message(self, event):
        if str(event.get("sender_id")) == str(self.user.id): return
        await self.send(text_data=json.dumps(event))

    async def status_update(self, event): await self.send(text_data=json.dumps(event))
    async def typing_event(self, event): 
        if event["sender"] != self.user.username: await self.send(text_data=json.dumps(event))
    async def user_status_event(self, event): await self.send(text_data=json.dumps(event))
    async def new_message_notification(self, event): await self.send(text_data=json.dumps(event))

    async def webrtc_signal_message(self, event):
        print(f"✅ [SIGNAL DELIVERED] Reached Consumer for User: {self.user.username}")
        await self.send(text_data=json.dumps(event))

    # ===============================================================
    # 🛠 UTILITIES
    # ===============================================================
    @database_sync_to_async
    def get_user_optimized(self, username):
        return User.objects.only('id', 'username').get(username=username)

    @database_sync_to_async
    def get_user_by_id(self, user_id):
        return User.objects.only('id', 'username').get(id=user_id)

    @database_sync_to_async
    def message_exists(self, client_id):
        return Message.objects.filter(client_id=client_id).exists()

    @database_sync_to_async
    def get_message_by_client_id(self, client_id):
        return Message.objects.filter(client_id=client_id).only('id', 'status').first()

    @database_sync_to_async
    def create_message(self, client_id, content, receiver):
        return Message.objects.create(
            client_id=client_id,
            sender=self.user, 
            receiver=receiver, 
            encrypted_content=content,
            status='sent'
        )
    
    @database_sync_to_async
    def mark_message_delivered(self, msg):
        msg.status = 'delivered'
        msg.save(update_fields=['status'])

    @sync_to_async
    def update_user_status(self, is_online):
        key = f"user_online_{self.user.id}"
        if is_online:
            # ✅ FIX: 65s timeout to handle 30s ping interval + network lag
            cache.set(key, True, timeout=35) 
        else:
            # Let it expire naturally to prevent flapping
            User.objects.filter(id=self.user.id).update(last_seen=timezone.now())

    @database_sync_to_async
    def update_messages_to_read(self, sender_username):
        try:
            sender = User.objects.get(username=sender_username)
            return Message.objects.filter(sender=sender, receiver=self.user, status__in=['sent', 'delivered']).update(status='read')
        except User.DoesNotExist: return 0

    async def broadcast_status_to_watchers(self, is_online):
        await self.channel_layer.group_send(
            self.my_status_monitor_group, 
            {
                "type": "user_status_event",
                "username": self.user.username,
                "user_id": str(self.user.id),
                "is_online": is_online,
                "last_seen": timezone.now().isoformat()
            }
        )

    async def send_ack(self, client_id, server_id, status):
        await self.send(text_data=json.dumps({
            "type": "status_update",
            "client_id": str(client_id),
            "id": str(server_id),
            "status": status
        }))

    async def send_push_notification(self, receiver):
        try:
            # Ensure correct import inside async context
            from apps.accounts.push_utils import send_push_notification
            await database_sync_to_async(send_push_notification)(
                receiver,
                f"New message from {self.user.username}",
                "Tap to reply",                            
                {"type": "chat", "sender": self.user.username, "url": f"/chat/{self.user.username}"}
            )
        except Exception as e:
            print(f"Push Notification Logic Error: {e}")













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



