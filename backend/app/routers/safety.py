from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.database import get_db
from app import models, schemas, auth, utils
from app.services.rate_limiter import limiter

router = APIRouter(prefix="/safety", tags=["safety"])


def _deactivate_match_between(db: Session, user_a: str, user_b: str):
    match = db.query(models.Match).filter(
        or_(
            and_(models.Match.user1_id == user_a, models.Match.user2_id == user_b),
            and_(models.Match.user1_id == user_b, models.Match.user2_id == user_a),
        )
    ).first()
    if match and match.is_active:
        match.is_active = False


@router.post("/block", response_model=schemas.BlockOut)
def block_user(
    payload: schemas.BlockCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    target = utils.get_user_or_404(db, payload.user_id)

    existing = db.query(models.Block).filter(
        models.Block.blocker_id == current_user.id,
        models.Block.blocked_id == payload.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already blocked")

    block = models.Block(blocker_id=current_user.id, blocked_id=payload.user_id)
    db.add(block)
    _deactivate_match_between(db, current_user.id, payload.user_id)
    db.commit()
    db.refresh(block)
    return block


@router.delete("/block/{user_id}")
def unblock_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if not utils.is_valid_uuid(user_id):
        raise HTTPException(status_code=404, detail="Block not found")

    block = db.query(models.Block).filter(
        models.Block.blocker_id == current_user.id,
        models.Block.blocked_id == user_id,
    ).first()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    db.delete(block)
    db.commit()
    return {"status": "unblocked"}


@router.get("/blocks", response_model=List[schemas.BlockOut])
def list_blocks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    return db.query(models.Block).filter(models.Block.blocker_id == current_user.id).all()


@router.post("/report", response_model=schemas.ReportOut)
@limiter.limit("20/day")
def report_user(
    request: Request,
    payload: schemas.ReportCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")

    target = utils.get_user_or_404(db, payload.user_id)

    report = models.Report(
        reporter_id=current_user.id,
        reported_id=payload.user_id,
        reason=payload.reason,
        details=payload.details,
    )
    db.add(report)

    if payload.block_too:
        already_blocked = db.query(models.Block).filter(
            models.Block.blocker_id == current_user.id,
            models.Block.blocked_id == payload.user_id,
        ).first()
        if not already_blocked:
            db.add(models.Block(blocker_id=current_user.id, blocked_id=payload.user_id))
        _deactivate_match_between(db, current_user.id, payload.user_id)

    db.commit()
    db.refresh(report)
    return report
