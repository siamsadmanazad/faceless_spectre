# Phantom Table — Build Guide & Roadmap

**A step-by-step playbook for building a server-authoritative, 3D, multiplayer web card platform using Claude Code CLI.**

> This document contains **no code**. It is a sequence of phases, decisions, definitions of done, and ready-to-paste prompts. Hand it to Claude Code one phase at a time. Build the *table, shuffle, and draw* before you build any game's rules.

---

## 0. How to Use This Document

1. Read the **Architecture Principles** and **Tech Stack** sections once, fully.
2. Work **phase by phase**. Do not skip ahead. Each phase has a *Goal*, *Steps*, *Definition of Done (DoD)*, and one or more *Claude Code Prompts*.
3. Paste each prompt into Claude Code, let it work, then verify against the DoD before moving on.
4. Keep a `CLAUDE.md` file at the repo root (Phase 0 creates it). It is the single most important file for keeping Claude Code aligned across sessions.
5. Commit after every green DoD. Small commits make Claude Code far more effective and make rollbacks painless.

**Golden rule of this project:** the server is the only source of truth. Any time you are tempted to put card identity, deck order, or another player's hidden hand on the client, stop. That is a cheating vector.

---

## 1. Architecture Principles (Read First)

These constraints shape every decision below. Repeat them to Claude Code often.

| Principle | What it means in practice |
|---|---|
| **Server-authoritative** | Clients send *intent* ("I want to draw the top card"). The server validates, mutates truth, and broadcasts results. Clients never compute outcomes. |
| **Hidden information never leaves the server** | A client must never receive data it isn't allowed to see — not even encrypted, not even "just for animation." If a card is face-down to you, you receive only `{back}`, never its rank/suit. |
| **State is filtered per-viewer** | The server sends each player a *personalized* view of the world. Player A's view of Player B's hand is a stack of anonymous backs. |
| **Animation is decorative, never causal** | The server decides the new order; the client plays a pretty animation *afterward*. The shuffle animation never determines the shuffle result. |
| **Intent in, state out** | The only messages a client may send are intents and presence (hand position, gesture, voice). The only messages a client receives are filtered state + animation commands. |
| **Deterministic + auditable** | Every mutation is logged with a timestamp, actor, and a hash of resulting deck state, so any game can be fully replayed and audited. |
| **Cheap to run** | Target small payloads (<40 KB/sec/player), thin clients, and rooms that idle cheaply. Avoid per-frame server traffic. |

---

## 2. Recommended Tech Stack (with rationale)

The original spec listed Socket.IO + a "Colyseus-style" room system. This guide recommends committing to **Colyseus as the authoritative framework** rather than rolling your own on top of raw Socket.IO, because Colyseus already solves the three hardest parts of this project: room lifecycle, schema-based state synchronization, and — critically — **per-client state filtering**, which is exactly the mechanism that keeps hidden cards hidden.

### Frontend (client)
- **Next.js (App Router)** — routing, lobby pages, SSR for marketing/landing, static hosting friendly.
- **React** — UI layer (HUD, menus, controls).
- **React Three Fiber (R3F)** — declarative Three.js in React; the 3D table, cards, hands.
- **Three.js** — underlying WebGL engine.
- **@react-three/drei** — helpers (cameras, controls, loaders) so you don't reinvent them.
- **Zustand** — lightweight client state (local UI, selection, optimistic hand position).
- **@colyseus/schema + colyseus.js** — the client transport that receives filtered state.

### Realtime / networking
- **Colyseus** — authoritative room server, state sync, message routing, room scaling.
- **WebRTC** — peer-to-peer voice. Use the Colyseus room purely as the *signaling relay* (exchange SDP/ICE), not as the audio path.
- (Optional) **mediasoup / LiveKit** — only if you outgrow mesh WebRTC (mesh is fine up to ~4–6 players per room; an SFU becomes worth it beyond that).

### Backend (server)
- **Node.js (LTS) + TypeScript** — single language across client/server/shared.
- **Colyseus server** — rooms, matchmaking, state, message handlers.
- **Fastify** — the thin HTTP layer for auth, lobby listing, health checks, replay retrieval (Colyseus can attach to a Fastify/Express http server).
- **A CSPRNG** (Node's built-in crypto) — for shuffle seeds. Never use `Math.random` for shuffles.

### Storage
- **PostgreSQL** — durable storage: users, completed-game replays, room metadata, masks/cosmetics.
- **Redis** — ephemeral/fast: presence, room registry across processes, matchmaking, rate-limiting, Colyseus' scaling driver.

### Tooling & deployment
- **pnpm + Turborepo** — monorepo with shared types and fast incremental builds.
- **Docker + docker-compose** — local Postgres/Redis and reproducible builds.
- **TypeScript (strict), ESLint, Prettier, Vitest, Playwright** — quality gates.
- **Cloudflare** — CDN/edge for the static client; DNS; DDoS protection. (Note: Colyseus needs a persistent WebSocket server — host the *game server* on a stateful host/VM/container platform, and put the static Next.js client behind Cloudflare.)

> **Decision to make early:** mesh WebRTC voice now (simplest, fine for 4 players) vs. an SFU later. Defer the SFU. Document the decision in `CLAUDE.md`.

---

## 3. Prerequisites

Before Phase 0, have installed locally: Node.js LTS, pnpm, Docker Desktop (or Docker engine + compose), Git, and the Claude Code CLI authenticated. You'll also want a modern browser with WebGL2 and a working mic for voice testing.

---

## 4. The Roadmap at a Glance

| Phase | Theme | You can... |
|---|---|---|
| 0 | Foundations | Run an empty monorepo with shared types, Docker services, and `CLAUDE.md`. |
| 1 | Authoritative core (headless) | Create/join rooms, model cards, shuffle fairly, filter visibility — verified with a test client, no graphics yet. |
| 2 | The 3D table | See a table and a deck rendered from server state; orbit the camera. |
| 3 | Free-hand interaction | Grab, draw, place, and arrange cards by intent; server validates, client animates. |
| 4 | Presence | See other players as ghost hands + masks moving in real time. |
| 5 | Voice | Talk to the table over WebRTC. |
| 6 | Shuffle & deal UX | Choose shuffle styles/intensity, see a mix estimate, deal in patterns. |
| 7 | Replay & anti-cheat | Reconstruct any game from the log; pass a cheating-vector audit. |
| 8 | Persistence & scale | Survive restarts; run many rooms across processes via Redis. |
| 9 | Deploy | Ship the client to Cloudflare and the game server to a stateful host. |
| 10 | First ruleset (optional) | Layer Poker rules — *only if the sandbox is already fun.* |

---

## 5. Working With Claude Code — Operating Manual

- **Use plan mode for each phase.** Ask Claude Code to produce a plan before writing files, review it, then approve.
- **One phase = one focused session** where possible. Start each session by pointing Claude Code at `CLAUDE.md` and the current phase of this guide.
- **Keep the shared types package as the contract.** When client and server disagree, the `shared` package wins. Tell Claude Code to update types there first.
- **Commit at every DoD.** Ask Claude Code to write a conventional-commit message.
- **Make it write tests as it goes**, especially for the shuffle engine and visibility filter — these are correctness- and security-critical.
- **When something breaks, give Claude Code the exact error and ask for root cause before a fix.** Avoid "just make it work" loops.
- **Forbid shortcuts explicitly.** Periodically remind it: "Never send hidden card data to a client, even temporarily."

---

# PHASE 0 — Foundations

**Goal:** A clean monorepo that builds, lints, and runs local infrastructure, with a `CLAUDE.md` that encodes the architecture principles.

### Steps
1. Initialize a pnpm + Turborepo monorepo with three apps/packages: `client`, `server`, `shared`.
2. Configure TypeScript (strict), ESLint, Prettier, and a test runner across the workspace.
3. Add a `docker-compose` for PostgreSQL and Redis with sane local defaults and a `.env.example`.
4. Create `CLAUDE.md` capturing: the seven architecture principles, the stack, the folder map, and the "intent in / filtered state out" contract.
5. Add npm scripts: `dev`, `build`, `lint`, `test`, `db:up`, `db:down`.

### Definition of Done
- `pnpm install && pnpm build && pnpm lint` all pass on an empty skeleton.
- `pnpm db:up` brings up Postgres + Redis; the server can connect to both on boot.
- `CLAUDE.md` exists and accurately describes the project.

### Claude Code Prompt — 0.1 (scaffold)
> Set up a pnpm + Turborepo monorepo for a project called "Phantom Table." Create three workspaces: `apps/client`, `apps/server`, and `packages/shared`. Use TypeScript in strict mode everywhere, with shared ESLint + Prettier config and Vitest for tests. The `client` will be a Next.js (App Router) app; the `server` will be a Node.js service; `shared` holds types and constants imported by both. Add root scripts for `dev`, `build`, `lint`, and `test` wired through Turborepo. Do not add any game logic yet — I only want a clean, building skeleton. Show me the plan first, then implement.

### Claude Code Prompt — 0.2 (infra + CLAUDE.md)
> Add a `docker-compose.yml` at the repo root that runs PostgreSQL and Redis for local development, plus an `.env.example` documenting connection variables, and `db:up` / `db:down` scripts. Then create a `CLAUDE.md` at the repo root that documents: (1) this is a server-authoritative 3D multiplayer card platform; (2) the core security rule that hidden information must never reach an unauthorized client, even temporarily or for animation; (3) the "intent in, filtered state out" networking contract; (4) the chosen stack — Next.js + React Three Fiber + Zustand on the client, Colyseus + Fastify + Node on the server, Postgres + Redis for storage; (5) the workspace folder map. Keep CLAUDE.md concise and authoritative — it is the project's constitution.

---

# PHASE 1 — Authoritative Core (Headless)

**Goal:** A working game server with rooms, a card/deck model, a cryptographically seeded shuffle, a state machine, and **per-viewer visibility filtering** — all provable without any 3D rendering.

This is the most important phase. If the fairness and visibility model is wrong here, everything downstream inherits the flaw.

### Steps
1. **Shared model.** In `shared`, define the card, deck, room state, visibility enum, and the message protocol (intent types client→server; state/animation types server→client). Describe these as data shapes and enums — the contract both sides obey.
2. **Colyseus room.** Implement a room that players can create and join, with seats and a deck living entirely in server state.
3. **Card & deck truth.** Model each card with a stable id, rank, suit, position, owner, and visibility. The deck holds the ordered list of card ids; only the server ever sees the full order.
4. **State machine.** Implement and enforce the card lifecycle: `DECK → DRAWN → HAND → SELECTED → MOVING → PLACED → REVEALED`. Reject illegal transitions server-side.
5. **Shuffle engine.** Generate a seed from a CSPRNG, apply a Fisher–Yates shuffle (the patterns/styles are cosmetic; the underlying permutation must be uniformly random), record the seed + before/after in history. The result is server-only.
6. **Visibility filter.** Implement `canSee(viewer, card)` and use Colyseus' per-client state filtering so each player receives face data only for cards they're entitled to see; everything else serializes as a back.
7. **Validation & rate limits.** Every intent handler validates ownership, turn/seat legitimacy, and physical possibility before mutating state.
8. **Headless test client.** A small Node script or test suite that joins as multiple players and asserts that hidden cards are *absent* from unauthorized clients' received state.

### Definition of Done
- Two simulated clients can create/join a room, request a shuffle, and draw cards.
- An automated test proves that Player B **cannot** see Player A's hidden cards in any received state payload.
- An automated test proves the shuffle produces uniformly distributed permutations across many runs and uses a CSPRNG (not `Math.random`).
- Illegal intents (draw from empty deck, move a card you don't own, illegal state transition) are rejected and logged.

### Claude Code Prompt — 1.1 (shared contract)
> In `packages/shared`, define the data contracts for Phantom Table — no implementation, just types, enums, and constants. Include: a Card shape (stable string id, rank, suit, integer position, ownerId nullable, visibility enum of HIDDEN/OWNER_ONLY/PUBLIC), a Deck shape (ordered list of card ids, a seed, and a history log), a RoomState shape (seats, players, deck, table zones), the card-state-machine states (DECK, DRAWN, HAND, SELECTED, MOVING, PLACED, REVEALED), the client→server intent message types (grab, release, draw, multiDraw, cut, shuffle, deal, gesture, place, reveal, chat), and the server→client message types (filtered state update, animation command, error). Add a constants file for deck composition (52 cards), max players, and tick/rate limits. This package is the single source of truth for the protocol.

### Claude Code Prompt — 1.2 (room + truth + state machine)
> Implement the Colyseus game server in `apps/server`. Create a room type "TableRoom" that holds the full RoomState from `packages/shared` entirely server-side. Players can create and join a room and occupy a seat. Build the deck of 52 cards with stable ids and the card state machine, enforcing legal transitions only (DECK→DRAWN→HAND→SELECTED→MOVING→PLACED→REVEALED). Wire Fastify as the HTTP layer for health checks and lobby listing, with Colyseus attached to it. Do NOT implement shuffle or visibility filtering yet — that's the next two prompts. Add unit tests for the state machine rejecting illegal transitions.

### Claude Code Prompt — 1.3 (shuffle engine — security critical)
> Implement the shuffle engine for the TableRoom. Requirements, in priority order: (1) Use Node's crypto CSPRNG to generate the seed — never Math.random. (2) Perform an unbiased Fisher–Yates shuffle over the deck's order array. (3) The "shuffle style" (overhand, riffle, wash, split, casino) and "intensity" (low/medium/high) are PURELY cosmetic inputs that affect only the later animation — they must not bias or determine the actual permutation. (4) Record seed, the before-order hash, and the after-order hash in the deck history for audit. (5) The full order is server-only and must never be serialized to any client. Write a statistical test that runs the shuffle thousands of times and asserts the output permutations are approximately uniform, and a test asserting the RNG source is the CSPRNG.

### Claude Code Prompt — 1.4 (visibility filtering — security critical)
> Implement per-viewer visibility filtering using Colyseus' filtered-state mechanism. Define `canSee(viewer, card)`: a player sees the FACE of their own OWNER_ONLY cards and all PUBLIC cards; every other card serializes to that viewer as a featureless BACK with no rank or suit. Ensure hidden cards and the deck's order are NEVER included in any client's serialized state — not in initial sync, not in deltas, not in animation commands. Then write an integration test that connects three simulated clients, deals private cards, and asserts via inspection of each client's received state that no client can read another player's hidden cards or the deck order.

### Claude Code Prompt — 1.5 (intent validation + headless harness)
> Add server-side validation to every intent handler: verify the actor owns the card and occupies a valid seat, the action is legal for the current card state, and the action is physically possible (e.g., cannot draw from an empty deck). Reject and log violations; never trust client-supplied card identities or positions. Then build a headless test harness (a Node script + Vitest suite) that spins up the server, connects multiple bot clients, and exercises create/join/shuffle/draw/deal while asserting fairness and visibility invariants hold. This harness is our regression guard for all later phases.

---

# PHASE 2 — The 3D Table

**Goal:** A browser scene that renders the table and deck *from filtered server state*, with camera controls. No interaction yet — just truthful rendering.

### Steps
1. Set up the Next.js client with an R3F canvas, a lobby page, and a room page.
2. Build the scene: a table surface, lighting, environment, and a camera with orbit/zoom controls.
3. Connect to Colyseus from the client; subscribe to filtered room state into Zustand.
4. Render the deck and any visible cards from state — card backs for hidden cards, faces for visible ones.
5. Establish the card visual: a thin beveled mesh with front/back textures, and a deck as a stacked instance.

### Definition of Done
- Opening the room page connects to the server and renders a table + a face-down deck driven by live state.
- A second browser tab joining the same room renders the same table consistently.
- The camera orbits and zooms smoothly; the scene holds 60 FPS with an idle deck.

### Claude Code Prompt — 2.1 (scene + connection)
> In `apps/client`, build the 3D table scene with React Three Fiber. Create a lobby page that lists/creates rooms via the Fastify HTTP API and a room page that mounts an R3F canvas. In the scene, render a card table surface with pleasant lighting and an environment, and add orbit + zoom camera controls via drei. Connect to the Colyseus TableRoom using colyseus.js, and push the received (already filtered) room state into a Zustand store. Render nothing game-specific yet beyond the table itself. Confirm two browser tabs can join the same room.

### Claude Code Prompt — 2.2 (cards + deck rendering)
> Create a reusable Card mesh: a thin rounded-rectangle card with a back texture and a front texture, sized realistically. Build a Deck component that renders the deck as a neat stack using instanced meshes for performance. Drive everything from the Zustand store that mirrors filtered server state: cards the player may see show their face; all others show the back. Do not store or infer any hidden card identity on the client. Keep the idle scene at 60 FPS.

---

# PHASE 3 — Free-Hand Interaction

**Goal:** Players manually grab, draw, arrange, and place cards. The client sends intent; the server validates and broadcasts; the client animates the confirmed result.

### Steps
1. Implement pointer raycasting to select/hover cards and table zones.
2. Wire the control scheme: `D` draw, `Shift+D` multi-draw, `R` shuffle, `F` fan, `Space` place, `Q` rotate, `Tab` inspect, `Esc` cancel, mouse rotate/scroll zoom.
3. On interaction, send the corresponding **intent** to the server. Apply a light optimistic local affordance (e.g., a "grabbing" highlight) but treat the server's confirmation as truth.
4. Build the animation system: the server emits an animation command (type + duration); the client plays it. Animation never changes which card or order results.
5. Implement fake physics + bezier motion: slight card bend, friction, delayed stacking, edge collisions — visually rich, computationally cheap. Do not run a full rigid-body simulation on every card.

### Definition of Done
- A player can draw a card (server removes top, hides it from others, adds to the player's hand) and see it animate into their hand.
- A player can grab, move, rotate, and place a visible card on the table; other players see the placement.
- Illegal interactions (grabbing another player's hidden card) are rejected by the server and produce no state change.
- The animation for a draw plays *after* the server confirms, never before.

### Claude Code Prompt — 3.1 (intent + controls)
> Implement free-hand card interaction on the client. Add pointer raycasting to hover and select cards and table zones. Wire the control scheme: D = draw top card, Shift+D = multi-draw, R = request shuffle, F = fan the hand, Space = place held card, Q = rotate, Tab = inspect, Esc = cancel; mouse drag rotates the camera and scroll zooms. Each action sends the matching INTENT message defined in `packages/shared` to the server — the client must NOT decide outcomes. You may show a local "grabbing" affordance optimistically, but the authoritative result comes from the server's filtered state update. Reflect rejected intents by snapping back with no state change.

### Claude Code Prompt — 3.2 (server-driven animation + fake physics)
> Build the animation system. When the server confirms a state change (draw, place, shuffle, deal), it sends an animation command containing a type and duration; the client plays the corresponding tween/motion and then settles to the new authoritative state. Implement "fake physics" for cards: bezier-path motion, a subtle bend while in flight, friction on landing, slight stacking offset, and edge-collision nudges — all visual only, no global rigid-body solver. Ensure animations are interruptible/queueable and never alter which card or order the server chose. Keep four players' worth of motion at 60 FPS.

---

# PHASE 4 — Presence (Ghost Hands & Masks)

**Goal:** Players perceive each other as floating ghost hands and masked faces that move and gesture in real time.

### Steps
1. Broadcast lightweight presence (hand position/orientation, gesture state, mask id) on an interval or on-change — keep it tiny and rate-limited.
2. Render each remote player as ghost hands + a masked face at their seat, interpolating between presence updates.
3. Implement hand states: idle, hover, grab, thinking, reveal — driven by the player's current interaction.
4. Implement the mask system: id, material, glow, effect; seed a few masks (porcelain, spirit, geometric, casino, faceless).

### Definition of Done
- With two browsers in a room, each sees the other's ghost hands move smoothly and the correct mask at the correct seat.
- Hand state transitions (e.g., to "grab" when holding a card) are visible to others.
- Presence traffic stays well within the bandwidth budget (interpolated, rate-limited, not per-frame).

### Claude Code Prompt — 4.1 (presence)
> Add player presence. Each client sends a small, rate-limited presence update (hand position + orientation, current hand-state of idle/hover/grab/thinking/reveal, and selected mask id) — never per-frame; throttle and let clients interpolate. The server relays presence to others in the room via filtered state. Render remote players as floating ghost hands and a masked face positioned at their seat, smoothly interpolated. Make sure presence carries no game-secret data.

### Claude Code Prompt — 4.2 (mask system)
> Implement the mask system. A mask has an id, material, glow, and effect. Create five starter masks — porcelain, spirit, geometric, casino, faceless — as configurable materials/shaders on the masked face mesh. Let a player pick their mask in the lobby and have it render at their seat for all players. Keep the masks performant (shared materials, no per-frame allocations).

---

# PHASE 5 — Voice (WebRTC)

**Goal:** Players can talk at the table, with the Colyseus room acting only as the signaling relay.

### Steps
1. Add push-to-talk (`hold V`) and a per-player voice indicator (the "voice ripple").
2. Use the room to exchange WebRTC signaling (offers/answers/ICE) between peers; the audio flows peer-to-peer (mesh) for the 4-player MVP.
3. Render a voice-presence ripple on a player's mask when they speak.
4. Document the upgrade path to an SFU for larger rooms, but do not build it yet.

### Definition of Done
- Two players in a room can hear each other over push-to-talk.
- The speaking player's mask shows a voice ripple to others.
- No audio path runs through the game-state messages; signaling only uses the room.

### Claude Code Prompt — 5.1 (voice over WebRTC)
> Add voice chat using WebRTC in a mesh topology suitable for up to ~4–6 players. Use the Colyseus room ONLY to relay signaling (SDP offers/answers and ICE candidates) between peers — audio must flow peer-to-peer, not through game-state messages. Implement push-to-talk on holding V, and show a "voice ripple" effect on a speaking player's mask. Add a clear code comment and a CLAUDE.md note describing the future migration path to an SFU (e.g., mediasoup or LiveKit) for larger rooms, but do not implement the SFU now.

---

# PHASE 6 — Shuffle & Deal UX

**Goal:** Make the signature shuffle feel tactile and expressive, and let a dealer distribute cards in patterns — all while the result stays uniformly random and server-decided.

### Steps
1. Build the shuffle UI: style selector (overhand, riffle, wash, split, casino), intensity (low/medium/high), and an estimated-mix readout (a cosmetic confidence number, clearly not affecting fairness).
2. Map each style+intensity to a distinct *animation*, while the server's permutation remains a uniform Fisher–Yates regardless of style.
3. Build distribution patterns for the dealer: clockwise, counter-clockwise, burn, equal split, custom. The server computes the deal and assigns private visibility; the client animates it.
4. Add the cut action and split animations.

### Definition of Done
- Choosing different shuffle styles changes the animation but not the statistical fairness (the Phase 1 uniformity test still passes).
- A dealer can deal equal hands clockwise; each recipient sees only their own cards.
- The estimated-mix indicator is clearly cosmetic and documented as such.

### Claude Code Prompt — 6.1 (shuffle UX)
> Build the shuffle UX on top of the existing authoritative shuffle engine. Add a HUD with a shuffle-style selector (overhand, riffle, wash, split, casino), an intensity control (low/medium/high), and a cosmetic "estimated mix %" readout. Each style+intensity combination maps to a distinct shuffling ANIMATION only. The server still performs a uniform Fisher–Yates permutation regardless of the selected style — re-run the Phase 1 uniformity test to confirm fairness is unchanged. Make the mix indicator visibly cosmetic and note in code that it does not affect outcomes.

### Claude Code Prompt — 6.2 (distribution patterns)
> Implement dealer distribution. Add dealer intents for: deal clockwise, deal counter-clockwise, burn a card, equal split, and custom deal. The server computes which cards go to which seats, sets each dealt card to OWNER_ONLY visibility for its recipient, logs the deal, and emits animation commands; the client animates cards flying to seats. Verify each recipient receives faces only for their own cards. Also implement the cut action with a split animation.

---

# PHASE 7 — Replay & Anti-Cheat Hardening

**Goal:** Any game can be fully reconstructed from its log, and a deliberate audit finds no path for a client to obtain hidden information.

### Steps
1. Append every mutation to a replay log: timestamp, action, actor, parameters, and the resulting deck-state hash.
2. Build a replay reconstructor that replays the log into the exact final state and can step through it for review.
3. Run an **anti-cheat audit**: inspect every server→client payload type and confirm none can leak hidden order, hidden hands, or future draws. Add tests that fail if any future change starts leaking.
4. Add server-side sanity checks that reject impossible states and flag anomalies.

### Definition of Done
- A completed game's log replays deterministically to the same final hashes.
- An automated audit suite asserts that no message type ever carries hidden card identities, deck order, or future state to an unauthorized viewer.
- Fuzzing/abuse tests (malformed or hostile intents) never corrupt server state.

### Claude Code Prompt — 7.1 (replay)
> Implement the replay system. Append every authoritative mutation to an ordered log with: timestamp, action type, actor id, parameters, and a hash of the resulting deck state. Persist completed-game logs to PostgreSQL. Build a reconstructor that replays a log to produce the exact final state (verified by matching hashes) and supports stepping forward/back for review. Add an HTTP endpoint to fetch a replay by game id.

### Claude Code Prompt — 7.2 (anti-cheat audit — security critical)
> Conduct an anti-cheat hardening pass and lock it in with tests. Enumerate every server→client message type and prove, with automated tests, that none can ever carry hidden card identities, the deck order, or future-draw information to a player not entitled to it — under initial sync, deltas, animation commands, presence, and replay fetch. Add fuzz tests that fire malformed and hostile intents (spoofed card ids, wrong seat, impossible moves) and assert the server rejects them without state corruption and logs the attempt. Make these tests part of the standard test run so any future regression fails CI.

---

# PHASE 8 — Persistence & Horizontal Scale

**Goal:** Rooms survive restarts where appropriate, and the platform runs many concurrent rooms across multiple server processes.

### Steps
1. Define the PostgreSQL schema: users, masks/cosmetics, room metadata, completed replays.
2. Add authentication (lobby-level): account or guest identity carried into rooms.
3. Use Redis as the Colyseus presence/scaling driver so rooms distribute across processes, plus matchmaking and rate-limiting.
4. Implement a lobby/matchmaking flow: list open rooms, create, quick-join.
5. Decide reconnection behavior: a disconnected player's seat and hidden hand are preserved server-side for a grace period.

### Definition of Done
- Many rooms run concurrently across at least two server processes via the Redis driver.
- A player can disconnect and reconnect within the grace period and resume their seat and hand.
- Users, cosmetics, and replays persist in Postgres across restarts.

### Claude Code Prompt — 8.1 (persistence + auth)
> Define and migrate the PostgreSQL schema for: users (with guest support), owned masks/cosmetics, room metadata, and completed-game replays. Add lobby-level authentication that issues an identity (account or guest) carried into Colyseus rooms. Wire persistence so completed replays and user/cosmetic data survive restarts. Keep all in-game truth in server memory during play; only persist on meaningful checkpoints and game end.

### Claude Code Prompt — 8.2 (scale + reconnection)
> Make the platform horizontally scalable. Configure Colyseus to use Redis as its presence/scaling driver so rooms distribute across multiple server processes, and use Redis for matchmaking and rate-limiting. Build a lobby flow: list open rooms, create a room, and quick-join. Implement reconnection: when a player disconnects, preserve their seat, hand, and hidden state server-side for a configurable grace period, then reclaim the seat if they don't return. Add a test that runs rooms across two processes and verifies reconnection restores hidden hand state.

---

# PHASE 9 — Deployment

**Goal:** The client is served from Cloudflare's edge; the stateful game server runs on a host that supports persistent WebSocket connections; Postgres and Redis are managed/hosted.

### Steps
1. Containerize the server with Docker; produce a production build of the client.
2. Host the static/SSR Next.js client behind Cloudflare (CDN, DNS, DDoS protection).
3. Deploy the Colyseus game server to a stateful container/VM platform (Cloudflare's edge workers are *not* suitable for long-lived stateful WebSocket game rooms — use a persistent host and front it with Cloudflare DNS/proxy as appropriate).
4. Provision managed PostgreSQL and Redis; wire secrets via environment.
5. Add health checks, structured logging, basic metrics (rooms, players, FPS reports, bandwidth/player), and graceful shutdown that drains rooms.

### Definition of Done
- A public URL serves the client; players from different networks can join the same room and play with voice.
- Bandwidth per player stays within budget under a 4-player load test.
- Server restarts drain rooms gracefully and recover without data loss for persisted entities.

### Claude Code Prompt — 9.1 (containerize + deploy)
> Prepare Phantom Table for deployment. Write a production Dockerfile for the game server and a production build pipeline for the Next.js client. Document a deployment topology where: the static/SSR client is served behind Cloudflare (CDN + DNS + DDoS protection); the Colyseus game server runs on a stateful host/container platform that supports long-lived WebSockets (note explicitly that edge/serverless workers are unsuitable for persistent stateful rooms); and PostgreSQL + Redis are managed services. Add health-check endpoints, structured logging, basic metrics (active rooms, players, per-player bandwidth), graceful shutdown that drains rooms, and environment-based secrets. Provide a step-by-step deploy runbook in the repo.

### Claude Code Prompt — 9.2 (load test)
> Create a load test that simulates a full 4-player room (shuffle, draw, deal, place, presence, and signaling traffic) and reports per-player bandwidth and server CPU/memory. Assert per-player game-state bandwidth stays under ~40 KB/sec and that the client holds ~60 FPS in a 4-player scene. Document results and any tuning needed.

---

# PHASE 10 — First Ruleset: Poker (Optional, Gated)

> **Do not start this phase until the sandbox is fun.** Put strangers at the table with only shuffle, draw, deal, voice, and ghost hands. If they enjoy ten minutes of just handling cards together, the product has legs — then add rules. If they don't, fix the feel first.

**Goal:** Layer a single concrete ruleset (Poker) on top of the sandbox without compromising the server-authoritative, hidden-information guarantees.

### Steps
1. Add an optional, server-side "rules module" that can be attached to a room; the sandbox remains playable without it.
2. Encode Poker: blinds/antes, betting rounds, hand evaluation, showdown, pot management — all server-authoritative.
3. Reuse the existing visibility system for hole cards; reveal at showdown via the REVEALED state.
4. Add minimal rules HUD (turn indicator, pot, bet controls) without removing free-hand manipulation.

### Definition of Done
- A full Poker hand plays to showdown with correct pot resolution, entirely server-validated.
- Hole cards remain hidden until a legitimate reveal.
- The free-hand sandbox still works with the rules module detached.

### Claude Code Prompt — 10.1 (poker rules module)
> Add an optional, attachable rules module to the TableRoom for Poker, keeping the free-hand sandbox fully playable when no rules module is attached. Implement Poker server-side and authoritatively: seating/blinds/antes, betting rounds, server-side hand evaluation, showdown, and pot management. Reuse the existing visibility system so hole cards stay OWNER_ONLY until a legitimate showdown moves them to REVEALED. Add a minimal rules HUD (turn indicator, pot size, fold/call/raise controls) layered over — not replacing — the existing manual card controls. Validate every betting and reveal action on the server.

---

## 11. Quality Gates & Definition of Done (Project-Wide)

Treat these as always-on, not a phase:

- **Security tests are sacred.** The visibility-filter and anti-cheat audit tests must pass on every commit. A failure there blocks merge, full stop.
- **Shuffle fairness test** runs in CI and must stay green.
- **Type contract** in `packages/shared` is the single source of truth; client and server import from it.
- **Performance budget**: ~60 FPS for 4 players, <100 MB client memory in-scene, <40 KB/sec/player game-state bandwidth.
- **Every mutation is logged** and replayable.

---

## 12. Risk Register (tell Claude Code to watch for these)

| Risk | Mitigation |
|---|---|
| Hidden info leaks "just for animation" | Animation commands carry no card identity; faces only ever arrive via filtered state for entitled viewers. |
| `Math.random` sneaks into shuffle | CSPRNG-only; a test asserts the RNG source. |
| Client-side outcome prediction drifts from server | Client is render-only for outcomes; optimistic affordances are visual and always reconcile to server state. |
| Per-frame server traffic blows the budget | Presence is throttled + interpolated; server sends deltas, not frames. |
| Mesh voice doesn't scale past ~6 | Documented SFU upgrade path; rooms capped until then. |
| Stateful server on serverless edge | Game server on a persistent host; only the static client on the edge. |
| Reconnection loses hidden hand | Server preserves seat + hidden state for a grace period; tested. |

---

## 13. Suggested Build Order Summary

Foundations → Authoritative core (shuffle + visibility proven headless) → 3D table → free-hand interaction → presence → voice → shuffle/deal UX → replay + anti-cheat → persistence + scale → deploy → (only if fun) Poker.

Build the table, the shuffle, and the draw first. Make handling cards together feel good before you teach the table any game.

---

*End of guide. Hand each phase to Claude Code in order, verify the Definition of Done, commit, and keep `CLAUDE.md` current.*
