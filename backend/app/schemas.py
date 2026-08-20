from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, EmailStr, Field

from app.models import GenderEnum


# ---- Auth ----

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: EmailStr
    public_key: Optional[str] = None
    is_verified: bool
    is_photo_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class PublicKeyUpdate(BaseModel):
    public_key: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


# ---- Profile ----

class PromptAnswer(BaseModel):
    prompt: str
    answer: str


class ProfileCreate(BaseModel):
    first_name: str
    birthdate: datetime
    gender: GenderEnum
    gender_preference: List[GenderEnum]
    bio: Optional[str] = ""
    prompts: Optional[List[PromptAnswer]] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    age_min: int = 18
    age_max: int = 99


class ProfileOut(ProfileCreate):
    id: str
    user_id: str
    is_complete: bool

    class Config:
        from_attributes = True


# ---- Photos ----

class PhotoOut(BaseModel):
    id: str
    url: str
    position: int
    is_primary: bool

    class Config:
        from_attributes = True


# ---- Discovery / Likes / Matches ----

class DiscoverProfileOut(BaseModel):
    user_id: str
    first_name: str
    age: int
    bio: Optional[str]
    prompts: List[PromptAnswer]
    distance_km: Optional[float] = None
    photos: List[str] = []


class LikeCreate(BaseModel):
    to_user_id: str
    comment: Optional[str] = None


class LikeResult(BaseModel):
    matched: bool
    match_id: Optional[str] = None


class MatchOut(BaseModel):
    id: str
    user1_id: str
    user2_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class MatchWithProfileOut(BaseModel):
    id: str
    created_at: datetime
    other_user_id: str
    other_first_name: str
    other_photo_url: Optional[str] = None
    last_message_preview: Optional[str] = None
    last_message_at: Optional[datetime] = None
    has_unread: bool = False


class ChatInfoOut(BaseModel):
    match_id: str
    is_active: bool
    other_user_id: str
    other_first_name: str
    other_photo_url: Optional[str] = None
    other_public_key: Optional[str] = None
    user1_id: str
    user2_id: str


# ---- Stories ----

class StoryOut(BaseModel):
    id: str
    user_id: str
    media_url: str
    caption: Optional[str]
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True


class StoryFeedGroupOut(BaseModel):
    user_id: str
    first_name: str
    stories: List[StoryOut]


# ---- Messages ----

class MessageCreate(BaseModel):
    content: Optional[str] = None
    media_url: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    match_id: str
    sender_id: str
    content: Optional[str]
    media_url: Optional[str]
    sent_at: datetime
    read_at: Optional[datetime]

    # End-to-end encryption fields. When is_encrypted is False (the default,
    # and always true for messages sent before this feature existed),
    # `content` is plain text and the fields below are all null - nothing
    # about existing chats or clients that predate E2E breaks.
    is_encrypted: bool = False
    iv: Optional[str] = None
    user1_id: str
    user2_id: str
    encrypted_key_user1: Optional[str] = None
    encrypted_key_user2: Optional[str] = None

    class Config:
        from_attributes = True


# ---- Match lifecycle / anti-ghosting ----

CloseReason = Literal[
    "not_feeling_it",
    "met_someone_else",
    "distance",
    "timing_not_right",
    "no_longer_using_app",
    "other",
]


class MatchStatusOut(BaseModel):
    match_id: str
    last_message_at: Optional[datetime]
    last_message_sender_id: Optional[str]
    hours_since_last_message: Optional[float]
    needs_response: bool
    is_stale: bool


class MatchCloseRequest(BaseModel):
    reason: CloseReason
    note: Optional[str] = None


class MatchCloseResult(BaseModel):
    status: str
    closure_message_id: Optional[str] = None


# ---- Safety: blocking & reporting ----

class BlockCreate(BaseModel):
    user_id: str


class BlockOut(BaseModel):
    id: str
    blocker_id: str
    blocked_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class ReportCreate(BaseModel):
    user_id: str
    reason: str
    details: Optional[str] = None
    block_too: bool = True


class ReportOut(BaseModel):
    id: str
    reporter_id: str
    reported_id: str
    reason: str
    details: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True