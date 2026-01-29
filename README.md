# Witchat

Ephemeral messaging that mimics **digital orality** — chat as a spoken stream, not a documented archive. Aesthetic: techno-occult, dark, liquid, atmospheric.

## Philosophy

Like oral tradition, conversations exist in the moment. New users joining don't receive prior context — they walk into a conversation already in progress. Messages fade like memories, with only the most recent staying sharp.

## Features

- **The Stream (Rule of Three)** — Latest 3 messages are fully visible; older ones blur and fade progressively
- **Identity (The Glamour)** — Anonymous by default (random color + sigil). Optionally reveal handle and tag
- **Context Engine** — Sentiment analysis shifts room atmosphere (calm / neutral / intense)
- **Activity Log** — See joins, leaves, reveals, and who's taking notes
- **Transparent Copying** — Others see when you copy text (taking a note)
- **Orality** — New users start fresh; existing users keep context on refresh
- **Mobile Responsive** — Touch-friendly, works as PWA

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS (obsidian/purple palette)
- **Animations:** Framer Motion
- **Real-time:** Socket.io
- **State:** Zustand
- **Persistence:** Redis (optional, falls back to in-memory)

## Run Locally

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000) with Socket server on port 4001.

## Production

```bash
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com npm run build
npm start
```

Or use the systemd services for persistent deployment.

## Roadmap

### Near-term
- **Visible DMs (Crosstalk)** — DM participants visible, text obscured to others
- **Multiple Rooms** — Discoverable and secret rooms for scaling
- **Topic Subscriptions** — Follow hashtags/keywords for highlighted messages

### Future
- **Presence Ghosts** — Faded traces of recently departed users
- **Ephemeral Voice Notes** — Audio that plays once, no replay
- **Message Resonance** — Popular messages linger longer organically
- **Ambient Soundscape** — Audio cues for presence, typing, mood
- **Summoning** — Gently ping idle users back
- **Time-bound Rooms** — Rooms that only exist during certain hours

## License

MIT
