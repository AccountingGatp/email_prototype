# InboxLens — Shared Client Email Tracking System

Web dashboard for a shared inbox (support@ / sales@). Tracks who replied, when, what they said, plus suffix/tag filtering.

## Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind, shadcn/ui
- **Backend:** Express, MongoDB (Mongoose), JWT auth, Socket.IO
- **Email providers:** Demo (seeded + simulated sync), Gmail API stub, Microsoft Graph stub

## Quick start

```bash
# Backend (port 4000)
cd backend
npm install
npm run dev

# Frontend (port 3000) — new terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and sign in:

| Email | Password |
|-------|----------|
| alex@company.com | password123 |
| jordan@company.com | password123 |
| sam@company.com | password123 |
| casey@company.com | password123 |

## Features

1. **Unified inbox** — thread list + full conversation timeline  
2. **Suffix / tags** — detects `support+billing@…` plus-addressing; create/edit/delete tags; bulk-apply  
3. **Reply tracking** — Replied / Not replied / Replied by someone else / Needs follow-up; who, when, body  
4. **Unanswered alerts** — configurable hour threshold + in-app notifications  
5. **Filters & search** — tag, status, replier, sender, keyword  
6. **Team view** — per-person replies + leaderboard (today / week); manual assignment  
7. **Overview** — volumes, reply %, avg reply time, tag breakdown, oldest unanswered  

## Connecting a real mailbox

Set provider in **Settings** (or `backend/.env`) and add credentials:

```env
# Gmail
# provider=gmail via Settings UI, then:
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=

# Microsoft 365
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
SHARED_MAILBOX_EMAIL=support@company.com
```

Provider adapters live in `backend/src/providers/index.js`. Wire `googleapis` / `@microsoft/microsoft-graph-client` into `fetchNewMessages()` and map messages into the shape expected by `upsertIncomingMessage`.

Webhook endpoint (no auth in demo): `POST /api/webhooks/email`

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/threads` | List/filter threads |
| GET | `/api/threads/:id` | Thread + messages |
| POST | `/api/threads/:id/reply` | Record team reply |
| GET/POST/PATCH/DELETE | `/api/tags` | Tag CRUD + bulk-apply |
| GET | `/api/dashboard/overview` | Dashboard stats |
| GET | `/api/dashboard/team` | Leaderboard |
| POST | `/api/sync` | Pull provider messages |

Real-time: Socket.IO events `inbox:sync`, `thread:updated`, `notification`.
