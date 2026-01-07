# backend/apps/calls/consumers.py

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async
from django.core.exceptions import ObjectDoesNotExist

User = get_user_model()

class CallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]

        if not self.user.is_authenticated:
            await self.close()
            return

        #  Get the 'username' from the URL (instead of call_id)
        self.other_username = self.scope["url_route"]["kwargs"]["username"]

        #  Find the other user in the DB to get their ID
        try:
            self.other_user = await sync_to_async(User.objects.get)(
                username=self.other_username
            )
        except ObjectDoesNotExist:
            await self.close()
            return

        #  Create a unique Room Name using sorted User IDs
        # This ensures "User A calling User B" and "User B calling User A" land in the same room.
        user_ids = sorted([str(self.user.id), str(self.other_user.id)])
        
        # Room name: "call_1_2" (Safe!)
        self.room_group_name = f"call_{user_ids[0]}_{user_ids[1]}"

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )

        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name,
            )

    async def receive(self, text_data):
        # Relay WebRTC signals (same as before)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "signal",
                "data": json.loads(text_data),
                "sender_channel_name": self.channel_name,
            },
        )

    async def signal(self, event):
        if self.channel_name != event.get("sender_channel_name"):
            await self.send(text_data=json.dumps(event["data"]))