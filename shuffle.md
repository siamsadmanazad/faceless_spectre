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

1. **Choreography engine.** Replace the whole-group wobble in `DeckStack.tsx` with a per-card instanced driver that dispatches to a style choreography function over a phase timeline. (Foundation; no visible behavior change beyond wiring.)
2. **Riffle vertical slice.** Build Riffle end-to-end (split → interleave → bridge → square) to full polish as the quality bar.
3. **Remaining styles.** Overhand, Wash, Split, Casino — each its own choreography function and phase timeline.
4. **Dealer hands.** The scripted ghost-hand system + per-style hand choreography, synced to the deck phases.
5. **Sound.** Per-style synthesized SFX synced to phases.
6. **Intensity.** Wire Low/Med/High to repetitions/speed/flourish per style; client-derived per-style durations.
7. **Polish.** Variation seed, camera nudge (casino), dust/glint accents.
8. **QA.** Reduced-motion path, perf pass (Stats), and a visual check that all five styles are unmistakably distinct and the deck never shows a face.

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
