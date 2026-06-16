# Shuffle Animation Guide

> How each shuffle *looks and moves*. The companion to [`docs/realistic-shuffles.md`](./docs/realistic-shuffles.md)
> (which defines how the order is **computed** server-side) and [`UI.md`](./UI.md)
> (the overall 3D look + motion system). This doc never touches the result — the
> server already decided the new order; the animation is pure theatre over a
> face-down deck.

---

## 1. Principles (non-negotiable)

- **Decorative, never causal.** The new order is decided server-side before a card moves. The animation plays afterward and changes nothing.
- **Faces never show.** The deck is backs-only throughout — no card rotates to reveal a face during a shuffle, ever.
- **Each style is unmistakable.** A glance should tell riffle from overhand from wash. Different silhouettes, rhythms, and hand motions.
- **Hand-driven.** Ghost "dealer hands" perform the shuffle — the deck moves *because the hands move it*, not on its own.
- **Performant.** The deck stays one instanced draw call; per-card motion is driven through the instance matrices. Hands are a few light meshes. Hold ~60 fps.
- **Intensity reads.** Low/Medium/High visibly change vigor, repetitions, and flourish.
- **Varied.** A small per-shuffle random seed (cosmetic only) means no two shuffles are pixel-identical.
- **Graceful.** Reduced-motion gets a short, calm settle instead of the full choreography.

---

## 2. The current gap

`apps/client/src/components/scene/DeckStack.tsx` animates the whole deck *group* with a per-style `sin()` wobble of `rotation`/`position`. The 52 cards never move relative to each other, so nothing reads as cards being *handled* — all five styles look like the same brick tilting. This guide replaces that with per-card choreography + dealer hands.

---

## 3. How a shuffle animation is built (the system)

Four layers, composed:

1. **Per-card choreography.** During a shuffle the deck's 52 instances stop being a static stack; each card's position/rotation is computed as a function of `(cardIndex, phaseProgress, seed)` by the active style's choreography. At the end, cards snap back to the resting stack.
2. **Dealer hands.** A scripted pair of ghost hands appears at the shuffling player's seat and performs the style's gesture sequence, then fades. The deck motion is timed to the hands.
3. **Phase timeline.** Each style is a sequence of named phases (e.g. split → riffle → bridge → square), each with its own duration and easing. Driven off the existing `deckAnimation` state (`style`, `intensity`, `startedAt`, `durationMs`).
4. **Sound + accents.** Per-style SFX synced to phase boundaries; optional dust/glint accents.

---

## 4. Shared building blocks

- **Packets.** Many shuffles move *groups* of contiguous cards together (overhand packets, riffle halves, split piles). The engine treats a packet as a range of instance indices sharing a path.
- **The hands.** Two ghost hands (reuse the `GhostHand` look — matcap palm + fingers), tinted the actor's seat color, summoned at their seat, posed/keyframed per phase, faded at the ends. Left/right roles differ per style.
- **Easing & rhythm.** Anticipation → action → settle on every gesture. Riffles snap; overhand chops; wash drifts; split is deliberate; casino is crisp.
- **Intensity → vigor.** Maps to repetitions (passes/packets/piles), speed, spread size, and whether the showy flourish (bridge/waterfall) plays.
- **Per-style duration.** Different styles need different lengths (a wash breathes; a riffle is quick). The client derives `durationMs` from a per-style × intensity table rather than the single fixed value, so timing fits the motion.
- **Variation seed.** A client-side cosmetic random per shuffle wobbles split points, packet sizes, swirl paths — never derived from or revealing the real order.
- **Camera & accents (subtle).** An optional gentle push-in for the casino finale; a faint dust puff on a bridge cascade. Kept within budget and reduced-motion aware.

---

## 5. Per-style choreography (the heart)

### Overhand — casual, rhythmic, modest

- **Mechanic:** small packets pulled off the top and dropped to the front, repeatedly.
- **Hands:** the off-hand cradles the deck tilted on edge; the working hand chops down, grips a small packet off the back, lifts and swings it forward, releases it onto the front of the reforming pile — pull-drop, pull-drop, accelerating slightly.
- **Cards:** the deck feeds out as 6–10 packets of ~5–10 cards; each packet lifts ~2 cm, arcs a short hop forward, drops onto the growing pile with a tiny settle. The stack visibly cycles back-to-front.
- **Rhythm:** ~150–220 ms per packet, a touch irregular.
- **Intensity:** number of passes (Low 1, Med ~3, High ~5 sweeps through the deck), each pass faster.
- **Signature:** the rhythmic chopping stutter and the front-to-back cycling — humble, the "kitchen-table" shuffle.
- **Sound:** soft, slightly uneven "thwip … tap" per packet.

### Riffle — the classic, satisfying

- **Mechanic:** split in two, interleave the halves, optionally bridge, square.
- **Hands:** both hands sweep in and take a half each; halves tilt so inner corners nearly meet; thumbs release in fast alternation (the interleave); fingers then bow the merged deck into an arch and let it spring flat (the bridge waterfall); hands square up.
- **Cards (phases):**
  1. **Split** — top ~26 slide right, bottom ~26 slide left into two stacks.
  2. **Riffle** — cards from each half drop in rapid alternation, interleaving into a rising center pile, each card flicking with a slight fan (the cascade).
  3. **Bridge** (med/high) — the merged stack bows upward then ripples flat in a waterfall.
  4. **Square** — cards align to the neat stack.
- **Timing:** split ~250 ms, riffle ~450 ms (fast), bridge ~380 ms, square ~180 ms.
- **Intensity:** Low = one riffle, no bridge; Med = riffle + small bridge; High = a crisper double-riffle and a tall bridge waterfall.
- **Signature:** the interleave cascade + the bridge arch — the money shot.
- **Sound:** the "brrrrrt" interleave zip, then the snap-cascade of the bridge.

### Wash — the chaotic reset

- **Mechanic:** spread all cards flat, swirl them around, gather back.
- **Hands:** both flat, palms down, fingers spread; they push the deck out into a scattered field, then move in overlapping circular swirls over it; finally sweep inward from the edges to gather and square.
- **Cards (phases):**
  1. **Spread** — all 52 fan out from the stack to scattered flat positions across the felt (random x/z, small random yaw).
  2. **Swirl** — each card jitters and drifts in small circular noise-driven paths, sliding and rotating (a chaotic shimmer).
  3. **Gather** — cards converge back to center and stack.
  4. **Square.**
- **Timing:** spread ~400 ms, swirl ~600–1000 ms (intensity), gather ~500 ms.
- **Intensity:** swirl duration, spread width, and vigor.
- **Signature:** the **horizontal** chaotic field — a completely different silhouette from every other style (flat scatter vs. vertical stack). Reads as a full reset.
- **Sound:** a continuous soft "shhhhh" slither of many cards sliding at once.

### Split — deliberate, architectural

- **Mechanic:** divide into several piles laid across the table, then restack in a new order. (Distinct from a single cut.)
- **Hands:** one/both hands lift a portion off the top and set it down to the side; repeat to lay out 3–4 piles in a row; then gather the piles in a new sequence onto a central stack; square. Calm and precise.
- **Cards (phases):**
  1. **Divide** — the deck splits into 3–4 contiguous chunks that lift and translate to distinct spots (a row of small stacks).
  2. **Hold** — a brief pause (the tableau reads).
  3. **Reassemble** — piles lift in a new order and drop back onto a central stack.
  4. **Square.**
- **Timing:** deliberate — ~300 ms per pile, ~1.5–2 s total.
- **Intensity:** number of piles (Low 2–3, High 4–5) and reorder complexity.
- **Signature:** the methodical pile-and-restack — the calm "anti-riffle"; reads as method, not flourish.
- **Sound:** clean, spaced "tap … tap" as each pile lands.

### Casino — the showpiece sequence

- **Mechanic:** the full professional chain — table riffle ×2, strip (running cut), box (cut-and-swap), bridge finale.
- **Hands:** both hands, crisp and precise; the longest, most elaborate sequence, ending in a flourish.
- **Cards (phases):**
  1. **Table riffle #1** — halves riffled *flat* on the felt, interleaving low and horizontal.
  2. **Strip/run** — tight fast packets pulled from the top and re-dropped (a running cut).
  3. **Table riffle #2.**
  4. **Box** — cut and swap the halves.
  5. **Bridge finale** — the merged deck bowed into a tall arch and released into a cascading waterfall, then squared with a flourish.
- **Timing:** the longest — ~3–4 s; needs a larger `durationMs` than the others.
- **Intensity:** number of riffle/strip repetitions; High adds an extra riffle and a bigger waterfall finale.
- **Signature:** the elaborate combo ending in the bridge waterfall — the most cinematic, the "dealer flex."
- **Sound:** layered — flat-riffle zips + strip taps + the climactic bridge snap-cascade.

---

## 6. The dealer-hands system

- **Summon/fade:** when a shuffle animation starts, a pair of ghost hands fades in at the shuffling player's seat (local player at the near edge; others around the table), performs the choreography, and fades out. Tinted the actor's seat color so it's clear *whose* hands.
- **Reuse:** the existing `GhostHand` visual (matcap palm + finger stubs); for shuffling, the mask is optional/omitted so the hands read as "dealer hands."
- **Roles:** left/right hands have distinct scripted keyframe paths per style+phase (e.g. riffle: each hand owns a half; overhand: one cradles, one chops; wash: both swirl).
- **Sync:** the deck's per-card motion is timed to the hand keyframes so cards appear *handled*, not self-moving.
- **Spectators/opponents:** see the same hands at the actor's seat (presence-independent — this is scripted, not pointer-driven).

---

## 7. Sound design (per style)

Re-author the single generic shuffle SFX (`apps/client/src/lib/audio.ts` → `audio.shuffle()`) into per-style cues synced to phase boundaries:

- **Overhand** — uneven taps.
- **Riffle** — interleave zip + bridge snap.
- **Wash** — continuous slither.
- **Split** — spaced clean taps.
- **Casino** — layered riffle / strip / bridge.

All still synthesized (no asset files), gated by the existing SFX toggle.

---

## 8. Performance, constraints & safety

- **One draw call.** The deck stays a single `InstancedMesh`; choreography writes the 52 instance matrices per frame (cheap). Hands add a few meshes.
- **Faces hidden.** The deck mesh carries only the back texture — faces are never even present, so a shuffle physically cannot leak them. (Keeps the security invariant intact.)
- **Budget.** ~60 fps with the shuffle playing + 4 players in scene; no per-frame server traffic (the animation is client-local off one `deckAnimation` command).
- **Determinism vs. variation.** The animation may use a cosmetic client seed for variety; it must never read or encode the real order (the client doesn't have it).
- **Reduced motion.** A simplified ~400 ms settle (a quick collapse/fan + square), no elaborate hand choreography.
- **Duration source.** Derive `durationMs` client-side from a per-style × intensity table (the wash breathes, the riffle snaps), rather than the current single fixed value.

---

## 9. Implementation phases (build order)

1. ✅ **Choreography engine.** Replace the whole-group wobble in `DeckStack.tsx` with a per-card instanced driver that dispatches to a style choreography function over a phase timeline. (Foundation; no visible behavior change beyond wiring.) — `apps/client/src/lib/shuffle/{timings,choreography}.ts`
2. ✅ **Riffle vertical slice.** Build Riffle end-to-end (split → interleave → bridge → square) to full polish as the quality bar.
3. ✅ **Remaining styles.** Overhand, Wash, Split, Casino — each its own choreography function and phase timeline.
4. ✅ **Dealer hands.** The scripted ghost-hand system + per-style hand choreography, synced to the deck phases — `DealerHands.tsx`, staged at the actor's seat via `actorId` on `AnimationCommand`.
5. ✅ **Sound.** Per-style synthesized SFX synced to phases — `audio.shuffleStyled()`.
6. ✅ **Intensity.** Wire Low/Med/High to repetitions/speed/flourish per style; client-derived per-style durations.
7. ✅ **Polish.** Variation seed (from the animation epoch — cosmetic only). *Deferred: camera nudge (casino), dust/glint accents — resolved in §13 step 6.*
8. ✅ **QA.** Reduced-motion settle path; engine invariants under test (`choreography.test.ts`): rest at t=0/1, face-down clamp, no teleports, finite poses, small-deck safety, seed variation.

---

## 10. Acceptance criteria (done =)

- Each of the five styles is **visually distinct** and recognizable at a glance.
- The deck looks **handled** — dealer hands drive the motion, cards move relative to each other.
- **Faces never appear** during any shuffle.
- **Intensity** is visibly different (Low vs High).
- **~60 fps** held; one deck draw call.
- **Reduced-motion** path works; **SFX** match per style and respect the toggle.

---

## 11. Future / stretch

- Per-player signature flourishes; unlockable cosmetic "shuffle skins."
- A spectator-friendly close-up camera for the casino finale.
- Tie animation pass-count visuals to the (server-side) statistical pass count for the shuffle-tracking skill layer described in [`docs/realistic-shuffles.md`](./docs/realistic-shuffles.md).

---

## 12. Card Cast Animation (playing a card to the table)

> The single-card companion to the shuffle theatre above. Where a shuffle is
> *deck* motion, a **cast** is one card lifted off your fan and tossed into the
> middle of the table. Decorative over a server-decided `Place`/`Reveal` — the
> server already moved the card to `PLACED`/`REVEALED`; the flight is pure
> theatre and changes nothing.

### 12.1 Principles (non-negotiable)

- **Decorative, never causal.** The server decides the card is placed (and, for a
  face-up "play", revealed) *before* anything moves. The throw plays afterward.
- **Faces honour visibility.** A face-down cast shows a back for the entire
  flight; a face-up cast shows its face only after the server reveals it. The
  card never rotates in a way that flashes a hidden face mid-air.
- **Deterministic, zero-bandwidth.** Landing spot, rotation, air time and spin
  are all derived from a hash of the card id — every viewer computes the same
  throw locally, so the server keeps sending just one `Place` command (no
  coordinates on the wire).
- **Realistic, not flashy.** Default is a short, low toss with a little settle.
  Small spin only sometimes; the showy "trick shot" is rare, never the norm.
- **Performant.** Reuses the existing per-card driver in `CardMesh` and its
  at-rest fast path — only in-flight cards do work; landed cards cost nothing.
- **Graceful.** Reduced-motion gets a calm flat placement, no air time or spin.

### 12.2 The current gap

Cast cards snap into a tidy 8-column grid (`PlacedCards.tsx`), and the motion is
the generic distance lerp in `CardMesh.tsx` (arc by distance + flip flourish). It
reads as "card slides to a slot." There is no defined centre region, no scatter,
and no throw character — nothing that says *a hand flicked this down*.

### 12.3 The drop zone (the invisible target)

- A small rectangle centred on the table origin — about **2.0 × 1.4 world
  units** — comfortably inside every felt shape (it fits even the tight 2-player
  strip and 4-player square). It has **no mesh, no outline, no marker**: it
  exists only as math. Nobody ever sees its bounds.
- Each cast card is assigned a **landing transform inside this zone, derived from
  a hash of its card id**: an `(x, z)` offset within the bounds, a small in-plane
  yaw (±~20°), and a tiny per-card lift so cards stack rather than z-fight.
- This reuses the exact id-hash approach already used for per-card rotation in
  `PlacedCards.tsx`, so all clients land a given card identically with **no
  server data**.
- The result is a **natural, lightly-overlapping scatter** — a messy little pile
  in the middle — instead of a grid.

### 12.4 The flight (the throw)

A per-card cast flight, triggered when a card enters `PLACED`/`REVEALED` (the
`Place` `AnimationCommand` already lands per-card in `activeAnimations`). Roughly
**350–550 ms**, in three beats:

1. **Pluck** — a quick lift off the fan (anticipation); the card rises a few cm.
2. **Toss** — travels to its hashed landing spot on a **low, short arc** (little
   air time). In flight it spins **slightly** about the table-normal (a flat
   spin), the amount hashed so most throws are calm and a few turn more.
3. **Land** — eases down with a **tiny overshoot/settle** (a 1–2 frame bounce),
   arriving flat at its hashed pose on the felt.

- **Trick shot (rare, ~1 in 6 by hash):** a higher lob and/or a fuller flat spin
  — an occasional flourish, deterministic per card so everyone sees the same one.
- **Flat-spin clamp:** spin stays about the vertical axis so a face-down card can
  never flash its face during the toss (preserves the visibility invariant).

### 12.5 Determinism & efficiency (the budget)

- **No new server traffic.** Reuses the existing `Place`/`Flip` `AnimationCommand`
  (`cardIds` + `actorId`) and the per-card `activeAnimations` entry — no
  coordinates, no extra messages.
- **Reuses the `CardMesh` driver + at-rest fast path.** A card animates only
  while its flight is active, then goes idle and costs nothing per frame. Placed
  cards stay individual meshes (as today) — no new draw-call pattern.
- **Hash once, not per frame.** The landing transform and flight profile are a
  cheap integer hash of the id, memoised per card — no `Math.random` in the
  render loop (matches the deterministic-rotation pattern already in
  `PlacedCards.tsx`).
- **Stagger bursts.** When one action places many cards (e.g. a multi-card move),
  stagger their flight starts by a few ms each so a pile-up never spikes a frame.

### 12.6 Where it lives

- **`apps/client/src/lib/table/dropZone.ts`** (new) — pure, deterministic,
  unit-testable helpers: `id → landing { x, z, yaw, lift }` within the zone, and
  `id → flight { arcHeight, spin, trickShot, durationMs }`. No React, no Three.
- **`PlacedCards.tsx`** — replace the 8-column grid with the drop-zone landing
  transform from the helper; order by placement so the stacking lift is stable.
- **`CardMesh.tsx`** — extend the existing flight to honour a cast profile (arc
  height, in-flight flat spin, settle bounce) while a card's `Place` flight is
  active; keep the at-rest fast path and the face-down clamp.
- **Reduced motion** — gate via `prefersReducedMotion()` (`lib/motion.ts`):
  skip pluck/arc/spin, place flat at the hashed spot.

### 12.7 Implementation phases (build order)

> **Commit discipline:** at the end of **each** phase below, once it builds,
> lints and its tests are green, run `git add` → `git commit` (conventional
> message) → `git push` to `origin/main`. Each phase is its own commit — never
> batch them. **No `Co-Authored-By` / tool-attribution trailer** on any commit.

1. **Drop-zone math + helper (pure, tested).** `id → landing` and `id → flight`,
   plus trick-shot selection. Unit tests: landings always in-bounds,
   determinism (same id → same transform), flat-spin clamp, finite values,
   small-deck/empty safety. → commit + push.
2. **Scatter landing.** Swap the `PlacedCards` grid for the hashed landing +
   stacking lift. Static look first (no new flight yet). → commit + push.
3. **Cast flight.** Extend `CardMesh` to play pluck → toss → land with arc, small
   flat spin, and settle when a `Place` flight is active. → commit + push.
4. **Trick shot + variation.** Add the rare higher-lob / extra-spin; tune air
   time and spin ranges for realism. → commit + push.
5. **Stagger + budget pass.** Stagger multi-card places; confirm ~60 fps with 4
   players and a full pile. → commit + push.
6. **Reduced-motion + QA.** Calm flat settle; confirm faces never flash on a
   face-down cast; all tests green. → commit + push.

### 12.8 Acceptance criteria (done =)

- A cast reads as **a hand tossing a card into the middle** — short air time,
  occasional small spin, natural scatter.
- Cards land **only within the invisible centre zone**, and the zone is never
  drawn.
- Every client sees the **same landing + spin** for a given card (deterministic,
  no extra server data).
- A **face-down cast never reveals its face** at any point in the flight.
- **~60 fps** held with 4 players and a full table; idle/landed cards cost
  nothing per frame.
- **Reduced motion** gets a calm, flat placement.

### 12.9 Future / stretch

- Per-seat throw signatures (a player's casts arc from their seat direction).
- A subtle felt dust puff / contact-shadow pulse on landing.
- A "clear table" gather that sweeps the centre pile back into the deck.

---

## 13. Shuffle Style Refinement Pass (signature look & feel)

> A polish pass over the five existing styles (§5). The choreography already
> works; this gives each style an **unmistakable silhouette, rhythm, and
> finish** so a glance tells them apart, and raises every style to the Riffle
> quality bar. Nothing here is causal — the server already decided the order;
> this is pure theatre over a backs-only deck. This pass also **absorbs the
> deferred §9.7 items** (casino camera nudge + dust/glint accents).

### 13.1 Principles (non-negotiable)

- **Distinct DNA.** Each style must differ in *motion*, not just hand pose:
  riffle snaps, overhand chops, wash drifts, split is deliberate, casino is
  crisp. No two should share a rhythm.
- **Faces never show.** The face-down clamp (|tilt|,|bank| ≤ ~1.15 rad) holds in
  every frame of every style and intensity — the security invariant is sacred.
- **Invariants stay green.** `choreography.test.ts` (rest at t=0/1, clamp, no
  teleport >0.6u/frame, finite poses, table bounds, phase contiguity, duration
  monotonicity, seed variance) must pass after **every** step below.
- **Intensity reads.** Low vs High must be visibly different in vigor /
  repetitions / flourish.
- **Budget holds.** One deck draw call (52 instance matrices); ~60 fps with 4
  players and a full table. Reduced motion keeps the calm ~420 ms settle.
- **Determinism, zero new bandwidth.** All variety comes from the cosmetic seed
  (the animation epoch); never from or revealing the real order.

### 13.2 The current gap

The five styles work but share too much motion DNA — interleaves, lifts and
settles feel similar, so they read as variations of one shuffle rather than five
distinct ones. The hands are well-synced but the *deck* needs per-style
character: lead/lag in the riffle cascade, a real chop cadence in the overhand,
buoyancy in the wash, hover and weight in the split, and tremor + a taller finale
in the casino. Per-style durations/phase windows are functional but not yet tuned
so each style *breathes* at its own tempo.

### 13.3 Per-style refinement notes

- **Riffle — the money shot.** Add per-card *lead/lag* so the interleave
  cascades like real thumb release (some cards leading, some trailing) instead of
  a uniform zip. Build a taller, springier **bridge arch** with a genuine
  waterfall ripple that travels along the stack, then a crisp square. High adds
  the double-riffle with a taller arch.
- **Overhand — the kitchen-table chop.** Make the rhythmic *chop* the signature:
  pronounced pull-drop cadence with finger curl/uncurl micro-gestures on the
  working hand, per-packet arc variance (no two hops identical), and an
  accelerating pass cadence. The front-to-back cycling of the stack must read
  clearly.
- **Wash — the horizontal reset.** Push the **flat chaotic field** silhouette
  further (wider, flatter scatter that is unmistakably unlike every vertical
  style), add a gentle per-card buoyancy wobble and more organic noise-driven
  swirl paths, and make the gather more *deliberate* (less snappy) so it reads as
  a full reset, not a quick collapse.
- **Split — the architectural anti-riffle.** Add inter-pile **hover/air gaps**
  (cards hang a beat between source and destination), a hand-elevation *weight
  shift* as it grasps each pile, a clearer tableau read during the hold, and a
  more legible reorder on restack. Calm, methodical, precise.
- **Casino — the dealer flex.** Add fine **finger-tension tremor** during the
  flat table riffles, crisper strip taps, a more readable box cut-and-swap, and a
  **higher bridge finale**. Then land the deferred §9.7 flourishes: a subtle
  camera push-in on the finale and a faint dust/glint accent on the bridge
  cascade — both budget- and reduced-motion-aware.

### 13.4 Where it lives

- **`apps/client/src/lib/shuffle/choreography.ts`** — the per-style builders
  (`buildRiffle/Overhand/Wash/Split/Casino`) and their `cardPose`/`handPose`
  closures; add small reusable, tested motion helpers (lead/lag, buoyancy wobble,
  finger-curl param, hover-hold) used across styles.
- **`apps/client/src/lib/shuffle/timings.ts`** — re-tune `DURATION_MS` and the
  per-style phase windows so each style has its own tempo.
- **`apps/client/src/lib/shuffle/choreography.test.ts`** — keep green; extend
  with any new invariant a helper introduces.
- **`apps/client/src/components/scene/DeckStack.tsx`** — the instanced player; a
  camera nudge for the casino finale is wired here (or in the scene), gated by
  reduced motion.
- **`apps/client/src/lib/audio.ts`** — per-style SFX must stay synced to the
  re-tuned phase boundaries.

### 13.5 Implementation phases (build order)

> **Commit discipline:** at the end of **each** step, once it builds, lints and
> tests are green: `git add` → `git commit` (conventional message) →
> `git push origin main`, then mark the step ✅ here. Each step is its own commit
> — never batch. **No `Co-Authored-By` / tool-attribution trailer** on any
> commit.

1. ✅ **Shared primitives + rhythm re-tune.** Add reusable tested helper motions
   (lead/lag, buoyancy wobble, finger-curl, hover-hold) in `choreography.ts`, and
   re-tune `DURATION_MS` / phase windows in `timings.ts` so each style gets its
   own tempo. No regressions; invariants green. → commit + push + ✅.
2. ✅ **Riffle polish.** Lead/lag interleave + taller springy bridge waterfall +
   crisp square. → commit + push + ✅.
3. ✅ **Overhand polish.** Pronounced chop cadence, finger curl/uncurl, per-packet
   arc variance, accelerating passes, clear cycling. → commit + push + ✅.
4. ✅ **Wash polish.** Wider flat field, buoyancy wobble, organic swirl, deliberate
   gather. → commit + push + ✅.
5. ✅ **Split polish.** Inter-pile hover, weight-shift, clearer tableau + reorder.
   → commit + push + ✅.
6. ✅ **Casino polish (+ deferred §9.7).** Riffle tremor, crisp strip, readable box,
   higher finale; plus the camera push-in and dust/glint accents. Resolve §9.7's
   deferred note. → commit + push + ✅.
7. ⬜ **Cross-style QA.** All invariants green; faces never show; Low vs High
   visibly different; ~60 fps with 4 players; reduced-motion settle calm; SFX
   re-synced. → commit + push + ✅.

### 13.6 Acceptance criteria (done =)

- Each of the five styles is **recognizable at a glance** by its own rhythm and
  finish, all at the Riffle quality bar.
- **Faces never appear** during any shuffle, any style, any intensity.
- **Intensity** is visibly different (Low vs High).
- **~60 fps** held; one deck draw call.
- **Reduced-motion** settle still calm; **SFX** synced per style.
- All `choreography.test.ts` invariants pass.

---

## 14. Dealer Hands — Bigger, More Realistic, Smokier

> The scripted ghost hands (§6) that perform shuffles read small and generic.
> This pass makes them **bigger, more hand-like, and more smoky/ethereal** while
> keeping the floating-spectre identity. **Procedural only** — no GLTF model, no
> new dependencies. Enlarging the hands requires re-fitting the per-phase hand
> keyframes so they still frame the deck; that coupling gets its own step.

### 14.1 Principles (non-negotiable)

- **Still spectral.** Bigger and more detailed, but never solid — the matcap
  rim-glow + smoke must keep them ghostly, and seat-colour tint must stay legible.
- **They drive the deck.** After resizing, the hands must still cradle / chop /
  riffle / swirl / pile the deck correctly, with **no clipping** through the deck
  or the felt, across all five styles.
- **Faces never show.** Nothing in the hand pass may let a card face appear.
- **Budget holds.** Hands stay a few light meshes + sprite smoke; ~60 fps with
  hands + 4 players + a full table. Reduced motion stays hand-free (calm settle).

### 14.2 The current gap

Hands are small (palm sphere radius ~0.15, very thin capsule fingers, overall
span ~0.25–0.3 world units) and read as soft blobs with a 7-wisp smoke plume.
They lack hand-scale presence and anatomical read, and the smoke is modest for
their size. Geometry is in `DealerHands.tsx`; smoke/glow/hand matcap textures in
`theme/matcaps.ts`; per-phase keyframes in `choreography.ts` (`handPose`).

### 14.3 Design notes

- **Scale & proportion.** Enlarge palm, fingers, and thumb, and give a believable
  proportion: finger-length ratio index < middle > ring > pinky, a wider palm,
  and a longer reach. Add an overall group-scale knob so size is tunable in one
  place. Reposition fingers, thumb, wrist knuckle, and the smoke origin to match.
- **Keyframe re-fit.** With larger hands, the per-style/per-phase positions in
  `handPose` need wider offsets so the hands still frame the deck (cradle on
  edge, each hand owning a riffle half, both swirling the wash, etc.) without
  intersecting the deck or table.
- **Anatomical detail.** Add subtle knuckle/joint articulation (a gentle two-
  segment finger bend), a tapered palm contour, and a wrist/forearm stub that
  dissolves into the smoke — more "hand", still spectral. Keep the matcap look.
- **Smoke & ethereal.** More wisps, richer turbulence in `getSmokeTexture()`, a
  longer rise and larger spread, and a forearm "dissolve into smoke" column so a
  bigger hand still reads ghostly rather than solid; tune the palm aura to match.
- **Material & tint.** Refine `getHandMatcap()` (deeper core, brighter rim) so
  the larger surface keeps its fresnel rim-glow and the seat colour still reads.

### 14.4 Where it lives

- **`apps/client/src/components/scene/DealerHands.tsx`** — geometry, scale,
  anatomy, smoke wisp animation, group-scale knob.
- **`apps/client/src/theme/matcaps.ts`** — `getSmokeTexture()`,
  `getGlowTexture()`, `getHandMatcap()` tuning.
- **`apps/client/src/lib/shuffle/choreography.ts`** — `handPose` per-phase
  position re-fit for the larger hands.

### 14.5 Implementation phases (build order)

> Same commit discipline as §13.5: build + lint + tests green → `git add` →
> `git commit` → `git push origin main` → mark ✅. One commit per step, no
> attribution trailer.

1. ✅ **Scale & proportion.** Enlarge and re-proportion the hand geometry; add a
   group-scale knob; reposition parts + smoke origin. → commit + push + ✅.
2. ✅ **Keyframe re-fit.** Re-tune `handPose` per-style/per-phase offsets so the
   larger hands frame the deck without clipping; verify all five styles. → commit
   + push + ✅.
3. ✅ **Anatomical detail.** Knuckle/joint articulation, tapered palm, wrist/
   forearm stub dissolving into smoke. → commit + push + ✅.
4. ✅ **Smoke & ethereal pass.** More/larger wisps, richer turbulence, longer
   rise, forearm smoke column, tuned aura. → commit + push + ✅.
5. ✅ **Material & tint polish.** Refine hand matcap (deeper core, brighter rim);
   confirm seat-colour tint reads. → commit + push + ✅.
6. ✅ **QA pass.** ~60 fps with hands + 4 players; clean fade in/out; no clipping;
   reduced-motion stays hand-free; faces never show. → commit + push + ✅.
   *(Build + lint green; full Vitest suite green, including every
   `choreography.test.ts` finite-pose / fade-envelope assertion for all five
   styles × intensities; dev server boots cleanly and serves `/` without
   errors. The added joints/taper/forearm stub are low-poly (capsules +
   spheres), so the per-hand draw-call increase is small relative to the
   60 fps budget. No headless-browser tooling was available in this
   environment to capture a rendered screenshot or measure live fps — recommend
   a quick manual two-tab look to confirm no clipping at the bridge/box
   phases.)*

### 14.6 Acceptance criteria (done =)

- Hands are **noticeably bigger and more hand-like**, still smoky/ethereal and
  seat-tinted.
- They **drive every style's deck motion** correctly with **no clipping**.
- **Faces never appear**; reduced motion stays a hand-free calm settle.
- **~60 fps** held with hands + 4 players + a full table.

---

## 15. Environment Colour Re-grade (elegant warm hearth)

> The scene reads **too dark to enjoy**. This re-grade lifts it to a more
> elegant, aesthetically pleasing look while **preserving the "living
> illustrated fable" warm-hearth identity** (see `UI.md`). **Retune only** —
> lights, palette, tone-mapping, surfaces. **No new dependencies** (the deferred
> `@react-three/postprocessing` bloom stays deferred). `theme/palette.ts` is the
> single source of truth, so most shifts cascade to scene + chrome.

### 15.1 Principles

- **Lift, don't flatten.** Brighter and more readable, but still warm,
  atmospheric, and elegant — not fluorescent or washed-out.
- **Keep the identity.** Same warm amber (`hearth`) + cool arcane-teal accent
  soul; lift luminance and add a touch of saturation/contrast. No cool/jewel
  departure.
- **One source of truth.** Drive colour from `palette.ts` so the 3D scene and the
  2D chrome stay consistent and re-tunable from one place.
- **No new deps; budget holds.** ~60 fps; consistent across lobby + table;
  reduced motion unaffected.

### 15.2 The current gap (why it's dark)

Compounding causes: ambient intensity `0.35` (very low); canvas background and
backdrop gradient sit in a near-black warm range (`#1a1410` → `#3a2630`); the
felt is a dark matte teal-brown; the cool rim is only `0.45`; tone-mapping/
exposure are left at bare defaults; and there is no bloom. The result is moody
but joyless and hard to read.

### 15.3 Design notes (per surface)

- **Palette luminance lift** (`palette.ts`). Raise the atmosphere + surface
  tokens (`bgDeep/bgDusk/bgEmber`, `feltDeep/feltHi`, `wood/woodHi`) a step or
  two in value and a touch in saturation; keep `hearth`/`arcane` hues and card/
  text legibility. Single source → scene + chrome follow.
- **Light rig re-balance** (`SceneLighting.tsx`). Raise ambient (~0.35 → ~0.5),
  nudge the warm key, and lift the cool rim/fill and hemisphere bounce for depth
  without flatness; soften the contact-shadow opacity so the floor reads lighter.
- **Tone mapping & exposure** (`TableScene.tsx`). Set explicit ACESFilmic tone
  mapping with a tuned exposure and correct colour space for a filmic, elegant
  grade rather than the bare default.
- **Backdrop & atmosphere** (`Atmosphere.tsx`, `SafeEnvironment.tsx`). Brighten
  and refine the gradient stops and the hearth-glow bloom; tune the motes; lift
  the IBL panel brightness so cards, masks, and felt catch a richer sheen.
- **Felt & table** (`Table.tsx`). Lift the felt sheen brightness/contrast and the
  walnut rim highlight so the table feels inviting, not murky.

### 15.4 Where it lives

- `apps/client/src/theme/palette.ts` — colour source of truth.
- `apps/client/src/components/scene/SceneLighting.tsx` — light rig.
- `apps/client/src/components/scene/TableScene.tsx` — tone mapping / exposure.
- `apps/client/src/components/scene/Atmosphere.tsx` — backdrop, hearth glow,
  motes.
- `apps/client/src/components/scene/SafeEnvironment.tsx` — procedural IBL.
- `apps/client/src/components/scene/Table.tsx` — felt + rim.

### 15.5 Implementation phases (build order)

> Same commit discipline as §13.5: build + lint green → `git add` →
> `git commit` → `git push origin main` → mark ✅. One commit per step, no
> attribution trailer.

1. ✅ **Palette luminance lift.** Brighten/enrich atmosphere + surface tokens in
   `palette.ts`, keeping hues and legibility. → commit + push + ✅.
2. ✅ **Light rig re-balance.** Raise ambient/key/rim/hemisphere; soften contact
   shadow. → commit + push + ✅.
3. ✅ **Tone mapping & exposure.** Explicit ACESFilmic + tuned exposure + colour
   space on the Canvas. → commit + push + ✅.
4. ✅ **Backdrop & atmosphere polish.** Brighter elegant gradient + hearth glow +
   motes; lift IBL panels. → commit + push + ✅.
5. ✅ **Felt & table polish.** Lift felt sheen + rim highlight. → commit + push +
   ✅.
6. ✅ **QA pass.** Two-tab readability; warm/elegant (not flat); ~60 fps; lobby +
   table consistent; reduced motion unaffected. → commit + push + ✅.
   *(Build + lint green; dev server boots cleanly and serves `/` and
   `/room/[roomId]` without errors. No headless-browser tooling was available in
   this environment to capture a rendered screenshot — recommend a quick manual
   look in a real browser to confirm the feel.)*

### 15.6 Acceptance criteria (done =)

- Scene is **comfortably readable and elegant**, with the **warm hearth identity
  intact**.
- **No new dependencies**; ~60 fps held; lobby + table consistent.
- Reduced motion unaffected.
