from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth, utils
from app.services.storage import get_storage_backend

router = APIRouter(prefix="/photos", tags=["photos"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024  # 8MB
MAX_PHOTOS_PER_USER = 6


@router.post("/upload", response_model=schemas.PhotoOut)
async def upload_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WEBP images are allowed")

    file_bytes = await utils.read_upload_with_limit(file, MAX_FILE_SIZE_BYTES)
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    existing_count = db.query(models.Photo).filter(models.Photo.user_id == current_user.id).count()
    if existing_count >= MAX_PHOTOS_PER_USER:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_PHOTOS_PER_USER} photos allowed")

    storage = get_storage_backend()
    url = storage.upload(file_bytes, file.filename or "photo.jpg", file.content_type, folder="photos")

    photo = models.Photo(
        user_id=current_user.id,
        url=url,
        position=existing_count,
        is_primary=(existing_count == 0),  # first photo uploaded becomes primary automatically
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    utils.sync_profile_completeness(db, current_user.id)
    return photo


@router.get("/me", response_model=List[schemas.PhotoOut])
def list_my_photos(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return (
        db.query(models.Photo)
        .filter(models.Photo.user_id == current_user.id)
        .order_by(models.Photo.position.asc())
        .all()
    )


@router.patch("/{photo_id}/primary", response_model=schemas.PhotoOut)
def set_primary_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    photo = utils.get_photo_or_404(db, photo_id, current_user.id)

    db.query(models.Photo).filter(
        models.Photo.user_id == current_user.id, models.Photo.is_primary.is_(True)
    ).update({"is_primary": False})

    photo.is_primary = True
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/{photo_id}")
def delete_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    photo = utils.get_photo_or_404(db, photo_id, current_user.id)

    storage = get_storage_backend()
    storage.delete(photo.url)

    was_primary = photo.is_primary
    db.delete(photo)
    db.commit()

    if was_primary:
        next_photo = (
            db.query(models.Photo)
            .filter(models.Photo.user_id == current_user.id)
            .order_by(models.Photo.position.asc())
            .first()
        )
        if next_photo:
            next_photo.is_primary = True
            db.commit()

    utils.sync_profile_completeness(db, current_user.id)
    return {"status": "deleted"}
