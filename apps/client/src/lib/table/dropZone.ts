/**
 * Card-cast drop zone — pure, deterministic geometry for "playing" a card onto
 * the table. See `shuffle.md` §12.
 *
 * A cast card lands at a scattered spot inside a small, invisible rectangle at
 * the centre of the felt, and flies there with a short toss (a little air time,
 * a small flat spin, the rare trick shot). Every value here is derived from a
 * hash of the card id, so every client computes the *same* landing and flight
 * with no extra server data — the server still sends just one `Place` command.
 *
 * No React, no Three — kept pure so it is cheap (hash once, never per frame) and
 * unit-testable. Consumers: `PlacedCards.tsx` (resting pose) and `CardMesh.tsx`
 * (the flight). The flat-spin clamp (spin only about the table normal, so a
 * face-down card never flashes its face) is enforced where the spin is applied.
 */

/** Half-extents of the centre zone for card *centres* (world units). */
export const ZONE_HALF_WIDTH = 1.0; // X — fits inside even the tightest felt
export const ZONE_HALF_DEPTH = 0.7; // Z

/** Resting in-plane rotation jitter, radians (~±20°). */
export const MAX_YAW = 0.35;

/** Tiny per-card height jitter so coincident cards don't z-fight. */
export const MAX_LIFT_JITTER = 0.006;

/** Probability a given cast is a flashier "trick shot". */
export const TRICK_SHOT_CHANCE = 1 / 6;

/** Bounds on cast flight duration (ms) — used by tests and the stagger budget. */
export const MIN_CAST_MS = 320;
export const MAX_CAST_MS = 620;

export interface CardLanding {
  /** Resting position within the centre zone. */
  x: number;
  z: number;
  /** Resting in-plane (flat) rotation, radians. */
  yaw: number;
  /** Small height jitter to avoid z-fighting (stacking order is added by the caller). */
  lift: number;
}

export interface CastFlight {
  /** Peak height of the toss arc (world units). */
  arcHeight: number;
  /** Total flat spin applied over the flight, radians (signed). */
  spin: number;
  /** Whether this cast is the rare flashier throw. */
  trickShot: boolean;
  /** Flight duration, ms. */
  durationMs: number;
}

/**
 * 32-bit string hash with an avalanche finish, salted so one id yields many
 * independent streams. Mirrors the id-hash trick already used for per-card
 * rotation in `PlacedCards.tsx`, hardened for multi-value use.
 */
function hash(id: string, salt: number): number {
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/** Deterministic pseudo-random in [0, 1) for a given id + stream salt. */
function rand01(id: string, salt: number): number {
  return hash(id, salt) / 4294967296;
}

/** Where a cast card comes to rest inside the centre zone (deterministic per id). */
export function landingFor(id: string): CardLanding {
  return {
    x: (rand01(id, 1) - 0.5) * 2 * ZONE_HALF_WIDTH,
    z: (rand01(id, 2) - 0.5) * 2 * ZONE_HALF_DEPTH,
    yaw: (rand01(id, 3) - 0.5) * 2 * MAX_YAW,
    lift: rand01(id, 4) * MAX_LIFT_JITTER,
  };
}

/** The flight profile for a cast (deterministic per id). */
export function flightFor(id: string): CastFlight {
  const trickShot = rand01(id, 10) < TRICK_SHOT_CHANCE;
  const r1 = rand01(id, 11);
  const r2 = rand01(id, 12);
  const r3 = rand01(id, 13);
  const sign = rand01(id, 14) < 0.5 ? -1 : 1;

  // A trick shot lobs higher and hangs longer; an ordinary cast is a low, quick toss.
  const arcHeight = trickShot ? 0.55 + r1 * 0.3 : 0.18 + r1 * 0.14;

  // Ordinary spin is biased small (squared) — "a little, sometimes". A trick
  // shot adds a fuller turn (one to two flat rotations).
  const spinMag = trickShot ? Math.PI * (1 + r2) : r2 * r2 * 0.5;
  const spin = spinMag * sign;

  const durationMs = trickShot
    ? 500 + r3 * (MAX_CAST_MS - 500)
    : MIN_CAST_MS + r3 * (470 - MIN_CAST_MS);

  return { arcHeight, spin, trickShot, durationMs };
}
