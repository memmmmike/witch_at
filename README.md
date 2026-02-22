# Witch@

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-blue.svg)](https://socket.io/)

Ephemeral messaging that mimics **digital orality** — chat as a spoken stream, not a documented archive.

<!-- TODO: Add screenshot.png -->

## Philosophy

Like oral tradition, conversations exist in the moment. New users joining don't receive prior context — they walk into a conversation already in progress. Messages fade like memories, with only the most recent staying sharp.

## Features

- **The Stream (Rule of Three)** — Latest 3 messages are fully visible; older ones blur and fade
- **Identity (The Glamour)** — Anonymous by default (random color + sigil). Optionally reveal yourself
- **Context Engine** — Sentiment analysis shifts room atmosphere (calm / neutral / intense)
- **Multiple Rooms** — Public and secret rooms with presence tracking
- **Crosstalk (Visible DMs)** — Others see you're whispering, but not what you say
- **Presence Ghosts** — Faded traces of recently departed users
- **Message Resonance** — Copied messages glow with resonance
- **Summoning** — Gently ping idle users back to the conversation

## Roadmap

- **Topic Subscriptions** — Follow hashtags/keywords for highlighted messages
- **Ambient Soundscape** — Audio cues for typing and mood shifts
- **Ephemeral Voice Notes** — Audio that plays once, no replay
- **Time-bound Rooms** — Rooms that only exist during certain hours

---

<details>
<summary><strong>Development</strong></summary>

### Tech Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Framer Motion · Socket.io · Zustand · Redis (optional)

### Run Locally

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Opens at [localhost:3000](http://localhost:3000) with Socket server on port 4001.

### Production

```bash
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com npm run build
npm start
```

Systemd service files included for persistent deployment.

</details>

## License

MIT
