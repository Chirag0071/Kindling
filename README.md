# Kindling — Real-Time Chat App

A chatting app centered on real-time messaging — live chat, photo/video sharing,
WebRTC video calls, matching, and disappearing stories. FastAPI + PostgreSQL
backend, Next.js 15 + TypeScript frontend.

## Chat Features

- **Real-time messaging** over WebSocket (`/chat/ws/{match_id}`) — instant delivery,
  no polling
- **Auto-reconnect** — if the connection drops (network blip, backend restart), it
  reconnects automatically with backoff instead of silently dying
- **Read receipts** — messages marked read when the recipient opens the thread
- **Photo & video sharing in chat** — attach directly from the message bar, 8MB image
  / 30MB video limit, stored on Cloudinary
- **Tap to view full size** — Instagram-style lightbox with swipe/arrow navigation
  between photos and videos
- **Shared media gallery** — tap the other person's name to see every photo/video
  exchanged in that conversation
- **WebRTC video calling** — one-tap start/end, signaling carried over the same
  WebSocket connection as chat (offer/answer/ICE candidates, call state)
- **Anti-ghosting closure flow** — a conversation can be formally closed with a
  reason, instead of just going silent
- **Rate limiting** — `slowapi` throttles message/upload spam per user
- **Safety layer** — block, report, and blocked users' messages/media never reach you

## Other Features

- Email/password auth with JWT sessions
- Profile creation & onboarding (photos, bio, prompts, gender/preference)
- Swipe-style discovery feed with mutual-like matching
- 24-hour disappearing stories, visible to matches only
- Pluggable media storage: Cloudinary (default) → S3-compatible (AWS S3 / Cloudflare
  R2) → local disk, auto-selected by which env vars are set

## Tech Stack

**Backend** — FastAPI, PostgreSQL, SQLAlchemy, Alembic, native WebSockets,
`python-jose` (JWT), `passlib`/`bcrypt`, `boto3`, `cloudinary`, `slowapi`, pytest

**Frontend** — Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion,
native WebSocket client, `RTCPeerConnection` for video calls

## Project Structure

```
kindling/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── chat.py          # messages, WebSocket, media upload, call signaling
│   │   │   ├── auth.py
│   │   │   ├── profiles.py
│   │   │   ├── matching.py
│   │   │   ├── photos.py
│   │   │   ├── stories.py
│   │   │   └── safety.py        # block/report
│   │   ├── services/
│   │   │   ├── websocket_manager.py   # connection registry, broadcast
│   │   │   ├── storage.py             # Cloudinary / S3 / local disk backends
│   │   │   └── rate_limiter.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── auth.py              # JWT + password hashing
│   │   ├── config.py            # env-driven settings
│   │   ├── database.py
│   │   └── main.py              # app entrypoint, CORS, router registration
│   ├── alembic/versions/        # migrations
│   ├── tests/                   # pytest suite (83 tests)
│   ├── Dockerfile
│   ├── docker-compose.yml       # local dev: API + Postgres
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── chat/[matchId]/page.tsx   # chat screen: messages, WS, calls, media
│   │   ├── matches/page.tsx
│   │   ├── discover/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── login/, signup/page.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── VideoCallOverlay.tsx      # WebRTC call UI
│   │   ├── MediaLightbox.tsx         # full-size photo/video viewer
│   │   ├── SharedMediaModal.tsx      # "shared with X" gallery
│   │   ├── PhotoGrid.tsx             # profile photo management
│   │   ├── ProfileCard.tsx, MatchModal.tsx, StoryBar.tsx, StoryViewer.tsx
│   │   ├── Avatar.tsx                # graceful fallback if a photo fails to load
│   │   └── SafetyMenu.tsx, EndConversationModal.tsx
│   └── lib/
│       ├── api.ts               # REST client, getApiUrl/getWsUrl
│       ├── useWebRTCCall.ts     # call state machine
│       ├── auth-context.tsx
│       └── types.ts
├── DEPLOYMENT.md                # Render deploy guide
├── ORACLE_DEPLOYMENT.md         # Oracle Cloud Always Free (no cold starts)
├── BACK4APP_DEPLOYMENT.md       # Back4app Containers (no credit card)
├── FULL_DEPLOYMENT_WALKTHROUGH.md
├── LICENSE                      # MIT
└── .gitignore
```

## Chat System — How It Works

1. Client opens `WS /chat/ws/{match_id}?token=<jwt>` after loading a conversation
2. Backend validates the token and match membership, registers the connection in
   `websocket_manager.py`
3. Sending a message: client sends `{"type": "chat", "content": "..."}` or
   `{"type": "chat", "media_url": "..."}` over the socket
4. Backend validates (rate limit, media URL allowlist), persists to Postgres, then
   broadcasts to both participants' open connections
5. Video calls reuse the same socket: `call-offer` / `call-answer` /
   `call-ice-candidate` / `call-decline` messages carry WebRTC signaling; call end
   posts a summary message into the same chat thread
6. If the socket drops, the client auto-reconnects with exponential backoff (1s → 8s
   cap) instead of leaving the chat dead until a manual refresh

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (or use the provided `docker-compose.yml`)
- A free Cloudinary account (for photo/video storage — local disk works too but
  isn't persistent)

### Backend

```bash
cd backend
cp .env.example .env          # fill in DATABASE_URL, SECRET_KEY, CLOUDINARY_* etc.
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

Runs at `http://localhost:8000` — interactive API docs at `/docs`.

### Frontend

```bash
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

Runs at `http://localhost:3000`.

### Running Tests

```bash
cd backend
export DATABASE_URL="postgresql://user:pass@localhost:5432/kindling_test"
export SECRET_KEY="test_secret_key"
pytest tests/ -v
```

83 tests covering auth, profiles, matching, chat (including WebSocket message
delivery and media URL validation), photos, stories, safety, and storage backends.

## Environment Variables (Backend)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing secret |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Media storage (preferred) |
| `AWS_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` | S3/R2 fallback storage |
| `FRONTEND_ORIGIN` | Exact frontend URL, required for CORS |
| `ENVIRONMENT` | `development` / `production` |

## Deployment

See `FULL_DEPLOYMENT_WALKTHROUGH.md` for a complete zero-to-live walkthrough
(Cloudinary → Aiven Postgres → Render backend → Vercel frontend). Alternative
backend hosts (`ORACLE_DEPLOYMENT.md`, `BACK4APP_DEPLOYMENT.md`) are drop-in
replacements for the Render step only.

## License

MIT — see [LICENSE](./LICENSE).