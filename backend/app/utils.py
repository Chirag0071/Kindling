import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models


def is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def get_user_or_404(db: Session, user_id: str) -> models.User:
    if not is_valid_uuid(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def read_upload_with_limit(file, max_bytes: int) -> bytes:
    """
    Reads an UploadFile in chunks, aborting as soon as the size limit is
    exceeded - instead of `await file.read()`, which fully materializes
    the entire upload in memory before any size check runs. A client
    could otherwise send an arbitrarily large file and the server would
    buffer all of it before rejecting - a real memory-exhaustion vector.
    """
    from fastapi import HTTPException

    chunks = []
    total = 0
    chunk_size = 1024 * 1024  # 1MB
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=400, detail=f"File must be under {max_bytes // (1024 * 1024)}MB")
        chunks.append(chunk)
    return b"".join(chunks)


def get_photo_or_404(db: Session, photo_id: str, owner_user_id: str) -> models.Photo:
    if not is_valid_uuid(photo_id):
        raise HTTPException(status_code=404, detail="Photo not found")
    photo = db.query(models.Photo).filter(
        models.Photo.id == photo_id, models.Photo.user_id == owner_user_id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    return photo


def sync_profile_completeness(db: Session, user_id: str) -> None:
    """
    Recomputes and persists is_complete for a user's profile, if one exists.

    This is called from anywhere that can change what "complete" depends on
    (profile edits, photo upload, photo delete) so the stored flag can never
    drift out of sync with reality just because of the order operations
    happened in. A stale is_complete previously caused a real onboarding
    redirect loop - this closes that class of bug at the source.
    """
    profile = db.query(models.Profile).filter(models.Profile.user_id == user_id).first()
    if not profile:
        return
    has_photo = db.query(models.Photo).filter(models.Photo.user_id == user_id).first() is not None
    profile.is_complete = bool(profile.first_name) and has_photo
    db.commit()
