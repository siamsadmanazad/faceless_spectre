# Realistic Shuffle Algorithms — Design Document

**Status:** Not yet implemented. Current system uses a single Fisher-Yates permutation for all shuffle styles.  
**Planned for:** Phase 6 (Shuffle & Deal UX)  
**Tracking note in code:** `apps/server/src/engine/shuffle.ts` — `fisherYatesShuffle` function header.

---

## Why this matters

Right now every shuffle style (riffle, overhand, wash, casino) calls the same Fisher-Yates algorithm. A single "riffle" in the current system produces more entropy than seven real riffles do. The style is cosmetic theatre on top of perfect randomness.

That's wrong in a meaningful way. Real card games have a skill layer built around shuffle imperfection. Advantage players track cards through riffles. They count how many shuffles were performed. They know that a single overhand barely mixes anything. That skill ceiling is part of what makes a card table interesting — and it cannot exist if every shuffle is perfectly random.

This document specifies how to implement each shuffle type with its real statistical properties.

---

## The core insight (Diaconis, 1992)

A standard 52-card deck needs **exactly 7 riffle shuffles** to reach a distribution that is statistically indistinguishable from uniform. Before 7 riffles, the order is predictable to a trained observer. After 7, the information is gone.

| Riffle passes | Distance from uniform (variation distance) |
|---|---|
| 1 | 1.000 — essentially unshuffled |
| 3 | 0.924 — strong patterns remain |
| 5 | 0.614 — moderate information leaks |
| 7 | 0.334 — effectively random |
| 10 | near 0 |

This is the fundamental number that makes shuffle tracking possible in real casinos. Implement it correctly and players can exploit it. That's the game.

---

## Algorithms to implement

### 1. Riffle (Gilbert-Shannon-Reeds model)

The mathematically accurate model for a human riffle shuffle.

**How it works:**
1. Split the deck at a position drawn from a Binomial(n, 0.5) distribution — roughly in half, with some natural variance.
2. Build the new order by repeatedly dropping the bottom card of one of the two packets. At each step, the probability of dropping from the left packet is `left_remaining / total_remaining`.

**Why this matters statistically:** Cards that were adjacent before the shuffle have a roughly 50% chance of remaining adjacent afterward. After one riffle, the deck retains strong "rising sequences" — runs of cards that were originally in order. The GSR model predicts these exactly.

**Implementation:**

```typescript
import { randomBytes } from 'node:crypto';

function cryptoRandInt(max: number): number {
  // Unbiased integer in [0, max) using rejection sampling
  const bitLength = Math.ceil(Math.log2(max + 1));
  const byteLength = Math.ceil(bitLength / 8);
  const maxValid = Math.floor(256 ** byteLength / max) * max;
  let val: number;
  do {
    val = randomBytes(byteLength).readUIntBE(0, byteLength);
  } while (val >= maxValid);
  return val % max;
}

function binomialSplit(n: number): number {
  // Sample from Binomial(n, 0.5): count heads in n coin flips
  // Efficient for n=52: generate 7 bytes of random bits, popcount the first n bits
  let heads = 0;
  const bytes = randomBytes(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    if ((bytes[Math.floor(i / 8)] >> (i % 8)) & 1) heads++;
  }
  return heads;
}

export function gsrRiffle(arr: string[]): string[] {
  const n = arr.length;
  const splitAt = binomialSplit(n);          // roughly n/2, with natural variance
  let left = arr.slice(0, splitAt);
  let right = arr.slice(splitAt);
  const result: string[] = [];

  while (left.length > 0 && right.length > 0) {
    const total = left.length + right.length;
    // Drop from left with probability left.length / total
    if (cryptoRandInt(total) < left.length) {
      result.push(left.shift()!);
    } else {
      result.push(right.shift()!);
    }
  }
  return result.concat(left, right);
}
```

**Intensity mapping:**

| IntentType intensity | Passes applied |
|---|---|
| `low` | 1 pass — heavy patterns, very trackable |
| `medium` | 3 passes — moderate patterns |
| `high` | 7 passes — approaches uniform (standard casino deal-out) |

---

### 2. Overhand

An extremely weak shuffle. Mathematically equivalent to a random reversal of small packets.

**How it works:** Repeatedly take a small packet (2–8 cards, geometrically distributed) off the top and drop it onto a new pile. Repeat until the deck is exhausted.

**Why this matters:** Overhand shuffles are used casually by non-casino players. A single overhand pass changes almost nothing about the order. Even `high` intensity (many passes) leaves far more information than a single riffle. A player who knows this can treat an overhand shuffle as noise to be ignored.

**Implementation:**

```typescript
export function overhhandShuffle(arr: string[]): string[] {
  const deck = [...arr];
  const result: string[] = [];

  while (deck.length > 0) {
    // Packet size: geometric distribution, capped at remaining deck size
    // Mean packet size ≈ 6 cards
    const maxPacket = Math.min(deck.length, 12);
    const packetSize = Math.min(
      deck.length,
      Math.max(1, Math.floor(-6 * Math.log(1 - randomBytes(1)[0] / 256)) + 1),
    );
    // Take from the top of the working deck, prepend to result (mimics dropping onto a pile)
    result.unshift(...deck.splice(0, packetSize));
  }

  return result;
}
```

**Intensity mapping:**

| Intensity | Passes | Notes |
|---|---|---|
| `low` | 1 | Barely changes order |
| `medium` | 4 | Still far from uniform |
| `high` | 10 | Approaches what a single riffle achieves |

---

### 3. Wash (Scramble)

Cards are spread face-down and pushed around randomly. Used in casinos for the first shuffle of a fresh deck.

**How it works:** Effectively a Fisher-Yates shuffle — because spreading all cards and mixing them with no prior structure produces uniform output. This is what the current code already does for all styles.

**Why this matters:** A wash is the most thorough single-operation shuffle. Players should treat it as a full information reset. Unlike a riffle, there is nothing to track.

**Implementation:** Keep `fisherYatesShuffle` exactly as-is. Route `ShuffleStyle.Wash` here directly.

**Intensity mapping:** Intensity is cosmetically meaningful (how long the animation runs, how vigorously cards are spread) but statistically irrelevant — one wash is enough.

---

### 4. Casino (Box shuffle / multiple riffles)

Standard casino procedure before a deal: 3–7 riffles followed by a cut.

**How it works:** Run `gsrRiffle` N times in sequence, then apply a cut.

**Implementation:**

```typescript
export function casinoShuffle(arr: string[], passes: number): string[] {
  let deck = arr;
  for (let i = 0; i < passes; i++) {
    deck = gsrRiffle(deck);
  }
  return deck;
}
```

**Intensity mapping:**

| Intensity | Riffle passes | Cut |
|---|---|---|
| `low` | 3 | Yes |
| `medium` | 5 | Yes |
| `high` | 7 | Yes |

After 7 passes the deck is statistically uniform. This is the "honest" casino default.

---

### 5. Cut (already implemented)

`cutDeck` in `DeckTruth.ts` is correct. A cut adds zero entropy — it is a circular rotation of the deck order. Its role is positional shift, not randomization. Do not change it.

---

## Changes required in the codebase

### `apps/server/src/engine/shuffle.ts`

Add the four new functions above (`gsrRiffle`, `binomialSplit`, `cryptoRandInt`, `overhhandShuffle`, `casinoShuffle`).

Replace `shuffleDeck(deck, actorId)` signature with:

```typescript
export function shuffleDeck(
  deck: DeckTruth,
  actorId: string,
  style: ShuffleStyle = ShuffleStyle.Wash,
  intensity: ShuffleIntensity = ShuffleIntensity.Medium,
): string
```

Dispatch table inside `shuffleDeck`:

```typescript
const passCount = { low: 1, medium: 3, high: 7 }[intensity] ?? 3;

switch (style) {
  case ShuffleStyle.Riffle:
    for (let i = 0; i < passCount; i++) deck.order = gsrRiffle(deck.order);
    break;
  case ShuffleStyle.Overhand:
    for (let i = 0; i < passCount * 3; i++) deck.order = overhhandShuffle(deck.order);
    break;
  case ShuffleStyle.Casino:
    deck.order = casinoShuffle(deck.order, passCount);
    break;
  case ShuffleStyle.Wash:
  default:
    deck.order = fisherYatesShuffle(deck.order);
    break;
}
```

The audit log entry already captures `seed`, `beforeHash`, `afterHash` — no changes needed there. Add `style` and `intensity` to the history entry so the audit log can reproduce the exact algorithm used.

### `apps/server/src/rooms/TableRoom.ts`

`handleShuffle` already receives `style` and `intensity` — it just doesn't forward them to `shuffleDeck`. Change:

```typescript
// before
shuffleDeck(this.deckTruth, client.sessionId);

// after
shuffleDeck(this.deckTruth, client.sessionId, style, intensity);
```

No other changes to `TableRoom.ts`.

### `packages/shared/src/types.ts`

`ShuffleIntent` already has `style?: ShuffleStyle` and `intensity?: ShuffleIntensity`. No changes needed.

### `apps/client/src/hooks/useColyseus.ts`

`shuffle()` currently sends `ShuffleStyle.Riffle, ShuffleIntensity.Medium` hardcoded. When the UI exposes a style selector, change this to pass user-selected values.

### `apps/client/src/components/hud/HUD.tsx`

Add a style picker to the HUD, wired into the `shuffle` callback. Design is TBD for Phase 6 — could be a dropdown next to the button, or a hold-to-open radial menu.

---

## Tests to write

All tests live in `apps/server/src/__tests__/shuffle.test.ts`.

### Statistical correctness tests

```
gsrRiffle: after 1 pass, adjacent-pair preservation rate > 30%
gsrRiffle: after 7 passes, adjacent-pair preservation rate ≈ 1/51 (≈ 2%) ± 1%
overhhandShuffle: after 1 pass, position displacement mean < 10 cards
casinoShuffle(7): adjacent-pair rate ≈ uniform within ±2%
```

### Audit log tests

```
shuffleDeck with style=Riffle logs style and intensity in history entry
shuffleDeck with different styles produces different history entries
```

### No Math.random test (already exists — must keep passing)

The existing test that monkey-patches `Math.random` and asserts it is never called must continue to pass for all new functions. All new RNG calls must use `randomBytes`.

---

## Skill layer this enables

Once implemented, players can:

- **Shuffle track** through riffles. A player who sees a card at position N before a single riffle can narrow down its post-shuffle position to a probability band. After 3 riffles they can still make useful estimates. After 7 they cannot.
- **Count shuffles**. Requesting fewer shuffles is a deliberate choice — you retain more information about the remaining deck.
- **Distinguish shuffle types**. An opponent who only ever does overhand shuffles is giving the table far more information than one who washes. Experienced players can recognize this and exploit it.
- **Exploit cuts**. A cut after a riffle is predictable — the cut point is visible (or estimable) and shifts the rising sequences cyclically without breaking them.

This is the same skill set exploited legally by shuffle-tracking advantage players in real casinos. It is legal, hard, and real — and it creates a genuine skill ceiling that a perfect Fisher-Yates shuffle removes entirely.

---

## What NOT to do

- **Do not implement shuffle types in the client.** The client receives only an animation command with `style` and `intensity`. It never sees the new deck order until the server sends it as filtered state.
- **Do not let the client choose the number of passes directly.** `intensity` is the only exposed parameter. The pass-count mapping is server-side only.
- **Do not break the audit log.** Every shuffle must produce a `beforeHash`, `afterHash`, `seed`, `style`, and `intensity` entry. Replays must be able to reproduce the exact result from these values — which means the dispatch table above must be deterministic given the same inputs.
- **Do not change `fisherYatesShuffle`.** It is the reference implementation used in the statistical uniformity test (10,000 runs, ±15% tolerance). Keep it intact and route `ShuffleStyle.Wash` to it.
