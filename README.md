# Phantom Table

> *You sit down at a table draped in dark felt. Across from you, a pair of ghost hands float where a face should be — masked, still, waiting. The deck cuts itself. The cards know who they belong to. Nobody cheats here.*

A server-authoritative, 3D multiplayer card sandbox built for the browser. No rules yet — just a table, a deck, and the people around it. Rules come later, once the table itself feels alive.

---

## What it is

Phantom Table is a **game-agnostic 3D card platform**. The server is the only source of truth — cards shuffle with cryptographic randomness, hidden hands never touch an unauthorized client (not even briefly, not even for animation), and every move is logged for replay and audit.

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

| Key | Action |
|---|---|
| `D` | Draw a card from the deck into your hand |
| `R` | Shuffle the deck (cryptographically random) |
| `Enter` | Deal 5 cards to every player at the table |
| Mouse drag | Orbit the camera around the table |
| Scroll | Zoom in / out |

Your cards show their faces. Everyone else's hand shows only backs.

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

## The shuffle system

The shuffle is the fairness foundation. It was designed to be provably unbiased and auditable:

1. **Seed generation** — `crypto.randomBytes(32)` produces 32 bytes of entropy from the OS. This is hashed to a 64-character hex seed that is stored in the deck history.
2. **Fisher–Yates permutation** — For each position `i` from the last card down to 1, the algorithm draws a fresh 4-byte uint32 from `crypto.randomBytes(4)` and maps it to a uniform position `j ≤ i` using modulo reduction. This produces exactly one of 52! possible permutations with equal probability.
3. **Style is cosmetic** — A player can request a "riffle", "wash", "cut", or "casino" style shuffle. These parameters travel to the client as an animation hint only. The underlying permutation is always the same unbiased Fisher–Yates regardless of which style is chosen.
4. **Audit trail** — Every shuffle appends an entry to `DeckTruth.history` with: timestamp, actor session ID, the seed, and SHA-256 hashes of the deck order before and after. The full game can be replayed from this log.
5. **Test coverage** — A statistical test runs the shuffle 10,000 times over a 5-card deck and asserts each card appears in each position within ±15% of the expected frequency. A separate test asserts `Math.random` is never called.

The deck order lives only in `DeckTruth` on the server — a plain TypeScript object that is never serialized or included in any Colyseus schema.

---

## Card identity system

Every card in the deck has a **stable, server-assigned string ID** (e.g. `"AH"` for Ace of Hearts, `"10S"` for Ten of Spades). These IDs are assigned once at room creation and never change.

**Why stable IDs matter for skill and memory:**

- A client can track which card IDs it has seen revealed on the table and remember them. A skilled player who pays attention can deduce what remains in the deck.
- Because the server only sends `rank` and `suit` to authorized viewers (via `@filter`), a player can only see a face when they are entitled to — when the card is theirs (`OWNER_ONLY`) or when it has been revealed publicly (`PUBLIC`).
- The card state machine (`DECK → DRAWN → HAND → SELECTED → MOVING → PLACED → REVEALED`) ensures revealed cards cannot be silently flipped back to hidden. Once shown, the ID is public knowledge for all connected clients.
- The deck order is never transmitted. Clients receive only `deckSize` — an integer. Counting cards from what has been seen is therefore a pure skill/memory exercise: the server guarantees there is no information leak, and the player's advantage comes entirely from attention, not from client-side inspection.

This design makes Phantom Table suitable for games where hidden information and memory are core mechanics (Poker, Rummy, Blackjack) — the server enforces the rules of secrecy so the game's skill ceiling is real.

---

## Roadmap

| Phase | Theme | Status |
|---|---|---|
| 0 | Monorepo foundations (pnpm, Turborepo, Docker) | ✅ Done |
| 1 | Authoritative core — rooms, deck, CSPRNG shuffle, visibility filter | ✅ Done |
| 2 | 3D table — React Three Fiber, lobby, live deck rendering | ✅ Done |
| 3 | Free-hand interaction — grab, place, fan, rotate | ⬜ Next |
| 4 | Presence — ghost hands + masks in real time | ⬜ |
| 5 | Voice — WebRTC over Colyseus signaling relay | ⬜ |
| 6 | Shuffle & deal UX — style selector, animation | ⬜ |
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
