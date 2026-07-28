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
    """
    if url.startswith("/media/"):
        return True  # local storage, served by our own API
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

    # Blocking is a harder cutoff than closing: a block always hides the
    # match, even if the caller only needs read access (e.g. history).
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
    )


@router.get("/{match_id}/messages", response_model=List[schemas.MessageOut])
def get_messages(
    match_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # require_active=False: a closed match's history (including the closure
    # message) should still be readable — that's the whole point of giving
    # people closure instead of a silent vanish.
    if not _get_match_for_participant(db, match_id, current_user.id, require_active=False):
        raise HTTPException(status_code=404, detail="Match not found")

    return (
        db.query(models.Message)
        .filter(models.Message.match_id == match_id)
        .order_by(models.Message.sent_at.asc())
        .all()
    )


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


# Pre-written, kind closure messages so ending a match never requires the
# awkward task of writing your own rejection. Modeled on what apps like
# Hinge (nudge only) and Bumble (silent expiry) still don't offer natively:
# an explicit, humane way to close a conversation instead of just vanishing.
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
    is_stale = needs_response and hours >= 72  # 3 days with no reply = ghosting territory

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

    # NOTE: this doesn't push over the live WebSocket yet (that needs a
    # sync-to-async bridge since this route runs in the threadpool, not the
    # event loop). For now the other party sees the closure message and the
    # match going inactive next time they poll /chat/{match_id}/messages or
    # /matching/matches. Worth adding a proper event push later.
    return schemas.MatchCloseResult(status="closed", closure_message_id=closure_message.id)


@router.post("/{match_id}/media")
async def upload_chat_media(
    match_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # require_active=True (the default) - can't attach media to a closed
    # match, consistent with not being able to send new text messages either.
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
    # Browsers can't set custom headers on a WebSocket handshake, so the JWT
    # is passed as a query param here instead of an Authorization header.
    try:
        user_id = auth.decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)  # unauthorized
        return

    with acquire_db_session() as db:
        match = _get_match_for_participant(db, match_id, user_id)
    if not match:
        await websocket.close(code=4404)  # not found / not a participant
        return

    await manager.connect(match_id, user_id, websocket)
    try:
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception:
                # Malformed JSON or any other decode failure from this
                # client - previously this crashed the whole connection
                # (and cascaded into crashing the OTHER participant's
                # connection too, via a failed broadcast to this dead
                # socket). Now it's just a rejected message.
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

                # Session acquired just for this message, released right
                # after - not held for the whole connection. Holding one
                # pooled connection per open WebSocket exhausted the pool
                # at ~15 concurrent chats (found via load testing); this
                # way an idle socket ties up nothing.
                with acquire_db_session() as db:
                    message = models.Message(
                        match_id=match_id,
                        sender_id=user_id,
                        content=content,
                        media_url=media_url,
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
                })

            elif msg_type in CALL_SIGNAL_TYPES:
                # Pure signaling relay to whoever else is connected to this
                # match right now - offer/answer/ICE candidates are WebRTC
                # connection plumbing, not chat content, so none of this is
                # persisted to the Message table (no DB session needed at
                # all here). Excludes the sender - they don't need their
                # own offer/answer echoed back to them.
                await manager.send_to_match(match_id, {
                    "type": msg_type,
                    "from_user_id": user_id,
                    "payload": data.get("payload"),
                }, exclude_user_id=user_id)

            elif msg_type == "call-end":
                # This one IS logged - a short "Video call · 3:24" entry in
                # the conversation, same idea as a normal call history.
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
                    },
                })

    except WebSocketDisconnect:
        pass
    finally:
        # Always runs, regardless of how the loop exited (clean disconnect,
        # or previously: an unhandled exception that skipped cleanup
        # entirely and left a dead socket registered in the room).
        manager.disconnect(match_id, user_id)
        try:
            await manager.send_to_match(match_id, {"type": "call-peer-disconnected", "from_user_id": user_id})
        except Exception:
            pass
