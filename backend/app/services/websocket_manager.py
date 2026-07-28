from typing import Dict
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Tracks active WebSocket connections per match ("room").

    NOTE: This is in-memory, which is fine for a single-process deployment.
    If you scale to multiple backend instances, replace this with a
    pub/sub layer (e.g. Redis pub/sub) so messages fan out across processes.
    """

    def __init__(self):
        self.active: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, match_id: str, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active.setdefault(match_id, {})[user_id] = websocket

    def disconnect(self, match_id: str, user_id: str):
        room = self.active.get(match_id)
        if not room:
            return
        room.pop(user_id, None)
        if not room:
            self.active.pop(match_id, None)

    async def send_to_match(self, match_id: str, payload: dict, exclude_user_id: str = None):
        room = self.active.get(match_id, {})
        for uid, ws in list(room.items()):
            if uid == exclude_user_id:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                # A single dead/closing connection must never crash the
                # sender's own request or block delivery to everyone else in
                # the room. This was a real bug: one bad message from either
                # participant could take down BOTH connections, because a
                # failed send here used to propagate straight up into
                # whichever handler called send_to_match.
                logger.warning("Failed to send to user %s in match %s, dropping stale connection", uid, match_id)
                self.disconnect(match_id, uid)

    def online_user_ids(self, match_id: str):
        return set(self.active.get(match_id, {}).keys())


manager = ConnectionManager()
