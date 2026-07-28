# Kindling

A dating app that leads with honesty instead of engagement-optimized swiping: real matching, real-time chat, disappearing stories for people you've actually connected with, and the actual differentiator - a built-in way to end a conversation kindly instead of ghosting.

Built end-to-end: FastAPI backend, Next.js frontend, ~4,700 lines of application code, 57 automated backend tests, and a real browser (Playwright) driving the actual UI to verify the frontend - not just "it compiles."

---

## Table of contents

1. Why this exists
2. Stack
3. Architecture
4. Feature list
5. Design system
6. Local setup
7. Testing
8. Deployment
9. API reference
10. Real bugs found and fixed
11. Known limitations
12. Roadmap

---

## Why this exists

Built after researching real app-store reviews and dating-app complaints to find gaps neither Snapchat nor mainstream dating apps (Hinge/Tinder/Bumble) actually solve:

- **Ghosting.** 61% of online daters have been ghosted. Hinge only nudges ("Your Turn"); Bumble just lets matches silently expire. Kindling requires an explicit reason and sends a pre-written, kind closure message instead of letting a match go silent forever.
- **Fake profiles / AI-generated catfishing.** The single fastest-growing 2026 dating-app complaint (84% of UK singles distrust dating apps because of deepfakes). Not solved here - it needs a real liveness-verification provider, see Known Limitations.
- **Opaque moderation and pricing.** Addressed structurally: transparent rate limits, clear block/report flows, no dark-pattern subscription mechanics (there's no paywall at all right now).

## Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + PostgreSQL |
| Schema management | Alembic migrations |
| Real-time | Native WebSockets (no third-party service) |
| Auth | JWT, bcrypt password hashing |
| Rate limiting | slowapi, in-memory |
| Media storage | Pluggable: local disk (dev, zero config) or any S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces) |
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind |
| Animation | Framer Motion (used sparingly - one signature moment, not everywhere) |
| Fonts | Self-hosted via @fontsource (no Google Fonts CDN dependency at build or runtime) |
| Backend testing | pytest, 57 tests against a real Postgres |
| Frontend testing | Playwright, real browser automation |

## Architecture

```
kindling/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, router registration, CORS, rate limiter
│   │   ├── config.py            # Settings (env-driven)
│   │   ├── database.py          # SQLAlchemy engine/session, get_db dependency
│   │   ├── models.py            # 11 tables: users, profiles, photos, likes, passes,
│   │   │                        #   matches, messages, stories, blocks, reports
│   │   ├── schemas.py           # Pydantic request/response models
│   │   ├── auth.py              # JWT + bcrypt + get_current_user dependency
│   │   ├── utils.py             # Shared helpers (UUID validation, profile completeness sync)
│   │   ├── routers/
│   │   │   ├── auth.py          # signup, login, me
│   │   │   ├── profiles.py      # profile create/update/get
│   │   │   ├── photos.py        # photo upload/list/primary/delete
│   │   │   ├── matching.py      # discovery feed, like/pass, matches list
│   │   │   ├── chat.py          # REST history + WebSocket live chat + closure +
│   │   │   │                    #   media attachments + WebRTC call signaling
│   │   │   ├── safety.py        # block, report
│   │   │   └── stories.py       # story upload/feed/delete
│   │   └── services/
│   │       ├── storage.py       # Storage abstraction: local disk / any S3-compatible provider
│   │       ├── websocket_manager.py  # In-memory connection registry per match
│   │       └── rate_limiter.py  # Shared slowapi Limiter instance
│   ├── alembic/                 # Migration history
│   ├── tests/                   # 57 pytest tests, isolated per-test via transaction rollback
│   ├── docker-compose.yml       # Local dev: Postgres + API, runs migrations automatically
│   ├── Dockerfile
│   └── render.yaml              # Render Blueprint for deployment
└── frontend/
    ├── app/                     # Next.js App Router pages: /, /login, /signup, /onboarding,
    │                            #   /discover, /matches, /chat/[matchId], /profile
    ├── components/              # Button, Input, PhotoGrid, ProfileCard, MatchModal,
    │                            #   StoryBar, StoryViewer, EndConversationModal, SafetyMenu,
    │                            #   VideoCallOverlay, NavBar
    ├── lib/
    │   ├── api.ts                # Typed API client for every backend endpoint
    │   ├── auth-context.tsx      # Auth state, session loading, route protection
    │   ├── useWebRTCCall.ts      # Video call peer connection lifecycle + signaling
    │   └── types.ts              # Shared TypeScript types matching backend schemas
    └── vercel.json
```

### Data model

11 tables. The relationships that matter:

- User 1-1 Profile, 1-many Photo, 1-many Story
- Like / Pass: directional, one row per (from, to) pair, unique-constrained
- Match: created when both directions of Like exist for a pair; carries is_active, closed_by, closed_reason, closed_at for the anti-ghosting closure flow
- Message: belongs to a Match, not to two users directly
- Block / Report: directional, Block is checked everywhere a match/chat/story is accessed (defense in depth, not just at creation time)

## Feature list

### Auth & profiles
- Email/password signup and login, JWT bearer tokens, bcrypt hashing
- 18+ age gating enforced server-side (not just a client-side date picker restriction)
- Profile completeness (is_complete) is computed from live DB state (name + at least one photo) every time a profile or photo changes - not a stale snapshot (see bugs found)

### Matching
- Discovery feed filtered by mutual gender preference, mutual age-range compatibility, and distance (haversine, computed in-app - see known limitations for the PostGIS note)
- Like / pass, with mutual-like auto-creating a match
- Matched, liked, passed, and blocked users are permanently excluded from future discovery

### Real-time chat
- WebSocket-based, one connection per (match, user)
- Message history persisted and readable via REST even after a match closes
- Read receipts
- GET /chat/{id}/status reports whose turn it is to reply and flags staleness (no reply in 72+ hours) - foundation for a future "nudge" feature
- Photo/video attachments: POST /chat/{id}/media uploads (8MB image / 30MB video cap), sent over the same WebSocket as a media_url message. Server-side validated against our own storage domain so a client can't inject arbitrary external URLs.
- WebRTC video calling: signaling (offer/answer/ICE) relayed over the existing chat WebSocket, zero new infrastructure. Uses Google's free public STUN servers - works on most networks with $0 spend; some restrictive networks would need a TURN relay (paid or self-hosted) to connect, not included. Call end logs a permanent "Video call · 3:24" summary message, same as any other chat message.

### Anti-ghosting closure (the core differentiator)
- POST /chat/{id}/close requires a reason code (not_feeling_it, met_someone_else, distance, timing_not_right, no_longer_using_app, other)
- Auto-sends a pre-written, kind closure message so nobody has to compose their own rejection
- The match deactivates but chat history (including the closure message) stays readable - closure only works if the other person can actually read it

### Safety
- Block: immediately deactivates any existing match, hides both users from each other's discovery feed and story feed
- Report: optional auto-block, reason codes, stored for review (no admin UI yet - see limitations)
- Rate limiting: signup (5/hr), login (10/min - brute-force protection), likes (100/hr - anti-bot), reports (20/day - anti-abuse-of-reporting)
- Every endpoint that takes a client-supplied ID validates UUID shape before it reaches the database (a real crash bug, found and fixed - see below)

### Photos
- Upload with content-type and size validation (JPEG/PNG/WEBP, 8MB max), 6-photo cap per user
- Storage is a pluggable abstraction - local disk today, any S3-compatible provider in production via config only, no code changes
- First photo uploaded becomes primary automatically; deleting the primary photo promotes the next one

### Stories
- 24-hour ephemeral media, visible only to active matches (not a public broadcast feed)
- Blocking hides stories even between otherwise-matched users
- Same storage pipeline and validation as photos

### Frontend
- Every screen needed to actually use the app: auth, onboarding (with photo upload), swipeable discovery deck, the "spark" match moment, matches list with story bar, live chat with closure/safety actions, profile view/edit
- Mobile-first, dark theme, custom design system (see below)

## Design system

**Palette** - deliberately not the two most common AI-generated dating-app looks (cream+terracotta+serif, or near-black+single-neon-accent):
- dusk #211E33 - deep indigo-violet background, not pure black
- birch #F3E9D8 - warm parchment for cards and primary text
- ember #E17A47 - muted amber accent (not Tinder-red)
- spark #F4C463 - soft gold, used only for the match moment and highlights
- slate #9089A6, ash #3A3651 - secondary text and borders

**Type** - Fraunces (warm, slightly eccentric serif) for headlines and the logotype, Inter for UI and chat, JetBrains Mono for metadata (distance, timestamps) as a small "field-journal" texture that fits the kindling/outdoors metaphor. All self-hosted via @fontsource, no Google Fonts CDN call at build or runtime.

**Signature moment** - matching is called "a spark," not "It's a Match!" Two ember-colored circles drift toward each other and catch into a soft gold glow around both photos. This is the one place real animation budget is spent; everything else stays quiet and restrained.

**Copy voice** - active, plain, honest. "End this conversation" instead of the clinical "Unmatch." Empty states say what to do next ("Check back soon, or widen your distance in Profile") instead of just "No results."

## Local setup

**Backend:**
```bash
cd backend
cp .env.example .env      # fill in SECRET_KEY at minimum
docker-compose up         # runs Alembic migrations automatically, then starts the API
```
Without Docker: pip install -r requirements.txt --break-system-packages, start a local Postgres, alembic upgrade head, then uvicorn app.main:app --reload. Interactive API docs at http://localhost:8000/docs.

Works with **Python 3.11 or 3.12** - nothing in requirements.txt needs a specific version.

**Frontend:**
```bash
cd frontend
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL
npm install
npm run dev
```
Runs at http://localhost:3000.

## Testing

**Backend - 57 pytest tests against a real Postgres, not mocked:**
```bash
cd backend
pip install -r requirements-dev.txt --break-system-packages
createdb dating_app_test     # separate DB, isolated from dev data
pytest tests/ -v
```
Each test runs in its own DB transaction that rolls back afterward, so tests don't interfere with each other. Covers auth, profiles, matching (including a regression test for the N+1 photo-batching fix), chat (including real WebSocket connections via TestClient.websocket_connect), safety, photos, stories, and the storage abstraction (mocked boto3, verifying both AWS-style and S3-compatible-provider code paths).

**Frontend** - verified with real Playwright browser automation during development (signup -> onboarding -> photo upload -> discover -> match -> chat, with console-error and failed-request monitoring). These scripts caught real bugs (see below) but are currently one-off verification scripts, not a committed test suite - see known limitations.

## Deployment

Full walkthrough in DEPLOYMENT.md - Aiven (Postgres) -> Render (backend, runs migrations automatically on deploy) -> Vercel (frontend). Config files (render.yaml, vercel.json) are ready; actually creating accounts and connecting them requires steps only you can take.

**Storage provider options for production**, all supported by the same code:

| Provider | Config needed | Why you might pick it |
|---|---|---|
| AWS S3 | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME | Most ecosystem integration |
| Cloudflare R2 | + S3_ENDPOINT_URL, S3_PUBLIC_BASE_URL | Zero egress fees - meaningfully cheaper for a read-heavy app like this one |
| Backblaze B2 / DigitalOcean Spaces | + S3_ENDPOINT_URL, S3_PUBLIC_BASE_URL | Cheaper storage, S3-compatible |

## API reference

| Endpoint | Purpose |
|---|---|
| POST /auth/signup, /auth/login, GET /auth/me | Auth |
| POST /profile, GET /profile/me | Profile |
| POST /photos/upload, GET /photos/me, PATCH /photos/{id}/primary, DELETE /photos/{id} | Photos |
| POST /stories/upload, GET /stories/me, GET /stories/feed, DELETE /stories/{id} | Stories |
| GET /matching/discover | Discovery feed |
| POST /matching/like, POST /matching/pass | Swipe actions |
| GET /matching/matches | Active matches, with the other user's name/photo pre-joined |
| GET /chat/{match_id}/info | Other participant's name/photo for the chat header |
| GET /chat/{match_id}/messages, POST /chat/{match_id}/read | Chat history & read receipts |
| WS /chat/ws/{match_id}?token=... | Live chat + WebRTC signaling (types: chat, call-offer, call-answer, call-ice-candidate, call-decline, call-end) |
| POST /chat/{match_id}/media | Upload a photo/video attachment, returns a URL to send over the WS |
| GET /chat/{match_id}/status | Whose turn it is to reply / staleness |
| POST /chat/{match_id}/close | End a match with a reason - sends the kind auto-message |
| POST /safety/block, DELETE /safety/block/{id}, GET /safety/blocks | Blocking |
| POST /safety/report | Reporting (optionally auto-blocks) |

Full interactive docs (request/response schemas, try-it-out) at /docs on any running instance.

## Real bugs found and fixed

Listed because they're the actual evidence that the testing in this project was real, not theater. None of these were caught by inspection - all eight surfaced only once something actually exercised the code:

1. **Photo storage path mismatch.** The storage backend and the static file server computed two different directories for local media. Uploads succeeded but were never servable. Caught by an actual upload-then-fetch round-trip test.
2. **Onboarding redirect loop.** is_complete required a non-empty bio, but the onboarding form didn't enforce filling one in - so a user who skipped bio got bounced between /onboarding and /discover forever. Caught by real-browser Playwright testing, not unit tests. Fixed by requiring a photo instead of a bio, and later hardened further (see #5).
3. **Closure made history unreadable.** Ending a match required an *active* match to read chat history - so closing a conversation made the closure message itself invisible to the person it was meant to inform. Defeated the entire purpose of the feature. Fixed by splitting read access (works on closed matches) from write access (still requires active).
4. **WebSocket handler bypassed dependency injection.** It built its own SessionLocal() instead of using Depends(get_db) like every other endpoint - harmless in production but inconsistent with the rest of the codebase and impossible to test through the standard override pattern. Flagged as a known issue from the very first version of the backend and sat unfixed until the automated test suite made it impossible to ignore.
5. **is_complete could go stale.** It was computed only at profile-write-time. Uploading a photo after creating a profile left the flag permanently wrong until the next profile edit. Fixed by recomputing it from live DB state on every photo upload and delete, not just profile writes.
6. **Alembic's autogenerated downgrade leaked Postgres ENUM types.** Dropping tables didn't drop the CREATE TYPE objects those tables depended on, so downgrading and re-upgrading crashed with "type already exists." Caught by actually testing the downgrade-then-upgrade cycle instead of assuming autogenerate got it right.
7. **N+1 queries in discovery and matches list.** Fetching photos/profiles happened in a per-candidate or per-match loop instead of a single batched query. Fixed and covered by a regression test verifying photos are still attributed to the correct candidate after batching.
8. **next/image couldn't load local dev images at all.** The localhost remote pattern didn't specify a port, and Next.js's image optimizer matches ports exactly - so every image silently failed once real optimization was enabled. Caught by checking naturalWidth on rendered images in a real browser, not just checking the build succeeded.
9. **WebRTC signaling echoed back to the sender.** The WebSocket broadcast helper sends to everyone connected to a match, which is correct for chat messages (the sender's own UI should confirm delivery) but wrong for call signaling - a caller doesn't need their own offer echoed back to themselves, and it was arriving ahead of the real answer in the queue. Fixed by adding an exclude-sender option, used only for signaling.
10. **Video element ref-timing race.** The local/remote `<video>` tags only mounted once a call went active, but `getUserMedia` is async, so the stream state finished updating in an earlier render than the DOM elements existed in - the attach effect fired before there was anything to attach to, and never re-fired afterward. Fixed by always mounting the video elements once a call is active (visibility via CSS, not conditional mounting) so the ref binds immediately and stream updates always have somewhere to land.

## Known limitations

**Blocked on third-party credentials** (a fake version of these would be worse than nothing):
- Email verification (needs SendGrid/Resend/Postmark)
- SMS safety check-in - share a date plan with a trusted contact, auto-alert if you don't check in (needs Twilio)
- Anti-deepfake liveness verification (needs Persona/Onfido/AWS Rekognition Face Liveness) - the single highest-impact missing feature per the original market research

**Not built yet, no external blocker:**
- Admin tooling to review filed reports - they're stored, nobody's looking at them
- Live WebSocket push for match-closed events (currently seen next time the other person polls, not instantly)
- A committed frontend test suite (Playwright scripts were used and caught real bugs during development, but weren't saved into the repo as a running suite)
- CI/CD - the backend test suite exists but nothing runs it automatically on push
- Error monitoring - nothing alerts if production breaks
- Legal docs - no privacy policy or terms of service, a real gap for an app handling location and preference data that can reveal sexual orientation

**Deliberate technical tradeoffs, not oversights:**
- Rate limiting and the WebSocket connection registry are both in-memory and single-process - fine at MVP scale, needs Redis to scale horizontally
- Gender-preference matching does JSON containment filtering in application code rather than at the database level - fine at MVP scale, would need a join table or array column with a GIN index at real scale
- Distance filtering uses the haversine formula in Python rather than PostGIS - same tradeoff
- JWT stored in localStorage, not an httpOnly cookie - standard for this auth pattern, worth revisiting if XSS resistance becomes a priority
- Video calls use free public STUN only, no TURN relay - works on most networks (typical home/office wifi) at $0 cost, but calls on some restrictive networks (certain corporate firewalls, some mobile carrier NATs) won't connect without a TURN server, which is either a paid service (Twilio, Xirsys) or self-hosted (coturn). Config-only addition later, not a rewrite.
- Chat video isn't compressed/transcoded server-side - relies on the client's own recording/upload size, capped at 30MB
- datetime.utcnow() is used throughout (deprecated in Python 3.12). Not fixed, because the DB columns are naive DateTime - switching to timezone-aware datetimes needs a coordinated change, not a find-and-replace

## Roadmap

Done: auth, profiles, matching, real-time chat, safety layer, anti-ghosting closure, photo upload, stories, full frontend, automated backend test suite, Alembic migrations, N+1 query fixes, provider-agnostic storage, Next.js image optimization.

Next, in rough priority order: admin report-review tooling -> committed frontend test suite + CI -> whichever of email verification / SMS check-in / deepfake liveness has credentials available first -> legal docs before any real users touch this.
