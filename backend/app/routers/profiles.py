from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth, utils

router = APIRouter(prefix="/profile", tags=["profile"])

MIN_AGE = 18


def _calculate_age(birthdate: datetime) -> int:
    today = datetime.utcnow()
    return today.year - birthdate.year - (
        (today.month, today.day) < (birthdate.month, birthdate.day)
    )


@router.post("", response_model=schemas.ProfileOut)
def create_or_update_profile(
    payload: schemas.ProfileCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if _calculate_age(payload.birthdate) < MIN_AGE:
        raise HTTPException(status_code=400, detail="Must be 18 or older to use this app")

    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    prompts_data = [p.model_dump() for p in (payload.prompts or [])]

    if profile:
        for field, value in payload.model_dump(exclude={"prompts"}).items():
            setattr(profile, field, value)
        profile.prompts = prompts_data
    else:
        profile = models.Profile(
            user_id=current_user.id,
            **payload.model_dump(exclude={"prompts"}),
            prompts=prompts_data,
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)
    utils.sync_profile_completeness(db, current_user.id)
    db.refresh(profile)
    return profile


@router.get("/me", response_model=schemas.ProfileOut)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not created yet")
    return profile
