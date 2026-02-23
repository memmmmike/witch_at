# Witchat

Anonymous ephemeral chat with ambient presence.

## Slash Commands

- `/clear` — clear stream
- `/help` — show help
- `/anon` — go anonymous
- `/id` — show identity
- `/mood` — show atmosphere
- `/copy` — copy latest message
- `/whisper` — quieter message
- `/summon` — ping someone
- `/away` / `/back` — presence
- `/subscribe <topic>` — follow keyword
- `/unsub <topic>` — unfollow
- `/topics` — list subscriptions
- `/topic-sound on|off` — toggle sound
- `/topic-notify on|off` — browser notifications

## Topic Subscriptions

Keywords (not just hashtags) trigger:
- Amber highlight on message
- Toast notification (top-right)
- Sound (if `/topic-sound on`)
- Browser notification (if `/topic-notify on`)

Stored in localStorage, persists across sessions.

## Architecture

- **Frontend**: Next.js on port 3000
- **Socket server**: socket-server.js on port 4001
- **Start**: `npm run dev` (both) or `npm run start` (production)

## GitHub

- Repo: github.com/memmmmike/witch_at
- Topics: chat, realtime, websocket, nextjs, socketio, anonymous, ephemeral
