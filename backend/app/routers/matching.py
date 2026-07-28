from datetime import datetime
from math import radians, cos, sin, asin, sqrt
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app import models, schemas, auth, utils
from app.services.rate_limiter import limiter

router = APIRouter(prefix="/matching", tags=["matching"])


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def _age(birthdate: datetime) -> int:
    today = datetime.utcnow()
    return today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))


@router.get("/discover", response_model=List[schemas.DiscoverProfileOut])
def discover(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    my_profile = db.query(models.Profile).filter(models.Profile.user_id == current_user.id).first()
    if not my_profile or not my_profile.is_complete:
        raise HTTPException(status_code=400, detail="Complete your profile before browsing")

    excluded_ids = {current_user.id}
    excluded_ids.update(r[0] for r in db.query(models.Like.to_user_id).filter(models.Like.from_user_id == current_user.id))
    excluded_ids.update(r[0] for r in db.query(models.Pass.to_user_id).filter(models.Pass.from_user_id == current_user.id))
    excluded_ids.update(r[0] for r in db.query(models.Block.blocked_id).filter(models.Block.blocker_id == current_user.id))
    excluded_ids.update(r[0] for r in db.query(models.Block.blocker_id).filter(models.Block.blocked_id == current_user.id))
    excluded_ids.update(r[0] for r in db.query(models.Match.user2_id).filter(models.Match.user1_id == current_user.id))
    excluded_ids.update(r[0] for r in db.query(models.Match.user1_id).filter(models.Match.user2_id == current_user.id))

    # NOTE: gender_preference containment is filtered in Python below since it's a JSON
    # column. At real scale, normalize this into a join table or use a native array
    # column with a GIN index so both directions filter at the DB level.
    candidates = (
        db.query(models.Profile)
        .join(models.User, models.User.id == models.Profile.user_id)
        .filter(
            models.Profile.user_id.notin_(excluded_ids),
            models.Profile.is_complete.is_(True),
            models.User.is_active.is_(True),
            models.Profile.gender.in_(my_profile.gender_preference),
        )
        .all()
    )

    results = []
    for c in candidates:
        if my_profile.gender not in (c.gender_preference or []):
            continue
        age = _age(c.birthdate)
        if not (my_profile.age_min <= age <= my_profile.age_max):
            continue
        if not (c.age_min <= _age(my_profile.birthdate) <= c.age_max):
            continue
        distance = None
        if my_profile.latitude is not None and my_profile.longitude is not None and c.latitude is not None and c.longitude is not None:
            distance = haversine_km(my_profile.latitude, my_profile.longitude, c.latitude, c.longitude)
        results.append((c, age, distance))
        if len(results) >= limit:
            break

    # Single batched query for every candidate's photos instead of one query
    # per candidate (was N+1: 20 candidates meant 20 separate round-trips
    # just for photos).
    result_user_ids = [c.user_id for c, _, _ in results]
    photos_by_user: dict = {}
    if result_user_ids:
        all_photos = (
            db.query(models.Photo)
            .filter(models.Photo.user_id.in_(result_user_ids))
            .order_by(models.Photo.position.asc())
            .all()
        )
        for p in all_photos:
            photos_by_user.setdefault(p.user_id, []).append(p.url)

    return [
        schemas.DiscoverProfileOut(
            user_id=c.user_id,
            first_name=c.first_name,
            age=age,
            bio=c.bio,
            prompts=c.prompts or [],
            distance_km=round(distance, 1) if distance is not None else None,
            photos=photos_by_user.get(c.user_id, []),
        )
        for c, age, distance in results
    ]


@router.post("/like", response_model=schemas.LikeResult)
@limiter.limit("100/hour")
def like_user(
    request: Request,
    payload: schemas.LikeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # Captured as a plain string up front. After db.rollback() below,
    # current_user becomes an expired ORM object - touching current_user.id
    # again would force SQLAlchemy to silently re-SELECT it, which is an
    # avoidable trip and, in edge cases, a failure mode of its own. A plain
    # string has neither problem.
    current_user_id = current_user.id

    if payload.to_user_id == current_user_id:
        raise HTTPException(status_code=400, detail="Cannot like yourself")

    target = utils.get_user_or_404(db, payload.to_user_id)

    # Row-locked in a consistent (sorted) order so two concurrent mutual
    # likes serialize around this critical section instead of both reading
    # "no reciprocal like yet" before either has committed. Without this,
    # two people liking each other at the same instant could both succeed
    # individually but never actually match - a real bug found under load
    # testing: no crash, just a silently lost match with no way to retry
    # (re-liking is blocked once a Like row exists).
    for uid in sorted([current_user_id, payload.to_user_id]):
        db.query(models.User).filter(models.User.id == uid).with_for_update().first()

    existing = db.query(models.Like).filter(
        models.Like.from_user_id == current_user_id,
        models.Like.to_user_id == payload.to_user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already liked this user")

    db.add(models.Like(from_user_id=current_user_id, to_user_id=payload.to_user_id, comment=payload.comment))

    reciprocal = db.query(models.Like).filter(
        models.Like.from_user_id == payload.to_user_id,
        models.Like.to_user_id == current_user_id,
    ).first()

    match = None
    if reciprocal:
        user1, user2 = sorted([current_user_id, payload.to_user_id])
        match = models.Match(user1_id=user1, user2_id=user2)
        db.add(match)

    try:
        db.commit()
    except IntegrityError:
        # Two near-simultaneous mutual likes can both pass the "reciprocal
        # exists" check above before either has committed, so both try to
        # insert the same Match row - the unique constraint catches the
        # duplicate at the DB level. Previously this crashed with a 500;
        # now it's treated as what it actually is: a successful match that
        # someone else's concurrent request already created.
        db.rollback()
        existing_like = db.query(models.Like).filter(
            models.Like.from_user_id == current_user_id,
            models.Like.to_user_id == payload.to_user_id,
        ).first()
        if not existing_like:
            db.add(models.Like(from_user_id=current_user_id, to_user_id=payload.to_user_id, comment=payload.comment))
            db.commit()

        if reciprocal:
            user1, user2 = sorted([current_user_id, payload.to_user_id])
            match = db.query(models.Match).filter(
                models.Match.user1_id == user1, models.Match.user2_id == user2
            ).first()

    if match:
        db.refresh(match)

    return schemas.LikeResult(matched=bool(match), match_id=match.id if match else None)


@router.post("/pass")
def pass_user(
    payload: schemas.LikeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not utils.is_valid_uuid(payload.to_user_id):
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(models.Pass).filter(
        models.Pass.from_user_id == current_user.id,
        models.Pass.to_user_id == payload.to_user_id,
    ).first()
    if not existing:
        db.add(models.Pass(from_user_id=current_user.id, to_user_id=payload.to_user_id))
        db.commit()
    return {"status": "passed"}


@router.get("/matches", response_model=List[schemas.MatchWithProfileOut])
def list_matches(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    match_rows = (
        db.query(models.Match)
        .filter(
            or_(models.Match.user1_id == current_user.id, models.Match.user2_id == current_user.id),
            models.Match.is_active.is_(True),
        )
        .order_by(models.Match.created_at.desc())
        .all()
    )

    other_ids = [
        (m.user2_id if m.user1_id == current_user.id else m.user1_id) for m in match_rows
    ]
    match_ids = [m.id for m in match_rows]

    profiles_by_user = {}
    primary_photo_by_user = {}
    if other_ids:
        for p in db.query(models.Profile).filter(models.Profile.user_id.in_(other_ids)).all():
            profiles_by_user[p.user_id] = p
        for photo in db.query(models.Photo).filter(
            models.Photo.user_id.in_(other_ids), models.Photo.is_primary.is_(True)
        ).all():
            primary_photo_by_user[photo.user_id] = photo

    # Latest message per match, and which matches have something unread -
    # both computed from one batched query (ascending by sent_at, so the
    # last write into the dict per match_id is always the newest one),
    # rather than a query per match.
    last_message_by_match = {}
    unread_match_ids = set()
    if match_ids:
        for msg in (
            db.query(models.Message)
            .filter(models.Message.match_id.in_(match_ids))
            .order_by(models.Message.sent_at.asc())
            .all()
        ):
            last_message_by_match[msg.match_id] = msg
            if msg.sender_id != current_user.id and msg.read_at is None:
                unread_match_ids.add(msg.match_id)

    results = []
    for m in match_rows:
        other_id = m.user2_id if m.user1_id == current_user.id else m.user1_id
        other_profile = profiles_by_user.get(other_id)
        primary_photo = primary_photo_by_user.get(other_id)
        last_msg = last_message_by_match.get(m.id)
        results.append(schemas.MatchWithProfileOut(
            id=m.id,
            created_at=m.created_at,
            other_user_id=other_id,
            other_first_name=other_profile.first_name if other_profile else "Someone",
            other_photo_url=primary_photo.url if primary_photo else None,
            last_message_preview=(last_msg.content[:80] if last_msg and last_msg.content else None),
            last_message_at=last_msg.sent_at if last_msg else None,
            has_unread=m.id in unread_match_ids,
        ))

    # Most recently active conversation first, not just most recently matched
    results.sort(key=lambda r: r.last_message_at or r.created_at, reverse=True)
    return results
