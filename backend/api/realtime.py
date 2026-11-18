import json
from typing import Any, Optional
from asgiref.sync import async_to_sync
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.layers import get_channel_layer
from api.auth_utils import now_iso

BROADCAST_GROUP = "galli_realtime_broadcast"


class BroadcastConsumer(AsyncWebsocketConsumer):
    async def connect(self) -> None:
        await self.channel_layer.group_add(BROADCAST_GROUP, self.channel_name)
        await self.accept()
        await self.send(
            text_data=json.dumps(
                {
                    "type": "connected",
                    "timestamp": now_iso(),
                }
            )
        )

    async def disconnect(self, close_code: int) -> None:
        await self.channel_layer.group_discard(BROADCAST_GROUP, self.channel_name)

    async def realtime_event(self, event: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps(event["payload"]))


class RealtimeHub:
    def emit(
        self,
        event_type: str,
        store_id: Optional[str] = None,
        store_slug: Optional[str] = None,
        recipient_id: Optional[str] = None,
        entity_id: Optional[str] = None,
    ) -> None:
        layer = get_channel_layer()
        if layer is None:
            return
        payload: dict[str, Any] = {
            "type": event_type,
            "timestamp": now_iso(),
        }
        if store_id is not None:
            payload["storeId"] = store_id
        if store_slug is not None:
            payload["storeSlug"] = store_slug
        if recipient_id is not None:
            payload["recipientId"] = recipient_id
        if entity_id is not None:
            payload["entityId"] = entity_id

        try:
            async_to_sync(layer.group_send)(
                BROADCAST_GROUP,
                {
                    "type": "realtime.event",
                    "payload": payload,
                },
            )
        except Exception:
            # Never break HTTP writes if channel layer is unavailable in management commands
            pass


realtime_hub = RealtimeHub()
