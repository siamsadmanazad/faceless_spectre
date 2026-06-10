# Faceless Spectre

[![CI](https://github.com/siamsadmanazad/faceless_spectre/actions/workflows/deploy.yml/badge.svg)](https://github.com/siamsadmanazad/faceless_spectre/actions/workflows/deploy.yml)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![Colyseus](https://img.shields.io/badge/Colyseus-0.15-7a5cff)
![Three.js](https://img.shields.io/badge/Three.js-r165-000?logo=threedotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![pnpm](https://img.shields.io/badge/pnpm-10-f69220?logo=pnpm)

> *You sit down at a table draped in dark felt. Across from you, a pair of ghost hands float where a face should be — masked, still, waiting. The deck cuts itself. The cards know who they belong to. Nobody cheats here.*

A **server-authoritative, 3D, multiplayer card sandbox** for the browser. No rules yet — just a table, a deck, and the people around it. The server is the only source of truth: cards shuffle with cryptographic randomness, a hidden hand never reaches an unauthorized client (not briefly, not for animation), and every move is logged for replay and audit.

The first ruleset (Poker) is deliberately deferred. The sandbox has to feel good first.

> **Status:** Active development. The platform (Phases 0–9) is built and tested; the optional Poker ruleset (Phase 10) is next, gated on the sandbox being fun on its own.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Joining a game](#joining-a-game)
- [Controls](#controls)
- [Architecture](#architecture)
- [Security model](#security-model)
- [How it works](#how-it-works) — shuffle · ghost hands · voice · audit · reconnection
- [Project structure](#project-structure)
- [Testing](#testing)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)

---

## Features

- **Server-authoritative core** — clients send *intents* (draw, deal, grab, shuffle…); the server validates, mutates the single source of truth, and broadcasts a per-viewer filtered view. Clients never compute outcomes.
- **Hidden information never leaks** — a per-viewer `@filter` strips `rank`, `suit`, and positional data from any client not entitled to see them. Card IDs are opaque UUIDs, so even the handle reveals nothing. Proven on the live wire by an integration test.
- **Provably fair shuffles** — seeded with 32 bytes from Node's CSPRNG, applied with unbiased Fisher–Yates, and fully replayable from the audit log. `Math.random()` is forbidden and tested.
- **Matchmaking** — one-tap **Quick Play** with strangers, **private tables** shared by code/link, and **join by code**. Public and private rooms coexist.
- **Host controls** — open empty seats to randoms (toggle), lock the table, and kick players. Non-hosts can call a **majority vote** to open seats.
- **Spectators** — watch any table without taking a seat; spectators see only public state and can't act.
- **Resilient seats** — a dropped player's seat and cards are held for 2 minutes; a stable per-device ID lets them reclaim the seat even after reopening the invite link on a new connection.
- **Voice** — peer-to-peer WebRTC mesh with global and per-player mute; audio never touches the game server.
- **Ghost-hand presence** — players appear as floating masked hands, interpolated at 20 Hz within a < 40 KB/s bandwidth budget.
- **Cheap to run** — event-driven server (no per-frame traffic) and a render loop that fully pauses when the browser tab is inactive.

---

## Quick start

**Prerequisites:** Node 20+, pnpm 10+, Docker Desktop.

```bash
# 1. Clone and install
git clone https://github.com/siamsadmanazad/faceless_spectre.git
cd faceless_spectre
pnpm install

# 2. Start Postgres + Redis
pnpm db:up

# 3. Run the game server and client together
pnpm dev
#   → Game server  http://localhost:2567
#   → Client       http://localhost:3000
```

Then open **http://localhost:3000**, pick a name, and either **Quick Play** or **Create Private Table**. To play with a second tab, copy the invite link from the in-room panel and open it in another tab — you'll be at the same table, seeing each other's moves in real time.

No internet required for local play.

> **Tip:** the local Redis volume persists between runs. If matchmaking ever behaves oddly after many restarts, clear stale room registrations with `pnpm db:down && pnpm db:up` (or `docker compose down -v` for a full reset).

---

## Joining a game

The lobby offers three ways in:

| Flow | What it does |
|---|---|
| **⚡ Quick Play** | Drops you into any open public table with a free seat, or spins up a new one. The "play now" path. |
| **+ Create Private Table** | Pick a size (2–6) and get a **code + shareable link**. Only people you invite can join. |
| **Join by Code** | Enter a code (or open a link) to join a specific table — as a player, or **👁 Watch** to spectate. |

Inside a room:

- The **invite panel** shows the room code and a one-click copy-link button.
- The **host** (whoever created the table) can toggle *Allow randoms*, *Lock table*, and *Kick* players.
- Any seated player can start a **vote to open empty seats** to randoms; a majority enables it. The host can also just toggle it directly.
- Each player has a local **mute** control; the host additionally sees **kick**.

Your cards show their faces. Everyone else's hand shows only backs. Other players appear as glowing ghost hands, tracked in real time.

---

## Controls

| Key / Input | Action |
|---|---|
| `D` | Draw a card from the deck into your hand |
| `R` | Open the shuffle selector (pick style + intensity) |
| `Enter` | Deal 5 cards to every seated player |
| `M` | Mute / unmute your microphone |
| `Escape` | Release the grabbed card |
| Click a hand card | Grab it (lifts and glows blue); click again to release |
| Click a placed card | Pick it up from the table |
| Click the table | Release the grabbed card |
| Mouse drag | Orbit the camera |
| Scroll | Zoom in / out |

Spectators can watch and orbit the camera but have no actions.

---

## Architecture

| Layer | Tech | Role |
|---|---|---|
| **Client** | Next.js 14, React Three Fiber, Zustand | 3D rendering, local UI, sending intents |
| **Server** | Node 20, Colyseus, Fastify | Authoritative game state, per-viewer filtering, validation, matchmaking |
| **Shared** | TypeScript types & constants | Single source of truth for the protocol |
| **Storage** | PostgreSQL (durable), Redis (ephemeral) | Audit/replays · presence, room registry, scaling |

```
Client ──intent──▶ Server ──filtered state──▶ Client
        (grab, draw, shuffle, vote…)   (backs for hidden cards, faces for yours)
```

The only messages a client sends are intents and presence. The only messages it receives are a personalized, filtered state plus cosmetic animation commands — hidden cards are never part of either.

---

## Security model

The visibility guarantee is the project's spine, and it's enforced in three layers:

1. **Filtered fields.** The Colyseus schema marks `rank`, `suit`, and `position` with a per-viewer `@filter`. A client that isn't the owner (or for which the card isn't public) simply never receives those bytes.
2. **Opaque identifiers.** Card IDs are random UUIDs, not derived from the face — so even an unfiltered field like the ID reveals nothing about what a card is.
3. **CSPRNG-only shuffles.** Every shuffle is seeded from `crypto.randomBytes`; `Math.random()` is forbidden and asserted against in tests.

These aren't aspirational. A dedicated integration test boots a real server, connects real clients over a socket, and asserts on the **decoded wire state** that a non-owner receives backs (empty `rank`/`suit`/`position`) while the owner sees faces. It runs in CI on every push.

---

## How it works

### The shuffle

When you call for a shuffle, the table does it — not you. The server draws on OS-level entropy and rearranges all 52 cards before anyone has any indication of the new order. The animation you see — riffle, wash, cut, casino — is pure theatre; the new order is decided before the first card visually moves, and the style you pick changes only what it looks like.

Every shuffle is logged with its entropy seed, the actor, and a SHA-256 fingerprint of the order before and after. Because the shuffle is a deterministic function of its seed, the whole sequence — from a room's first card to its last — can be replayed and verified deal by deal, without ever revealing hidden card data.

### Ghost hands

Other players appear as translucent floating hands — palm, fingers, thumb — each lit in a seat-specific colour, with a torus mask floating above. A hand brightens on grab and settles to a dim idle glow on release. Positions broadcast at 20 Hz (50 ms) and interpolate smoothly on the receiving end, staying within the < 40 KB/s-per-player budget. Presence is relayed, never written to game state — it's ephemeral, not history. A disconnecting player's hand vanishes immediately.

### Voice

Players hear each other over browser-native WebRTC; audio flows directly between browsers. Colyseus relays only signaling (SDP offers/answers, ICE candidates) — once a peer connection is up, the server is out of the audio path. The mesh opens one connection per pair (15 at the 6-player cap), STUN-only for NAT traversal. Mute is instant (it disables the local track without tearing down connections), and you can also mute individual players locally. Voice and the render loop both suspend while the tab is inactive.

> **SFU upgrade path:** for more than ~6 players, the documented next step is swapping the mesh for a selective forwarding unit (mediasoup or LiveKit). The Colyseus signaling relay doesn't need to change.

### Audit & replay

Every deck operation — shuffle, cut, draw, deal — is logged with a timestamp, the acting player, the operation, a seed (for shuffles), and SHA-256 hashes of the deck before and after. Rejected intents (illegal moves, rate-limit hits) are recorded with their error codes. The `verifyReplay` routine re-applies the whole log and recomputes each after-hash; any mismatch — a tampered hash, a missing seed, a modified cut — is caught with the failing entry index.

**Endpoint:** `GET /rooms/:roomId/audit` returns the deck history, rejected intents, and an inline `verification` object. It reads the in-memory store for live rooms and falls back to the `room_audits` Postgres table for closed ones.

### Reconnection & seat reclaim

If a tab refreshes or a network drops, the table holds the player's seat **and their cards** for two minutes. Reconnecting within that window — even on a **new connection**, via a stable per-device ID stored in `localStorage` — restores the exact seat and hand, with card ownership and host role re-keyed to the new session. After the window, the seat clears and the cards return to the table.

For horizontal scale, Colyseus runs with `RedisPresence` + `RedisDriver`, so multiple server processes share one room registry and matchmaking works behind a load balancer.

---

## Project structure

```
faceless-spectre/
├── apps/
│   ├── client/     # Next.js — 3D table, lobby, HUD, voice (browser)
│   └── server/     # Node — Colyseus rooms + Fastify HTTP/matchmaking
├── packages/
│   └── shared/     # Protocol contract: types, enums, constants
├── scripts/        # load test, stale-Chrome reaper
├── docker-compose.yml
└── CLAUDE.md       # Engineering constitution (read before contributing)
```

`packages/shared` is the single source of truth for the client↔server protocol. When the two sides disagree on a type, `shared` wins — update it there first.

---

## Testing

```bash
pnpm test                                   # all workspaces
pnpm --filter @faceless-spectre/server test # server only
pnpm --filter @faceless-spectre/client test # client only
```

The Vitest suite covers the correctness- and security-critical paths:

- **Visibility on the real wire** — a live server + decoded client state proving hidden cards never leave the server.
- **Shuffle** — CSPRNG source, unbiased distribution, deterministic replay.
- **State machine & replay verifier** — legal transitions and audit-log consistency.
- **Matchmaking** — Quick Play co-location, private/backfill visibility, host permissions, kick, locked rooms, spectators, the backfill vote.
- **Reconnection & seat reclaim** — held seats, card retention, cross-session adoption.
- **Client store** — batched state application and the face-visibility helper.

CI runs lint (server + client), the server type-check build, and both test suites on every push to `main` before deploying.

### Load test

```bash
pnpm load-test                                          # against local dev
SERVER_URL=https://faceless-spectre.fly.dev pnpm load-test  # against prod
```

Connects 4 simulated players for 10 seconds and asserts each stays under the 40 KB/s game-state bandwidth budget.

---

## Deployment

The client is a static Next.js export on **Cloudflare Pages**. The game server (Colyseus + Fastify) is a stateful, long-lived Docker container on **Fly.io** — it cannot be serverless or edge-deployed.

**CI/CD (GitHub Actions).** Every push to `main` lints, type-checks, and tests, then:

1. Deploys the server image to Fly.io (`flyctl deploy --remote-only`).
2. Builds the Next.js static export and ships it to Cloudflare Pages (Wrangler).

**One-time setup:**

```bash
# Server (Fly.io)
fly apps create faceless-spectre
fly postgres create --name faceless-spectre-db --region ord
fly postgres attach --app faceless-spectre faceless-spectre-db   # sets DATABASE_URL
fly ext redis create --name faceless-spectre-redis               # sets REDIS_URL

# GitHub Actions secrets:
#   FLY_API_TOKEN          → fly tokens create deploy
#   CLOUDFLARE_API_TOKEN   → Cloudflare dashboard → API Tokens
#   CLOUDFLARE_ACCOUNT_ID  → Cloudflare dashboard (right sidebar)
#   NEXT_PUBLIC_SERVER_URL → https://faceless-spectre.fly.dev
```

See `.env.example` for the full list of environment variables.

---

## Roadmap

| Phase | Theme | Status |
|---|---|---|
| 0 | Monorepo foundations (pnpm, Turborepo, Docker) | ✅ |
| 1 | Authoritative core — rooms, deck, CSPRNG shuffle, visibility filter | ✅ |
| 2 | 3D table — React Three Fiber, lobby, live deck rendering | ✅ |
| 3 | Free-hand interaction — grab, place, validation, rate limiting | ✅ |
| 4 | Presence — ghost hands + masks at 20 Hz | ✅ |
| 5 | Voice — WebRTC mesh over Colyseus signaling | ✅ |
| 6 | Shuffle & deal UX — style selector, animation | ✅ |
| 7 | Replay + anti-cheat audit | ✅ |
| 8 | Persistence + horizontal scale (Redis-backed) | ✅ |
| 9 | Deploy — Cloudflare Pages + Fly.io | ✅ |
| — | Matchmaking, host controls, spectators, seat reclaim | ✅ |
| 10 | Poker ruleset *(only once the sandbox is fun)* | ⬜ |

---

## Tech stack

- **Frontend:** Next.js 14 (App Router), React 18, React Three Fiber, Three.js, @react-three/drei, Zustand, colyseus.js
- **Networking:** Colyseus (authoritative rooms, state sync, signaling relay), WebRTC mesh (voice)
- **Backend:** Node.js 20, TypeScript (strict), Colyseus server, Fastify, @colyseus/schema v2
- **Storage:** PostgreSQL 16, Redis 7
- **Tooling:** pnpm 10, Turborepo 2, Vitest, ESLint, Prettier, Docker

---

## Contributing

This project is in active development. Please open an issue to discuss a change before submitting a PR. Read [`CLAUDE.md`](./CLAUDE.md) first — it's the engineering constitution, and the security/visibility invariants in it are non-negotiable.

Before pushing: `pnpm lint && pnpm build && pnpm test` should all pass.
