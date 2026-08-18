import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Integer, Float,
    Text, Enum, UniqueConstraint, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


class GenderEnum(str, enum.Enum):
    man = "man"
    woman = "woman"
    nonbinary = "nonbinary"
    other = "other"


class ReportStatus(str, enum.Enum):
    open = "open"
    reviewed = "reviewed"
    dismissed = "dismissed"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)

    # RSA-OAEP public key (SPKI, base64), generated client-side. The matching
    # private key never leaves the user's device - see frontend/lib/crypto.ts.
    # Null until the client generates a keypair and uploads it, which happens
    # automatically right after signup/login.
    public_key = Column(Text, nullable=True)

    is_verified = Column(Boolean, default=False)   # email/phone verified
    is_photo_verified = Column(Boolean, default=False)  # selfie verification
    is_active = Column(Boolean, default=True)       # false if banned/deactivated

    created_at = Column(DateTime, default=datetime.utcnow)
    last_active_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    photos = relationship("Photo", back_populates="user", cascade="all, delete-orphan")
    stories = relationship("Story", back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), unique=True, nullable=False)

    first_name = Column(String, nullable=False)
    birthdate = Column(DateTime, nullable=False)
    gender = Column(Enum(GenderEnum), nullable=False)
    gender_preference = Column(JSON, default=list)  # e.g. ["man", "woman"]

    bio = Column(Text, default="")
    prompts = Column(JSON, default=list)  # [{"prompt": "...", "answer": "..."}]

    # Simple lat/lng for now; upgrade to PostGIS when doing real geo-queries at scale
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    age_min = Column(Integer, default=18)
    age_max = Column(Integer, default=99)

    is_complete = Column(Boolean, default=False)

    user = relationship("User", back_populates="profile")


class Photo(Base):
    __tablename__ = "photos"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    url = Column(String, nullable=False)
    position = Column(Integer, default=0)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="photos")


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_like_pair"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    from_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    to_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    comment = Column(String, nullable=True)  # Hinge-style: "liked your answer to..."
    created_at = Column(DateTime, default=datetime.utcnow)


class Pass(Base):
    __tablename__ = "passes"
    __table_args__ = (UniqueConstraint("from_user_id", "to_user_id", name="uq_pass_pair"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    from_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    to_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (UniqueConstraint("user1_id", "user2_id", name="uq_match_pair"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user1_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    user2_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    closed_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    closed_reason = Column(String, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    messages = relationship("Message", back_populates="match", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    match_id = Column(UUID(as_uuid=False), ForeignKey("matches.id"), nullable=False, index=True)
    sender_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)

    # When is_encrypted=True: `content` holds base64 AES-GCM ciphertext (not
    # plaintext), `iv` holds the base64 nonce, and encrypted_key_user1/2 each
    # hold the same random AES key RSA-encrypted separately for each match
    # participant's public key - so either person can decrypt their own copy
    # with their own private key, but the server (or anyone with DB access)
    # only ever sees ciphertext. Old rows from before E2E was added have
    # is_encrypted=False and content is plain text, for backward compatibility.
    content = Column(Text, nullable=True)
    media_url = Column(String, nullable=True)
    is_encrypted = Column(Boolean, default=False, nullable=False)
    iv = Column(String, nullable=True)
    encrypted_key_user1 = Column(Text, nullable=True)
    encrypted_key_user2 = Column(Text, nullable=True)

    sent_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)

    match = relationship("Match", back_populates="messages")


class Story(Base):
    __tablename__ = "stories"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    media_url = Column(String, nullable=False)
    caption = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)  # created_at + 24h, enforced in service layer

    user = relationship("User", back_populates="stories")


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("blocker_id", "blocked_id", name="uq_block_pair"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    blocker_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    blocked_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)  # created_at + 1h, enforced at use time
    used_at = Column(DateTime, nullable=True)       # tokens are single-use


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    reporter_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    reported_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    reason = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    status = Column(Enum(ReportStatus), default=ReportStatus.open)
    created_at = Column(DateTime, default=datetime.utcnow)