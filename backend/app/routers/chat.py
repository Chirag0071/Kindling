from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.database import get_db, SessionLocal, acquire_db_session
from app.config import settings
from app import models, schemas, auth, utils
from app.services.websocket_manager import manager
from app.services.storage import get_storage_backend

router = APIRouter(prefix="/chat", tags=["chat"])

ALLOWED_CHAT_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_CHAT_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024
MAX_CHAT_VIDEO_BYTES = 30 * 1024 * 1024
CALL_SIGNAL_TYPES = {"call-offer", "call-answer", "call-ice-candidate", "call-decline"}


def _is_valid_media_url(url: str) -> bool:
    """
    Reject arbitrary external URLs in chat messages. Without this, a client
    could pass any string as media_url and get it rendered as an <img>/<video>
    src for the other person - only allow URLs pointing at media we actually
    stored ourselves.

    NOTE: photo/video attachments are NOT end-to-end encrypted (unlike text
    content below) - they're stored as normal Cloudinary/S3 files, readable
    by anyone with the URL, same as before. Encrypting media would mean
    Cloudinary can no longer transform/optimize/CDN-serve it, which is a
    separate, larger piece of work than text E2E.
    """
    if url.startswith("/media/"):
        return True  # local storage, served by our own API
    if settings.cloudinary_cloud_name and url.startswith(
        f"https://res.cloudinary.com/{settings.cloudinary_cloud_name}/"
    ):
        return True
    if settings.s3_public_base_url and url.startswith(settings.s3_public_base_url.rstrip("/") + "/"):
        return True
    if not settings.s3_endpoint_url and settings.s3_bucket_name:
        aws_prefix = f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/"
        if url.startswith(aws_prefix):
            return True
    return False


def _format_call_summary(duration_seconds) -> str:
    if not duration_seconds or duration_seconds < 1:
        return "\U0001F4DE Video call"
    minutes, seconds = divmod(int(duration_seconds), 60)
    if minutes:
        return f"\U0001F4DE Video call \u00b7 {minutes}:{seconds:02d}"
    return f"\U0001F4DE Video call \u00b7 {seconds}s"


def _get_match_for_participant(
    db: Session, match_id: str, user_id: str, require_active: bool = True
) -> Optional[models.Match]:
    if not utils.is_valid_uuid(match_id):
        return None

    match = db.query(models.Match).filter(models.Match.id == match_id).first()
    if not match:
        return None
    if require_active and not match.is_active:
        return None
    if user_id not in (match.user1_id, match.user2_id):
        return None

    other_id = match.user2_id if match.user1_id == user_id else match.user1_id
    blocked = db.query(models.Block).filter(
        or_(
            and_(models.Block.blocker_id == user_id, models.Block.blocked_id == other_id),
            and_(models.Block.blocker_id == other_id, models.Block.blocked_id == user_id),
        )
    ).first()
    if blocked:
        return None

    return match


def _message_to_out(message: models.Message, match: models.Match) -> schemas.MessageOut:
    return schemas.MessageOut(
        id=message.id,
        match_id=message.match_id,
        sender_id=message.sender_id,
        content=message.content,
        media_url=message.media_url,
        sent_at=message.sent_at,
        read_at=message.read_at,
        is_encrypted=message.is_encrypted,
        iv=message.iv,
        user1_id=match.user1_id,
        user2_id=match.user2_id,
        encrypted_key_user1=message.encrypted_key_user1,
        encrypted_key_user2=message.encrypted_key_user2,
    )


@router.get("/{match_id}/info", response_model=schemas.ChatInfoOut)
def get_chat_info(
    match_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id, require_active=False)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    other_id = match.user2_id if match.user1_id == current_user.id else match.user1_id
    other_profile = db.query(models.Profile).filter(models.Profile.user_id == other_id).first()
    other_user = db.query(models.User).filter(models.User.id == other_id).first()
    primary_photo = (
        db.query(models.Photo)
        .filter(models.Photo.user_id == other_id, models.Photo.is_primary.is_(True))
        .first()
    )
    return schemas.ChatInfoOut(
        match_id=match_id,
        is_active=match.is_active,
        other_user_id=other_id,
        other_first_name=other_profile.first_name if other_profile else "Someone",
        other_photo_url=primary_photo.url if primary_photo else None,
        other_public_key=other_user.public_key if other_user else None,
        user1_id=match.user1_id,
        user2_id=match.user2_id,
    )


@router.get("/{match_id}/messages", response_model=List[schemas.MessageOut])
def get_messages(
    match_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id, require_active=False)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    messages = (
        db.query(models.Message)
        .filter(models.Message.match_id == match_id)
        .order_by(models.Message.sent_at.asc())
        .all()
    )
    return [_message_to_out(m, match) for m in messages]


@router.post("/{match_id}/read")
def mark_read(
    match_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not _get_match_for_participant(db, match_id, current_user.id, require_active=False):
        raise HTTPException(status_code=404, detail="Match not found")

    unread = (
        db.query(models.Message)
        .filter(
            models.Message.match_id == match_id,
            models.Message.sender_id != current_user.id,
            models.Message.read_at.is_(None),
        )
        .all()
    )
    now = datetime.utcnow()
    for m in unread:
        m.read_at = now
    db.commit()
    return {"marked_read": len(unread)}


CLOSURE_MESSAGES = {
    "not_feeling_it": "Hey, I've enjoyed chatting but don't think we're a match — wishing you the best!",
    "met_someone_else": "Hi! I've decided to focus on a connection I've made — thanks for the chats, take care!",
    "distance": "Hey, I think the distance is going to make this tough for me right now — best of luck!",
    "timing_not_right": "Hi, my timing for dating isn't quite right at the moment — thank you for chatting, take care!",
    "no_longer_using_app": "Hey, I'm stepping back from the app for now — it was nice chatting, take care!",
}
GENERIC_CLOSURE = "Hey, I don't think this is going to work out on my end — wishing you the best!"


@router.get("/{match_id}/status", response_model=schemas.MatchStatusOut)
def get_match_status(
    match_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not _get_match_for_participant(db, match_id, current_user.id, require_active=False):
        raise HTTPException(status_code=404, detail="Match not found")

    last_message = (
        db.query(models.Message)
        .filter(models.Message.match_id == match_id)
        .order_by(models.Message.sent_at.desc())
        .first()
    )

    if not last_message:
        return schemas.MatchStatusOut(
            match_id=match_id,
            last_message_at=None,
            last_message_sender_id=None,
            hours_since_last_message=None,
            needs_response=False,
            is_stale=False,
        )

    hours = (datetime.utcnow() - last_message.sent_at).total_seconds() / 3600
    needs_response = last_message.sender_id != current_user.id
    is_stale = needs_response and hours >= 72

    return schemas.MatchStatusOut(
        match_id=match_id,
        last_message_at=last_message.sent_at,
        last_message_sender_id=last_message.sender_id,
        hours_since_last_message=round(hours, 1),
        needs_response=needs_response,
        is_stale=is_stale,
    )


@router.post("/{match_id}/close", response_model=schemas.MatchCloseResult)
def close_match(
    match_id: str,
    payload: schemas.MatchCloseRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    match.is_active = False
    match.closed_by = current_user.id
    match.closed_reason = payload.reason
    match.closed_at = datetime.utcnow()

    if payload.reason == "other" and payload.note and payload.note.strip():
        content = payload.note.strip()
    else:
        content = CLOSURE_MESSAGES.get(payload.reason, GENERIC_CLOSURE)

    closure_message = models.Message(match_id=match_id, sender_id=current_user.id, content=content)
    db.add(closure_message)
    db.commit()
    db.refresh(closure_message)

    return schemas.MatchCloseResult(status="closed", closure_message_id=closure_message.id)


@router.post("/{match_id}/media")
async def upload_chat_media(
    match_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    match = _get_match_for_participant(db, match_id, current_user.id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    is_video = file.content_type in ALLOWED_CHAT_VIDEO_TYPES
    is_image = file.content_type in ALLOWED_CHAT_IMAGE_TYPES
    if not (is_image or is_video):
        raise HTTPException(status_code=400, detail="Only JPEG/PNG/WEBP images or MP4/WEBM/MOV videos are allowed")

    max_bytes = MAX_CHAT_VIDEO_BYTES if is_video else MAX_CHAT_IMAGE_BYTES
    file_bytes = await utils.read_upload_with_limit(file, max_bytes)
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    storage = get_storage_backend()
    url = storage.upload(file_bytes, file.filename or "media", file.content_type, folder="chat")
    return {"url": url, "media_type": "video" if is_video else "image"}


@router.websocket("/ws/{match_id}")
async def chat_ws(
    websocket: WebSocket,
    match_id: str,
    token: str = Query(...),
):
    try:
        user_id = auth.decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return

    with acquire_db_session() as db:
        match = _get_match_for_participant(db, match_id, user_id)
        match_user1_id, match_user2_id = (match.user1_id, match.user2_id) if match else (None, None)
    if not match:
        await websocket.close(code=4404)
        return

    await manager.connect(match_id, user_id, websocket)
    try:
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                try:
                    await websocket.send_json({"type": "error", "detail": "Malformed message"})
                except Exception:
                    pass
                continue

            if not isinstance(data, dict):
                try:
                    await websocket.send_json({"type": "error", "detail": "Message must be a JSON object"})
                except Exception:
                    pass
                continue

            msg_type = data.get("type", "chat")

            if msg_type == "chat":
                content = data.get("content")
                media_url = data.get("media_url")
                if not content and not media_url:
                    continue
                if media_url and not _is_valid_media_url(media_url):
                    await websocket.send_json({"type": "error", "detail": "Invalid media URL"})
                    continue

                # E2E fields - only meaningful for text content, not media. A
                # client that hasn't generated/uploaded a keypair yet (or is
                # talking to a match whose other side hasn't) just omits
                # these and the message stores/shows as plain text, same as
                # before E2E existed - it degrades gracefully instead of
                # failing to send.
                is_encrypted = bool(data.get("is_encrypted") and media_url is None)
                iv = data.get("iv") if is_encrypted else None
                encrypted_key_user1 = data.get("encrypted_key_user1") if is_encrypted else None
                encrypted_key_user2 = data.get("encrypted_key_user2") if is_encrypted else None
                if is_encrypted and not (iv and encrypted_key_user1 and encrypted_key_user2):
                    await websocket.send_json({"type": "error", "detail": "Incomplete encrypted message"})
                    continue

                with acquire_db_session() as db:
                    message = models.Message(
                        match_id=match_id,
                        sender_id=user_id,
                        content=content,
                        media_url=media_url,
                        is_encrypted=is_encrypted,
                        iv=iv,
                        encrypted_key_user1=encrypted_key_user1,
                        encrypted_key_user2=encrypted_key_user2,
                    )
                    db.add(message)
                    db.commit()
                    db.refresh(message)
                    message_id, sent_at = message.id, message.sent_at

                await manager.send_to_match(match_id, {
                    "type": "chat",
                    "id": message_id,
                    "match_id": match_id,
                    "sender_id": user_id,
                    "content": content,
                    "media_url": media_url,
                    "sent_at": sent_at.isoformat(),
                    "is_encrypted": is_encrypted,
                    "iv": iv,
                    "user1_id": match_user1_id,
                    "user2_id": match_user2_id,
                    "encrypted_key_user1": encrypted_key_user1,
                    "encrypted_key_user2": encrypted_key_user2,
                })

            elif msg_type in CALL_SIGNAL_TYPES:
                await manager.send_to_match(match_id, {
                    "type": msg_type,
                    "from_user_id": user_id,
                    "payload": data.get("payload"),
                }, exclude_user_id=user_id)

            elif msg_type == "call-end":
                duration = (data.get("payload") or {}).get("duration_seconds")
                with acquire_db_session() as db:
                    message = models.Message(
                        match_id=match_id,
                        sender_id=user_id,
                        content=_format_call_summary(duration),
                    )
                    db.add(message)
                    db.commit()
                    db.refresh(message)
                    message_id, content, sent_at = message.id, message.content, message.sent_at

                await manager.send_to_match(match_id, {
                    "type": "call-end",
                    "from_user_id": user_id,
                    "message": {
                        "id": message_id,
                        "match_id": match_id,
                        "sender_id": user_id,
                        "content": content,
                        "media_url": None,
                        "sent_at": sent_at.isoformat(),
                        "is_encrypted": False,
                        "iv": None,
                        "user1_id": match_user1_id,
                        "user2_id": match_user2_id,
                        "encrypted_key_user1": None,
                        "encrypted_key_user2": None,
                    },
                })

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(match_id, user_id)
        try:
            await manager.send_to_match(match_id, {"type": "call-peer-disconnected", "from_user_id": user_id})
        except Exception:
            pass