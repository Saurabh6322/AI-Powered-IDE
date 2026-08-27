"""
Collaboration WebSocket relay (broadcaster).

Implements a lightweight room-based WebSocket broadcaster for Yjs.
Clients connect to a room, and any binary message received from one
client is immediately relayed to all other clients in the same room.

The server is intentionally "dumb" — it does not interpret the Yjs
protocol messages.  All CRDT state is held on the clients.
"""

import asyncio
import logging
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/api/collab", tags=["collaboration"])
logger = logging.getLogger(__name__)

# Room name → set of connected WebSockets
rooms: dict[str, set[WebSocket]] = defaultdict(set)


@router.websocket("/ws/{room_id}")
async def collab_websocket(websocket: WebSocket, room_id: str):
    await websocket.accept()
    rooms[room_id].add(websocket)
    logger.info(f"[Collab] Client joined room '{room_id}' (total: {len(rooms[room_id])})")

    try:
        while True:
            # Yjs sends binary sync messages
            data = await websocket.receive_bytes()

            # Broadcast to all other clients in the same room
            peers = rooms[room_id] - {websocket}
            if peers:
                await asyncio.gather(
                    *(peer.send_bytes(data) for peer in peers),
                    return_exceptions=True,
                )
    except WebSocketDisconnect:
        logger.info(f"[Collab] Client left room '{room_id}'")
    except Exception as e:
        logger.error(f"[Collab] Error in room '{room_id}': {e}")
    finally:
        rooms[room_id].discard(websocket)
        # Clean up empty rooms
        if not rooms[room_id]:
            del rooms[room_id]
