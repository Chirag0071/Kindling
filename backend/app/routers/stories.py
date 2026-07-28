from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app import models, schemas, auth, utils
from app.services.storage import get_storage_backend

router = APIRouter(prefix="/stories", tags=["stories"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024  # 8MB
MAX_ACTIVE_STORIES_PER_USER = 10
STORY_LIFETIME_HOURS = 24


@router.post("/upload", response_model=schemas.StoryOut)
async def upload_story(
    file: UploadFile = File(...),
    caption: str = Form(default=""),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WEBP images are allowed")

    file_bytes = await utils.read_upload_with_limit(file, MAX_FILE_SIZE_BYTES)
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    now = datetime.utcnow()
    active_count = (
        db.query(models.Story)
        .filter(models.Story.user_id == current_user.id, models.Story.expires_at > now)
        .count()
    )
    if active_count >= MAX_ACTIVE_STORIES_PER_USER:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_ACTIVE_STORIES_PER_USER} active stories allowed")

    storage = get_storage_backend()
    url = storage.upload(file_bytes, file.filename or "story.jpg", file.content_type, folder="stories")

    story = models.Story(
        user_id=current_user.id,
        media_url=url,
        caption=caption.strip() or None,
        expires_at=now + timedelta(hours=STORY_LIFETIME_HOURS),
    )
    db.add(story)
    db.commit()
    db.refresh(story)
    return story


@router.get("/me", response_model=List[schemas.StoryOut])
def list_my_stories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    now = datetime.utcnow()
    return (
        db.query(models.Story)
        .filter(models.Story.user_id == current_user.id, models.Story.expires_at > now)
        .order_by(models.Story.created_at.desc())
        .all()
    )


@router.get("/feed", response_model=List[schemas.StoryFeedGroupOut])
def get_story_feed(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Stories from active matches only - consistent with the rest of the app:
    this isn't a broadcast feed, it's for people you've actually connected with.
    """
    now = datetime.utcnow()

    match_rows = (
        db.query(models.Match)
        .filter(
            or_(models.Match.user1_id == current_user.id, models.Match.user2_id == current_user.id),
            models.Match.is_active.is_(True),
        )
        .all()
    )
    matched_user_ids = {
        (m.user2_id if m.user1_id == current_user.id else m.user1_id) for m in match_rows
    }
    if not matched_user_ids:
        return []

    blocked_pairs = db.query(models.Block).filter(
        or_(models.Block.blocker_id == current_user.id, models.Block.blocked_id == current_user.id)
    ).all()
    blocked_ids = {
        (b.blocked_id if b.blocker_id == current_user.id else b.blocker_id) for b in blocked_pairs
    }
    visible_user_ids = matched_user_ids - blocked_ids
    if not visible_user_ids:
        return []

    stories = (
        db.query(models.Story)
        .filter(models.Story.user_id.in_(visible_user_ids), models.Story.expires_at > now)
        .order_by(models.Story.created_at.asc())
        .all()
    )

    grouped: dict = {}
    for s in stories:
        grouped.setdefault(s.user_id, []).append(s)

    results = []
    for user_id, user_stories in grouped.items():
        profile = db.query(models.Profile).filter(models.Profile.user_id == user_id).first()
        results.append(schemas.StoryFeedGroupOut(
            user_id=user_id,
            first_name=profile.first_name if profile else "Someone",
            stories=user_stories,
        ))
    return results


@router.delete("/{story_id}")
def delete_story(
    story_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not utils.is_valid_uuid(story_id):
        raise HTTPException(status_code=404, detail="Story not found")

    story = db.query(models.Story).filter(
        models.Story.id == story_id, models.Story.user_id == current_user.id
    ).first()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    storage = get_storage_backend()
    storage.delete(story.media_url)
    db.delete(story)
    db.commit()
    return {"status": "deleted"}
