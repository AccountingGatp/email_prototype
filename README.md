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

## Features (Accounting SOP)

1. **Status taxonomy** — To Respond / Waiting On Them / Done (hybrid: Gmail labels + portal write-back)  
2. **Open-items inbox** — default excludes Done + noise; filters by client, category, owner, age bucket  
3. **SLA** — escalate To Respond after N business days (default 2)  
4. **Dashboard KPIs** — To Respond, Waiting, Overdue, Closed this week, Unfiled, noise check, 7-day trend  
5. **Roles** — admins see all; members see assigned + unassigned  
6. **Metadata-first** — sync stores snippet/labels/status; open full mail in Gmail  
7. **Sync** — on app open (once per tab session) + manual **Sync now** (no background interval)

Gmail status labels: `To Respond`, `Waiting On Them`, `Done`.  
OAuth refresh token should include `gmail.modify` for label write-back (plus readonly for sync).

## Connecting a real mailbox

Set provider in **Settings** (or `backend/.env`) and add credentials:

```env
PROVIDER=gmail
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
SHARED_MAILBOX_EMAIL=accounting@gatpsolutions.com
```

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
