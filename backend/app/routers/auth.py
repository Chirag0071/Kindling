from datetime import datetime, timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas, auth
from app.services.rate_limiter import limiter
from app.services.email import send_password_reset_email
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_TTL_MINUTES = 60


@router.post("/signup", response_model=schemas.TokenResponse)
@limiter.limit("5/hour")
def signup(request: Request, payload: schemas.SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=payload.email,
        password_hash=auth.hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # TODO (Phase 1 follow-up): send email verification link before allowing swiping

    token = auth.create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token)


@router.post("/login", response_model=schemas.TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated or banned")

    token = auth.create_access_token(subject=user.id)
    return schemas.TokenResponse(access_token=token)


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


@router.put("/public-key")
def set_public_key(
    payload: schemas.PublicKeyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # Called automatically by the client right after signup/login once it's
    # generated (or confirmed it already has) a local keypair - see
    # frontend/lib/crypto.ts ensureKeysReady(). The private key half never
    # reaches this endpoint or the server at all.
    current_user.public_key = payload.public_key
    db.commit()
    return {"status": "ok"}


@router.post("/forgot-password")
@limiter.limit("3/hour")
def forgot_password(request: Request, payload: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()

    # Always return the same response whether or not the email exists -
    # otherwise this endpoint becomes a free "is this email registered"
    # oracle for anyone to probe. The person just sees "check your email"
    # either way; only an actual registered address gets one.
    if user:
        token = secrets.token_urlsafe(32)
        reset = models.PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
        )
        db.add(reset)
        db.commit()

        reset_url = f"{settings.frontend_origin}/reset-password?token={token}"
        try:
            send_password_reset_email(user.email, reset_url)
        except Exception:
            # Don't let an email-provider hiccup surface as a signup-probing
            # signal either (a 500 here vs a 200 would leak the same info a
            # different way) or block the response - the token still exists
            # and works if the person has another way to get the link.
            pass

    return {"status": "ok", "detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("10/hour")
def reset_password(request: Request, payload: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    reset = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == payload.token
    ).first()

    if not reset or reset.used_at is not None or reset.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    user = db.query(models.User).filter(models.User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired")

    user.password_hash = auth.hash_password(payload.new_password)
    reset.used_at = datetime.utcnow()
    db.commit()

    return {"status": "ok"}