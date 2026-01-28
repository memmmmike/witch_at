# Witchat

Ephemeral messaging that mimics **digital orality** — chat as a spoken stream, not a documented archive. Aesthetic: techno-occult, dark, liquid, atmospheric.

## Tech stack

- **Framework:** Next.js 14+ (App Router, TypeScript)
- **Styling:** Tailwind CSS (obsidian/purple palette)
- **Animations:** Framer Motion (fade in, dissipate out)
- **Real-time:** Socket.io (custom server)
- **State:** Zustand (client message stream)
- **Logic:** In-memory only (no DB); optional Redis later

## MVP features

1. **The Stream (Rule of Three)** — Only the latest 3 messages are shown. When a 4th arrives, the oldest dissipates (blur + fade out).
2. **Identity (The Glamour)** — Anonymous by default (random hex color). Toggle "Reveal Identity" to set a text handle.
3. **Context Engine (Atmosphere)** — Sentiment analysis on the server; room background gradient shifts by mood (calm / neutral / intense).

## Run locally

Next.js and the Socket.io server run **separately** so dev gets clean HMR (no 404 hot-update / full reloads).

1. **First time:** copy env example and install deps.

   ```bash
   cp .env.local.example .env.local
   npm install
   ```

2. **Dev:** one command runs both Next (port 3000) and Socket (port 4001).

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000). The app connects to the Socket server at `NEXT_PUBLIC_SOCKET_URL` (default `http://localhost:4001`).

To run Next and Socket in **separate terminals** instead:

- `npm run dev:next` — Next.js only (port 3000)
- `npm run dev:socket` — Socket server only (port 4001)

## Scripts

- `npm run dev` — Next dev + Socket server (recommended)
- `npm run dev:next` — Next.js only
- `npm run dev:socket` — Socket server only
- `npm run build` — Build Next.js
- `npm start` — Production: Next + Socket (run after `npm run build`)

## Project layout

- `app/` — Next.js App Router (layout, page, globals)
- `components/` — ChatRoom, Glamour (identity), StreamMessage
- `contexts/` — SocketProvider (socket + mood + identity)
- `lib/` — socket client, Zustand stream store
- `socket-server.js` — Standalone Socket.io server (presence, mood, sentiment)
