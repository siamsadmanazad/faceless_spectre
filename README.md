# Faceless Spectre

> *You sit down at a table draped in dark felt. Across from you, a pair of ghost hands float where a face should be — masked, still, waiting. The deck cuts itself. The cards know who they belong to. Nobody cheats here.*

A server-authoritative, 3D multiplayer card sandbox built for the browser. No rules yet — just a table, a deck, and the people around it. Rules come later, once the table itself feels alive.

---

## What it is

Faceless Spectre is a **game-agnostic 3D card platform**. The server is the only source of truth — cards shuffle with cryptographic randomness, hidden hands never touch an unauthorized client (not even briefly, not even for animation), and every move is logged for replay and audit.

The first ruleset (Poker) is planned but deliberately deferred. The sandbox has to feel good first.

Players appear to each other as **floating ghost hands behind ornate masks** — no avatars, no voice clips of faces, just hands and the table between them.

---

> *Screenshot / demo coming soon*

---

## How to run locally

**Prerequisites:** Node 20+, pnpm 10+, Docker Desktop

```bash
# 1. Clone and install
git clone https://github.com/siamsadmanazad/faceless_spectre.git
cd faceless_spectre
pnpm install

# 2. Start Postgres + Redis
pnpm db:up

# 3. Start the game server and client
pnpm dev
# → Game server  http://localhost:2567
# → Client       http://localhost:3000

# 4. Open two browser tabs to localhost:3000
#    Enter your name → New Table → share the URL with tab 2
#    You're now at the same table, seeing each other's moves in real time
```

No internet required. Fully offline.

---

## Controls

| Key / Input | Action |
|---|---|
| `D` | Draw a card from the deck into your hand |
| `R` | Shuffle the deck (cryptographically random) |
| `Enter` | Deal 5 cards to every player at the table |
| Click a hand card | Grab it (lifts and glows blue) |
| Click the table / `Escape` | Release the grabbed card |
| Click a placed card | Pick it up from the table |
| `R` | Open the shuffle selector (pick style + intensity) |
| `M` | Mute / unmute your microphone |
| Mouse drag | Orbit the camera around the table |
| Scroll | Zoom in / out |

Your cards show their faces. Everyone else's hand shows only backs. Other players appear as glowing ghost hands — their movements tracked in real time at 20 Hz.

---

## Architecture at a glance

| Layer | Tech | Role |
|---|---|---|
| **Client** | Next.js 14, React Three Fiber, Zustand | 3D rendering, local UI, sending intents |
| **Server** | Node 20, Colyseus, Fastify | Authoritative game state, visibility filtering, validation |
| **Shared** | TypeScript types & constants | Single source of truth for the protocol |
| **Storage** | PostgreSQL (durable), Redis (ephemeral) | Replays & cosmetics / presence & scaling |

```
Client ──intent──▶ Server ──filtered state──▶ Client
         (grab, draw, shuffle…)    (backs for hidden cards, faces for yours)
```

---

## Security model

- **Hidden cards never leave the server.** The `@filter` decorator on the Colyseus schema strips `rank` and `suit` from any client not entitled to see them — not temporarily, not for animation, not at all. This is tested on every commit.
- **Shuffles use Node's CSPRNG.** `Math.random()` is explicitly forbidden and tested. Every shuffle is seeded with 32 bytes from `crypto.randomBytes`, applied with an unbiased Fisher–Yates, and the before/after hash is logged to the audit trail.

---

## The shuffle

When you call for a shuffle, the table does it — not you. The server draws on OS-level entropy and rearranges all 52 cards before anyone at the table has any indication of the new order. There is no way to predict the result before it happens, no way to inspect it without the audit log, and no way to fake it.

The animation you see — riffle, wash, cut, casino style — is pure theatre. The new order is already decided before the first card visually moves. The style you choose changes only what it looks like.

Every shuffle is logged: entropy seed, actor, and a fingerprint of the order before and after. If anyone ever claims the table cheated, the full sequence from the room's first card to its last can be replayed and verified, deal by deal.

---

## Ghost hands

Other players appear as translucent floating hands — a palm, four fingers, a thumb — each lit in a seat-specific colour. A torus mask floats above each hand. When a player grabs a card, their hand brightens. When they let go, it settles back to a dim idle glow.

Hand positions are broadcast at 20 Hz (50 ms intervals) and smoothly interpolated on the receiving end, keeping motion fluid within the bandwidth budget of <40 KB/s per player. The server relays presence directly without writing it to game state — it is ephemeral data, not history.

When a player disconnects, their ghost hand vanishes immediately.

---

## Shuffle styles

Pressing `R` (or the Shuffle button) opens a small panel before anything happens. You pick a style — Overhand, Riffle, Wash, Split, or Casino — and an intensity level. Click Shuffle (or press Enter) and the deck animates accordingly: riffle tilts, overhand stutters, wash sweeps sideways, split pivots on its Y axis, casino spins full rotations. Deal briefly compresses the deck as cards leave.

The animation is pure theatre. The new card order is decided by cryptographic randomness before the first card visually moves — the style chosen changes only what it looks like. The fairness test suite asserts that `Math.random` is never called during any style, and that the position distribution across 3,000 shuffles stays within 3× the expected frequency for every card/position pair.

---

## Voice

Players hear each other via browser-native WebRTC — audio flows directly between browsers without touching the game server. Colyseus relays only the signaling messages (SDP offers, answers, ICE candidates); once a peer connection is established, the server is out of the audio path entirely.

The mesh topology opens one `RTCPeerConnection` per pair of players. At up to 6 players that is 15 connections total — manageable for an MVP. STUN-only (Google public STUN) handles most NAT setups without a TURN relay.

Press `M` (or click the button in the HUD) to mute. Muting disables the local audio track without closing any peer connections — unmuting is instant.

**SFU upgrade path:** the documented next step for >6 players is replacing the mesh with a selective forwarding unit (mediasoup or LiveKit). The signaling relay in Colyseus does not need to change for that upgrade.

---

## The memory game

Every card carries a permanent identity. It doesn't change as it moves between the deck, your hand, and the table. When you draw the Ace of Hearts, that card remains the Ace of Hearts whether it's sitting face-down in front of you or eventually turned up for everyone to see.

The server never tells you what's in the deck — only that there are *N* cards left. What you know about what remains is exactly what you've been shown. That's deliberate. Counting, remembering, and reasoning about what's left is the skill the game is built on.

Once a card has been revealed, it stays revealed. The server enforces the blinds; there's no peeking. Your advantage comes entirely from paying attention — not from the client.

---

## Roadmap

| Phase | Theme | Status |
|---|---|---|
| 0 | Monorepo foundations (pnpm, Turborepo, Docker) | ✅ Done |
| 1 | Authoritative core — rooms, deck, CSPRNG shuffle, visibility filter | ✅ Done |
| 2 | 3D table — React Three Fiber, lobby, live deck rendering | ✅ Done |
| 3 | Free-hand interaction — grab, place, rate limiting | ✅ Done |
| 4 | Presence — ghost hands + masks in real time (20 Hz, <40 KB/s) | ✅ Done |
| 5 | Voice — WebRTC over Colyseus signaling relay | ✅ Done |
| 6 | Shuffle & deal UX — style selector, animation | ✅ Done |
| 7 | Replay + anti-cheat audit | ⬜ |
| 8 | Persistence + horizontal scale (Redis-backed) | ⬜ |
| 9 | Deploy — Cloudflare (client) + stateful host (server) | ⬜ |
| 10 | Poker ruleset *(only after the sandbox is fun)* | ⬜ |

---

## Stack

- **Frontend:** Next.js 14 (App Router), React Three Fiber, Three.js, @react-three/drei, Zustand
- **Networking:** Colyseus (authoritative rooms + state sync), WebRTC mesh (voice — Phase 5)
- **Backend:** Node.js 20, TypeScript strict, Colyseus server, Fastify
- **Storage:** PostgreSQL 16, Redis 7
- **Tooling:** pnpm 10, Turborepo 2, Vitest, Playwright, ESLint, Prettier, Docker

---

## Contributing

This project is in active development. If you want to contribute, open an issue first to discuss the change.

---

*Built with [Claude Code](https://claude.ai/claude-code).*
