import json
from channels.generic.websocket import AsyncWebsocketConsumer

class CallConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.call_id = self.scope["url_route"]["kwargs"]["call_id"]
        self.group_name = f"call_{self.call_id}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name,
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.group_name,
            self.channel_name,
        )

    async def receive(self, text_data):
        # Relay WebRTC signals (SDP, ICE candidates) to the other peer
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "signal",
                "data": json.loads(text_data),
                "sender_channel_name": self.channel_name, # Track who sent it
            },
        )

    async def signal(self, event):
        # Prevent echoing the message back to the sender
        if self.channel_name != event.get("sender_channel_name"):
            await self.send(text_data=json.dumps(event["data"]))