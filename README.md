# Kindling

A full-stack dating app — matching, real-time chat, WebRTC video calls, 24-hour
stories, and photo/video sharing. Built with FastAPI + PostgreSQL on the backend
and Next.js 15 + TypeScript on the frontend.

## Features

- **Auth** — email/password signup and login with JWT sessions (bcrypt-hashed passwords)
- **Profiles & onboarding** — name, birthdate, gender/preference, bio, prompts, photos
- **Discovery & matching** — swipe-style discovery feed with a mutual-like matching engine
- **Real-time chat** — WebSocket-based messaging, read receipts, rate limiting
- **Photo & video sharing in chat** — upload media inline, tap to view full-size, browse
  everything shared in a conversation from a dedicated gallery
- **WebRTC video calling** — one-tap start/end video calls with signaling over the
  existing chat WebSocket
- **24-hour stories** — post photos/videos visible only to matches for 24 hours
- **Safety layer** — block, report, rate limiting, and an anti-ghosting conversation
  closure feature
- **Pluggable media storage** — local disk for development, S3-compatible (Cloudflare
  R2, AWS S3, etc.) for production, selected automatically by which env vars are set

## Tech stack

**Backend**
- FastAPI (Python) + Uvicorn
- PostgreSQL + SQLAlchemy ORM + Alembic migrations
- WebSockets for chat and call signaling
- JWT auth (`python-jose`) + `passlib`/`bcrypt` for password hashing
- `boto3` for S3-compatible object storage
- `slowapi` for rate limiting
- `pytest` + `httpx` for the test suite (72 tests)

**Frontend**
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + Framer Motion
- Native WebSocket client + WebRTC (`RTCPeerConnection`) for calls

## Project structure

```
kindling/
├── backend/
│   ├── app/
│   │   ├── routers/         # auth, profile, matching, chat, photos, stories, safety
│   │   ├── services/        # storage backend, websocket manager, rate limiter
│   │   ├── models.py        # SQLAlchemy models
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── auth.py          # JWT + password hashing helpers
│   │   ├── config.py        # env-driven settings
│   │   ├── database.py      # SQLAlchemy engine/session
│   │   └── main.py          # FastAPI app, CORS, router registration
│   ├── alembic/versions/    # database migrations
│   ├── tests/                # pytest suite
│   ├── Dockerfile
│   ├── docker-compose.yml   # local dev: API + Postgres
│   └── requirements.txt
├── frontend/
│   ├── app/                 # Next.js App Router pages (login, signup, onboarding,
│   │                         discover, matches, chat/[matchId], profile)
│   ├── components/          # ProfileCard, Avatar, MediaLightbox, SharedMediaModal,
│   │                         VideoCallOverlay, StoryBar/Viewer, SafetyMenu, etc.
│   └── lib/                 # api client, auth context, WebRTC hook, types
├── DEPLOYMENT.md            # Render deployment guide
├── ORACLE_DEPLOYMENT.md     # Oracle Cloud Always Free deployment guide (no cold starts)
├── BACK4APP_DEPLOYMENT.md   # Back4app Containers deployment guide (no credit card)
├── LICENSE                  # MIT
└── .gitignore
```

## API overview

All routes are prefixed as shown; the full interactive schema is at `/docs` (Swagger UI)
once the backend is running.

| Area | Routes |
|---|---|
| **Auth** (`/auth`) | `POST /signup`, `POST /login`, `GET /me` |
| **Profile** (`/profile`) | `POST /`, `GET /me` |
| **Photos** (`/photos`) | `POST /upload`, `GET /me`, `PATCH /{id}/primary`, `DELETE /{id}` |
| **Matching** (`/matching`) | `GET /discover`, `POST /like`, `POST /pass`, `GET /matches` |
| **Chat** (`/chat`) | `GET /{match_id}/info`, `GET /{match_id}/messages`, `POST /{match_id}/read`, `GET /{match_id}/status`, `POST /{match_id}/close`, `POST /{match_id}/media`, `WS /ws/{match_id}` |
| **Stories** (`/stories`) | `POST /upload`, `GET /me`, `GET /feed`, `DELETE /{id}` |
| **Safety** (`/safety`) | `POST /block`, `DELETE /block/{user_id}`, `GET /blocks`, `POST /report` |
| **Health** | `GET /health` |

The chat WebSocket (`/chat/ws/{match_id}`) carries both regular messages and WebRTC
call-signaling events (offer/answer/ICE candidates, call start/end) over the same
connection.

## Getting started (local development)

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (or use the provided `docker-compose.yml`)
- Docker (optional, for the quickest backend + DB setup)

### Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, SECRET_KEY, etc.
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Or with Docker Compose (spins up Postgres too):
```bash
cd backend
docker compose up --build
```

Backend runs at `http://localhost:8000` (docs at `/docs`).

### Frontend

```bash
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL to your backend URL
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

### Running tests

```bash
cd backend
export DATABASE_URL="postgresql://user:pass@localhost:5432/kindling_test"
export SECRET_KEY="test_secret_key"
pytest tests/ -v
```

## Media storage

`StorageBackend` in `backend/app/services/storage.py` picks a backend automatically:
- **No AWS credentials set** → local disk storage (`backend/media/`), served at `/media`.
  Fine for local development; **do not rely on this in production** — most free hosts
  have ephemeral filesystems that wipe local files on every restart/redeploy.
- **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` set** → S3-compatible
  storage. Works with AWS S3 or any S3-compatible provider (Cloudflare R2, Backblaze B2,
  DigitalOcean Spaces) via `S3_ENDPOINT_URL` / `S3_PUBLIC_BASE_URL`.

## Deployment

Three deployment paths are documented, depending on what you need:

| Guide | Best for | Cost | Credit card | Cold starts |
|---|---|---|---|---|
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Quick free deploy | Free | No | Yes (sleeps after 15 min idle) |
| [`BACK4APP_DEPLOYMENT.md`](./BACK4APP_DEPLOYMENT.md) | Free alternative to Render | Free | No | Likely yes; 256MB RAM ceiling |
| [`ORACLE_DEPLOYMENT.md`](./ORACLE_DEPLOYMENT.md) | Real users, no cold starts | Free | Yes (verification only, not charged) | No — real VM, always on |

Recommended companion services either way:
- **Frontend** → [Vercel](https://vercel.com) (free Hobby tier)
- **Database** → [Aiven](https://aiven.io) free PostgreSQL tier
- **Media storage** → [Cloudflare R2](https://developers.cloudflare.com/r2/) (free, no egress fees)

## License

MIT — see [LICENSE](./LICENSE).
