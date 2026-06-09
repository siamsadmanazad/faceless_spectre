# Faceless Spectre — CLAUDE.md

This is the project constitution. Read it at the start of every session before writing any code.

---

## What This Is

**Faceless Spectre** is a server-authoritative, 3D, multiplayer web card platform. Players sit at a virtual card table, handle cards with free-hand gestures, hear each other via voice, and appear to each other as floating ghost hands behind masks.

The platform is a **game-agnostic sandbox** first. The first ruleset (Poker) is layered on only after the sandbox itself is enjoyable with no rules.

---

## Core Architecture Principles (Non-Negotiable)

| # | Principle | What it means in practice |
|---|---|---|
| 1 | **Server-authoritative** | Clients send *intent* ("draw the top card"). The server validates, mutates truth, broadcasts results. Clients never compute outcomes. |
| 2 | **Hidden information never leaves the server** | If a card is face-down to you, you receive only `{back}` — never its rank or suit. Not temporarily. Not for animation. Not encrypted. |
| 3 | **State is filtered per-viewer** | Each player gets a personalized view. Player B's view of Player A's hand is a stack of anonymous backs. |
| 4 | **Animation is decorative, never causal** | The server decides the new state; the client plays a pretty animation *afterward*. The shuffle animation never determines the shuffle result. |
| 5 | **Intent in, filtered state out** | The only messages a client sends are intents and presence. The only messages it receives are filtered state + animation commands. |
| 6 | **Deterministic + auditable** | Every mutation is logged with timestamp, actor, and a hash of the resulting deck state — any game can be fully replayed and audited. |
| 7 | **Cheap to run** | Target <40 KB/sec/player game-state bandwidth, thin clients, rooms that idle cheaply. No per-frame server traffic. |

---

## Security Non-Negotiables

- **Never send hidden card data to a client, even temporarily.** The security and visibility-filter tests are sacred — they must pass on every commit. A failure blocks merge.
- **Never use `Math.random()` for shuffles.** Only Node's `crypto` CSPRNG. A test asserts the RNG source.
- **Never trust client-supplied card identities or positions.** The server resolves all references by server-side id.
- **Reject and log every illegal intent.** Unknown actor, wrong seat, illegal state transition — reject silently, log for audit, never corrupt state.

---

## Networking Contract

```
Client → Server   intent messages only
                  (grab, release, draw, multiDraw, cut, shuffle, deal,
                   gesture, place, reveal, chat, presence)

Server → Client   filtered state + animation commands only
                  (personalized view — hidden cards are NEVER included)
```

The `packages/shared` package defines every message type for both directions. **When client and server disagree on a type, `shared` wins.** Update types there first, then both sides.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, React Three Fiber, Three.js, @react-three/drei, Zustand, colyseus.js |
| **Networking** | Colyseus (authoritative rooms, state sync, signaling relay), WebRTC (voice — peer-to-peer mesh) |
| **Backend** | Node.js 20 LTS, TypeScript (strict), Colyseus server, Fastify (HTTP layer) |
| **Storage** | PostgreSQL 16 (durable: users, replays, cosmetics), Redis 7 (ephemeral: presence, room registry, matchmaking, rate-limiting) |
| **Tooling** | pnpm 10 + Turborepo 2, Docker + docker-compose, TypeScript strict, ESLint 8, Prettier 3, Vitest 2, Playwright |
| **Deployment** | Cloudflare CDN (static Next.js client), stateful VM/container host (Colyseus game server — **NOT serverless or edge workers**) |

### Voice Decision
Mesh WebRTC for MVP (suitable for up to ~4–6 players). The Colyseus room is the signaling relay only — audio flows peer-to-peer.
**SFU (mediasoup or LiveKit) is the documented upgrade path but is NOT built in this version.** Rooms are capped at 6 players until the SFU is in place.

---

## Workspace Map

```
faceless-spectre/
├── apps/
│   ├── client/        # Next.js — the browser app (3D table, lobby, HUD)
│   └── server/        # Node.js — Colyseus game server + Fastify HTTP
├── packages/
│   └── shared/        # Types, enums, constants — the protocol contract
├── docker-compose.yml # Local Postgres + Redis
├── .env.example       # Environment variable template
└── CLAUDE.md          # This file
```

---

## Performance Budget

| Metric | Target |
|---|---|
| Game-state bandwidth | < 40 KB/sec/player |
| Client frame rate | ~60 FPS with 4 players in scene |
| Client memory (in-scene) | < 100 MB |
| Presence messages | Throttled + interpolated — never per-frame |

---

## Build Phases

| Phase | Theme | Gate |
|---|---|---|
| **0** | Foundations — clean monorepo + infra | ✅ `pnpm build && pnpm lint` pass; `db:up` connects |
| **1** | Authoritative core — rooms, deck, CSPRNG shuffle, visibility filter (headless) | ✅ Visibility security tests pass |
| **2** | 3D table — render from filtered server state | ✅ 60 FPS idle; two tabs, same room |
| **3** | Free-hand interaction — intents, validation, animation | ✅ Server confirms before animation plays |
| **4** | Presence — ghost hands + masks | ✅ Smooth interpolation within bandwidth budget |
| **5** | Voice — WebRTC over Colyseus signaling | ✅ Peer-to-peer audio; no game-state audio path |
| **6** | Shuffle & deal UX | ✅ Fairness test still passes with style selectors |
| **7** | Replay + anti-cheat audit | ✅ Audit suite in CI; log replays deterministically |
| **8** | Persistence + horizontal scale | ✅ Redis-backed multi-process; reconnection tested |
| **9** | Deploy | ✅ Cloudflare Pages (client) + Fly.io (server); load test script ready |
| **10** | Poker ruleset *(optional, gate: sandbox must be fun first)* | Full hand to showdown; hole cards stay hidden |

---

## Reminders for Claude Code

- Work **one phase at a time**. Verify the Definition of Done before advancing.
- Keep `packages/shared` as the single source of truth — update types there first.
- Commit at every green DoD with conventional commit messages.
- **Write tests as you go**, especially for the shuffle engine and visibility filter — these are correctness- and security-critical.
- When something breaks, identify root cause before fixing. Never use "just make it work" shortcuts.
- The game server is a **stateful, long-lived WebSocket server**. Never deploy it to serverless/edge workers.
- Periodically remind yourself: *"Never send hidden card data to a client, even temporarily."*
- **Never add a `Co-Authored-By` trailer to any commit.** No Claude, no Anthropic, no tool attribution of any kind in git history.
