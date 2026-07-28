import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.database import Base, engine
from app.config import settings
from app.services.rate_limiter import limiter
from app.routers import auth, profiles, matching, chat, safety, photos, stories

# Schema is managed by Alembic migrations now (see alembic/), not create_all.
# Run `alembic upgrade head` before starting the app against a fresh database.

app = FastAPI(title="Kindling API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

media_root = os.path.join(os.path.dirname(__file__), "..", "media")
os.makedirs(media_root, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_root), name="media")

app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(matching.router)
app.include_router(chat.router)
app.include_router(safety.router)
app.include_router(photos.router)
app.include_router(stories.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
