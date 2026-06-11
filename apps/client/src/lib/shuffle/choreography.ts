/**
 * Shuffle choreography engine — per-card and dealer-hand motion for the five
 * shuffle styles. Pure math, no renderer imports, so it is unit-testable.
 *
 * Principles (see shuffle.md):
 *  - Decorative, never causal: the server decided the order before this plays.
 *  - Faces never show: the deck mesh only carries backs, and poses are clamped
 *    so a card can never tip past face-down (|tilt|, |bank| ≤ FACE_DOWN_LIMIT).
 *  - Variation: a cosmetic per-shuffle seed wobbles split points, packet sizes
 *    and scatter paths. It is derived from the animation start time — never
 *    from (and never revealing) the real card order, which clients don't have.
 *
 * A `ShufflePlan` is built once per shuffle (permutations, packet schedules,
 * scatter targets precomputed); per-frame `cardPose(i, t)` is then pure,
 * allocation-free math over the 52 instances. Each style builder produces the
 * card choreography AND the matching dealer-hand script from the same data,
 * so the deck always looks *handled* — cards move because the hands move them.
 */

import { ShuffleStyle, ShuffleIntensity } from '@faceless-spectre/shared';
import {
  getPhases,
  getShuffleDurationMs,
  REDUCED_MOTION_SETTLE_MS,
  findPhase,
  phaseT,
  type PhaseSpec,
} from './timings';

// Card geometry — must match DeckStack's instanced mesh.
export const CARD_D = 0.008;
/** Resting vertical gap between stacked cards. */
export const LIFT = CARD_D * 1.1;
/** Hard face-down clamp: a card may tip, but never past this (≪ π/2). */
export const FACE_DOWN_LIMIT = 1.15;

/**
 * Card pose in deck-local space. `tilt` pitches the far edge up (about world X),
 * `bank` rolls the side edge (about the depth axis), `yaw` spins flat on the
 * felt. DeckStack composes these onto the face-down base rotation.
 */
export interface CardPose {
  x: number;
  y: number;
  z: number;
  tilt: number;
  bank: number;
  yaw: number;
}

export interface HandPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  opacity: number;
}

export type HandRole = 'left' | 'right';

export interface ShufflePlan {
  style: ShuffleStyle | null;
  durationMs: number;
  count: number;
  phases: PhaseSpec[];
  cardPose(i: number, t: number, out: CardPose): void;
  handPose(role: HandRole, t: number, out: HandPose): void;
}

export function createCardPose(): CardPose {
  return { x: 0, y: 0, z: 0, tilt: 0, bank: 0, yaw: 0 };
}

export function createHandPose(): HandPose {
  return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, opacity: 0 };
}

// ── Math helpers ──────────────────────────────────────────────────────────────

type Rand = () => number;

/** Deterministic, fast PRNG — cosmetic variation only. Never used for outcomes. */
function mulberry32(seed: number): Rand {
  let a = seed >>> 0 || 1;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless per-card hash — stable micro-jitter without storing arrays. */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Centered jitter: deterministic per (card, salt), amplitude `amp`. */
function jit(i: number, salt: number, amp: number): number {
  return (hash01(i + salt) - 0.5) * amp;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, s: number): number => a + (b - a) * s;

function easeInOut(s: number): number {
  return s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2;
}
function easeOut(s: number): number {
  return 1 - Math.pow(1 - s, 3);
}
function easeIn(s: number): number {
  return s * s * s;
}

/** The deck at rest — hand-stacked, not laser-aligned: stable micro-jitter. */
export function restPose(i: number, out: CardPose): void {
  out.x = jit(i, 0, 0.012);
  out.y = i * LIFT;
  out.z = jit(i, 57, 0.012);
  out.tilt = 0;
  out.bank = 0;
  out.yaw = jit(i, 113, 0.06);
}

function clampFaceDown(out: CardPose): void {
  if (out.tilt > FACE_DOWN_LIMIT) out.tilt = FACE_DOWN_LIMIT;
  else if (out.tilt < -FACE_DOWN_LIMIT) out.tilt = -FACE_DOWN_LIMIT;
  if (out.bank > FACE_DOWN_LIMIT) out.bank = FACE_DOWN_LIMIT;
  else if (out.bank < -FACE_DOWN_LIMIT) out.bank = -FACE_DOWN_LIMIT;
}

function setHand(
  out: HandPose,
  x: number,
  y: number,
  z: number,
  pitch: number,
  yaw: number,
  roll: number,
  opacity = 0.88,
): void {
  out.x = x;
  out.y = y;
  out.z = z;
  out.pitch = pitch;
  out.yaw = yaw;
  out.roll = roll;
  out.opacity = opacity;
}

// ── Permutation machinery ─────────────────────────────────────────────────────
//
// Several styles move *positions* around (riffle interleaves, packet passes,
// cuts). We track, per card index i, its stack position before/after each
// stage. All of it is cosmetic: cards are anonymous backs, so the visual
// permutation needn't (and can't) match the server's real one.

interface RifflePerm {
  split: number;
  /** 0 = left half, 1 = right half (by pre-riffle position). */
  half: number[];
  /** Rank within the half, from its bottom. */
  rankInHalf: number[];
  /** Stack position after the interleave. */
  mergedPos: number[];
}

function buildRifflePerm(posBefore: number[], count: number, rng: Rand): RifflePerm {
  const split = Math.max(1, Math.min(count - 1, Math.round(count / 2 + (rng() - 0.5) * 6)));
  // Simulate thumbs releasing in fast alternation, occasionally letting 2 slip.
  const mergedByPos = new Array<number>(count).fill(0);
  let li = 0;
  let ri = split;
  let d = 0;
  let leftTurn = rng() < 0.5;
  while (li < split || ri < count) {
    const burst = rng() < 0.22 ? 2 : 1;
    for (let b = 0; b < burst; b++) {
      if (leftTurn && li < split) mergedByPos[li++] = d++;
      else if (!leftTurn && ri < count) mergedByPos[ri++] = d++;
    }
    if (li >= split) leftTurn = false;
    else if (ri >= count) leftTurn = true;
    else leftTurn = !leftTurn;
  }

  const half = new Array<number>(count);
  const rankInHalf = new Array<number>(count);
  const mergedPos = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const pb = posBefore[i];
    const h = pb >= split ? 1 : 0;
    half[i] = h;
    rankInHalf[i] = h === 1 ? pb - split : pb;
    mergedPos[i] = mergedByPos[pb];
  }
  return { split, half, rankInHalf, mergedPos };
}

interface PacketPass {
  /** Packet index per card (packet 0 = pulled off the top first). */
  packetOf: number[];
  /** Stack position in the destination pile after the pass. */
  destPos: number[];
  /** Sequential activation window per packet, normalized within the pass. */
  windows: Array<{ t0: number; t1: number }>;
}

/**
 * One overhand-style pass: packets pulled off the top, dropped onto the front
 * pile in order (so the old top region ends near the new bottom).
 */
function buildPacketPass(
  posBefore: number[],
  count: number,
  rng: Rand,
  minPacket: number,
  maxPacket: number,
): PacketPass {
  const sizes: number[] = [];
  let rem = count;
  while (rem > 0) {
    const s = Math.min(rem, minPacket + Math.floor(rng() * (maxPacket - minPacket + 1)));
    sizes.push(s);
    rem -= s;
  }
  const K = sizes.length;
  // cumTop[k] = cards already pulled before packet k begins.
  const cumTop = new Array<number>(K + 1).fill(0);
  for (let k = 0; k < K; k++) cumTop[k + 1] = cumTop[k] + sizes[k];

  // Irregular sequential windows — a touch uneven, like real hands.
  const weights = sizes.map(() => 0.85 + rng() * 0.4);
  const total = weights.reduce((a, b) => a + b, 0);
  const windows: Array<{ t0: number; t1: number }> = [];
  let acc = 0;
  for (let k = 0; k < K; k++) {
    const w = weights[k] / total;
    windows.push({ t0: acc, t1: acc + w * 0.82 });
    acc += w;
  }

  const packetOf = new Array<number>(count);
  const destPos = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const pb = posBefore[i];
    // Packet k covers pre-pass positions [count - cumTop[k+1], count - cumTop[k]).
    let k = 0;
    while (pb < count - cumTop[k + 1]) k++;
    const packetStart = count - cumTop[k + 1];
    packetOf[i] = k;
    destPos[i] = cumTop[k] + (pb - packetStart);
  }
  return { packetOf, destPos, windows };
}

function identityPositions(count: number): number[] {
  const a = new Array<number>(count);
  for (let i = 0; i < count; i++) a[i] = i;
  return a;
}

function shuffledIndices(count: number, rng: Rand): number[] {
  const a = identityPositions(count);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

type CardPoseFn = (i: number, t: number, out: CardPose) => void;
type HandPoseFn = (role: HandRole, t: number, out: HandPose) => void;

interface StylePoses {
  card: CardPoseFn;
  hand: HandPoseFn;
}

function lerpPose(from: CardPose, to: CardPose, s: number, out: CardPose): void {
  out.x = lerp(from.x, to.x, s);
  out.y = lerp(from.y, to.y, s);
  out.z = lerp(from.z, to.z, s);
  out.tilt = lerp(from.tilt, to.tilt, s);
  out.bank = lerp(from.bank, to.bank, s);
  out.yaw = lerp(from.yaw, to.yaw, s);
}

// ── Riffle — split → interleave → bridge → square ─────────────────────────────

function buildRiffle(
  count: number,
  intensity: ShuffleIntensity,
  rng: Rand,
  phases: PhaseSpec[],
): StylePoses {
  const deckH = count * LIFT;
  const r1 = buildRifflePerm(identityPositions(count), count, rng);
  const doubleRiffle = intensity === ShuffleIntensity.High;
  const r2 = doubleRiffle ? buildRifflePerm(r1.mergedPos, count, rng) : null;

  const halfX = 0.52 + (rng() - 0.5) * 0.06;
  const pSplit = findPhase(phases, 'split')!;
  const pRiffle = findPhase(phases, 'riffle')!;
  const pResplit = findPhase(phases, 'resplit');
  const pRiffle2 = findPhase(phases, 'riffle2');
  const pBridge = findPhase(phases, 'bridge');
  const pSquare = findPhase(phases, 'square')!;
  const bridgeAmp = doubleRiffle ? 0.42 : 0.3;

  // Half-stack pose for a riffle round (halves tilted so inner corners meet).
  function halfPose(i: number, perm: RifflePerm, out: CardPose): void {
    const dir = perm.half[i] === 1 ? 1 : -1;
    out.x = dir * halfX + jit(i, 7, 0.03);
    out.y = perm.rankInHalf[i] * LIFT;
    out.z = jit(i, 19, 0.04);
    out.yaw = dir * 0.07 + jit(i, 31, 0.05);
    out.bank = -dir * 0.18;
    out.tilt = 0;
  }

  // Merged-stack pose after a riffle round.
  function mergedPose(i: number, perm: RifflePerm, out: CardPose): void {
    out.x = jit(i, 3, 0.015);
    out.y = perm.mergedPos[i] * LIFT;
    out.z = jit(i, 5, 0.015);
    out.yaw = jit(i, 13, 0.04);
    out.bank = 0;
    out.tilt = 0;
  }

  const scratchA = createCardPose();
  const scratchB = createCardPose();

  // The interleave: each card drops from its half into the rising center pile
  // in merged order, with a small flick of fan on the way in.
  function interleave(i: number, perm: RifflePerm, rt: number, out: CardPose): void {
    const tau = perm.mergedPos[i] / count;
    const ds = clamp01((rt * 1.08 - tau) / 0.1);
    if (ds <= 0) {
      halfPose(i, perm, out);
      return;
    }
    halfPose(i, perm, scratchA);
    mergedPose(i, perm, scratchB);
    const s = easeOut(ds);
    lerpPose(scratchA, scratchB, s, out);
    const arc = Math.sin(Math.PI * s);
    out.y += arc * 0.035;
    out.z += arc * jit(i, 11, 0.08);
  }

  const card: CardPoseFn = (i, t, out) => {
    restPose(i, out);
    if (t <= pSplit.start) return;

    const finalPerm = r2 ?? r1;

    // Split — halves slide apart with a small lift.
    if (t < pSplit.end) {
      const s = easeInOut(phaseT(pSplit, t));
      halfPose(i, r1, scratchB);
      lerpPose(out, scratchB, s, out);
      out.y += Math.sin(Math.PI * s) * 0.05;
      return;
    }

    // Riffle #1 — the cascade.
    if (t < pRiffle.end) {
      interleave(i, r1, phaseT(pRiffle, t), out);
      return;
    }

    // High intensity: resplit and a second, crisper riffle.
    if (pResplit && pRiffle2 && r2) {
      if (t < pResplit.end) {
        const s = easeInOut(phaseT(pResplit, t));
        mergedPose(i, r1, scratchA);
        halfPose(i, r2, scratchB);
        lerpPose(scratchA, scratchB, s, out);
        out.y += Math.sin(Math.PI * s) * 0.05;
        return;
      }
      if (t < pRiffle2.end) {
        interleave(i, r2, phaseT(pRiffle2, t), out);
        return;
      }
    }

    // Bridge — the merged deck bows up, then a waterfall front ripples it flat.
    mergedPose(i, finalPerm, scratchA);
    if (pBridge && t < pBridge.end) {
      const bt = phaseT(pBridge, t);
      const ci = finalPerm.mergedPos[i] / count;
      const rise = easeOut(clamp01(bt / 0.35));
      const front = easeIn(clamp01((bt - 0.3) / 0.7));
      const flat = clamp01((front - ci) / 0.12);
      // Damp to zero at the phase end so the square phase starts seamlessly.
      const damp = 1 - easeIn(clamp01((bt - 0.85) / 0.15));
      const env = rise * (1 - flat) * damp;
      out.x = scratchA.x;
      out.y = scratchA.y + Math.sin(Math.PI * ci) * bridgeAmp * env;
      out.z = scratchA.z + Math.sin(Math.PI * ci) * 0.12 * env;
      out.yaw = scratchA.yaw;
      out.bank = 0;
      out.tilt = Math.cos(Math.PI * ci) * 0.5 * env;
      return;
    }

    // Square — align to the neat stack with a couple of decaying side taps.
    const qt = easeInOut(phaseT(pSquare, t));
    restPose(i, scratchB);
    lerpPose(scratchA, scratchB, qt, out);
    out.x += Math.sin(qt * Math.PI * 3) * (1 - qt) * 0.012;
  };

  const hand: HandPoseFn = (role, t, out) => {
    const dir = role === 'left' ? -1 : 1;

    const riffleHand = (rt: number): void => {
      // Each hand owns a half; thumbs tremble as cards release.
      setHand(
        out,
        dir * lerp(halfX + 0.06, 0.2, rt),
        deckH * 0.5 + 0.14 + Math.sin(rt * 70) * 0.012,
        0.08,
        -0.7,
        dir * 0.1,
        dir * 0.3,
      );
    };

    if (t < pSplit.end) {
      const s = easeInOut(phaseT(pSplit, t));
      setHand(
        out,
        lerp(dir * 0.15, dir * (halfX + 0.06), s),
        lerp(deckH + 0.4, deckH * 0.5 + 0.16, s),
        lerp(0.35, 0.1, s),
        -0.6,
        0,
        dir * 0.25 * s,
      );
      return;
    }
    if (t < pRiffle.end) {
      riffleHand(phaseT(pRiffle, t));
      return;
    }
    if (pResplit && t < pResplit.end) {
      const s = easeInOut(phaseT(pResplit, t));
      setHand(
        out,
        lerp(dir * 0.2, dir * (halfX + 0.06), s),
        deckH * 0.5 + 0.16,
        0.1,
        -0.65,
        0,
        dir * 0.25,
      );
      return;
    }
    if (pRiffle2 && t < pRiffle2.end) {
      riffleHand(phaseT(pRiffle2, t));
      return;
    }
    if (pBridge && t < pBridge.end) {
      // Fingers bow the deck into an arch, then let it spring flat.
      const bt = phaseT(pBridge, t);
      const arch = Math.sin(Math.PI * clamp01(bt / 0.6));
      setHand(out, dir * 0.18, deckH * 0.6 + 0.16 + arch * 0.28, 0.06, -1.0, 0, dir * 0.15);
      return;
    }
    // Square — small side pats.
    const qt = phaseT(pSquare, t);
    setHand(
      out,
      dir * (0.3 + Math.sin(qt * Math.PI * 3) * 0.05 * (1 - qt)),
      deckH * 0.6 + 0.12,
      0.05,
      -0.8,
      0,
      dir * 0.5,
    );
  };

  return { card, hand };
}

// ── Overhand — packets chopped off the back onto the front pile ───────────────

function buildOverhand(
  count: number,
  intensity: ShuffleIntensity,
  rng: Rand,
  phases: PhaseSpec[],
): StylePoses {
  const deckH = count * LIFT;
  const passes =
    intensity === ShuffleIntensity.Low ? 1 : intensity === ShuffleIntensity.Medium ? 3 : 5;
  const pPasses = findPhase(phases, 'passes')!;
  const pSquare = findPhase(phases, 'square')!;

  // Each pass slightly faster than the one before.
  const weights: number[] = [];
  for (let p = 0; p < passes; p++) weights.push(1 / (1 + 0.18 * p));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const passWin: Array<{ t0: number; t1: number }> = [];
  let acc = pPasses.start;
  const span = pPasses.end - pPasses.start;
  for (let p = 0; p < passes; p++) {
    const w = (weights[p] / totalW) * span;
    passWin.push({ t0: acc, t1: acc + w });
    acc += w;
  }

  // Chain packet structure across passes.
  const passData: PacketPass[] = [];
  let posBefore = identityPositions(count);
  for (let p = 0; p < passes; p++) {
    const pd = buildPacketPass(posBefore, count, rng, 5, 10);
    passData.push(pd);
    posBefore = pd.destPos;
  }
  const finalPos = posBefore;

  const Z_SRC = -0.13;
  const Z_DST = 0.17;
  const TILT_SRC = 0.14;
  const PACKET_SPAN = 0.84; // tail of each pass = pile gliding back for the next

  /** Locate the active pass and its local time; -1 when t is past all passes. */
  function passAt(t: number): { p: number; pt: number } {
    let p = passes - 1;
    for (let k = 0; k < passes; k++) {
      if (t < passWin[k].t1) {
        p = k;
        break;
      }
    }
    const pw = passWin[p];
    return { p, pt: clamp01((t - pw.t0) / (pw.t1 - pw.t0)) };
  }

  const card: CardPoseFn = (i, t, out) => {
    restPose(i, out);
    if (t <= pPasses.start) return;

    if (t < pPasses.end) {
      const { p, pt } = passAt(t);
      const pd = passData[p];
      const before = p === 0 ? i : passData[p - 1].destPos[i];
      const srcY = before * LIFT;
      const dstY = pd.destPos[i] * LIFT;
      const jx = jit(i, 101 + p * 37, 0.024);
      const win = pd.windows[pd.packetOf[i]];

      if (pt < PACKET_SPAN) {
        const lt = pt / PACKET_SPAN;
        const s = clamp01((lt - win.t0) / Math.max(1e-4, win.t1 - win.t0));
        if (s <= 0) {
          // Waiting on the cradled source stack, tilted on edge.
          out.x += jx;
          out.y = srcY;
          out.z = Z_SRC;
          out.tilt = TILT_SRC;
        } else if (s >= 1) {
          out.x += jx;
          out.y = dstY;
          out.z = Z_DST;
          out.tilt = 0.02;
        } else {
          // The packet hop: lift, short arc forward, drop with a settle.
          const e = easeInOut(s);
          const arc = Math.sin(Math.PI * e);
          out.x += jx;
          out.y = lerp(srcY, dstY, e) + arc * 0.1;
          out.z = lerp(Z_SRC, Z_DST, e);
          out.tilt = lerp(TILT_SRC, 0.02, e) + arc * 0.25;
          out.yaw += jit(i, p * 37, 0.12) * arc;
        }
      } else {
        // Return slide — the reformed pile glides back to the cradle.
        const s = easeInOut((pt - PACKET_SPAN) / (1 - PACKET_SPAN));
        const isLast = p === passes - 1;
        out.x += jx;
        out.y = dstY;
        out.z = isLast ? Z_DST : lerp(Z_DST, Z_SRC, s);
        out.tilt = isLast ? 0.02 : lerp(0.02, TILT_SRC, s);
      }
      return;
    }

    // Square — the front pile slides home and evens out.
    const qt = easeInOut(phaseT(pSquare, t));
    const fromY = finalPos[i] * LIFT;
    restPose(i, out);
    out.y = lerp(fromY, out.y, qt);
    out.z = lerp(Z_DST, out.z, qt);
    out.tilt = lerp(0.02, 0, qt);
  };

  const hand: HandPoseFn = (role, t, out) => {
    if (role === 'left') {
      // The off-hand cradles the source stack, rocking gently.
      const y = Math.max(0.18, deckH * 0.4);
      setHand(out, -0.07, y + Math.sin(t * 40) * 0.015, Z_SRC + 0.04, -0.35, 0, 0.3, 0.92);
      return;
    }
    if (t < pPasses.end && t > pPasses.start) {
      // The working hand chops in sync with the active packet window.
      const { p, pt } = passAt(t);
      const pd = passData[p];
      let chop = 0; // 0 = raised over the back, 1 = released at the front
      if (pt < PACKET_SPAN) {
        const lt = pt / PACKET_SPAN;
        for (const win of pd.windows) {
          if (lt >= win.t0 && lt <= win.t1) {
            chop = (lt - win.t0) / Math.max(1e-4, win.t1 - win.t0);
            break;
          }
        }
      }
      const swing = easeInOut(chop);
      const arc = Math.sin(Math.PI * swing);
      setHand(
        out,
        0.06,
        deckH * 0.6 + 0.2 + arc * 0.14,
        lerp(Z_SRC - 0.02, Z_DST + 0.04, swing),
        -0.6,
        0,
        -0.15,
        0.92,
      );
      return;
    }
    // Square — the working hand settles above the pile.
    const qt = phaseT(pSquare, t);
    setHand(out, 0.06, deckH * 0.6 + 0.24 + qt * 0.08, 0.1, -0.6, 0, 0, 0.92);
  };

  return { card, hand };
}

// ── Wash — spread flat, swirl, gather ─────────────────────────────────────────

function buildWash(
  count: number,
  intensity: ShuffleIntensity,
  rng: Rand,
  phases: PhaseSpec[],
): StylePoses {
  const deckH = count * LIFT;
  const spreadScale =
    intensity === ShuffleIntensity.Low ? 0.85 : intensity === ShuffleIntensity.Medium ? 1.0 : 1.2;

  const tx = new Array<number>(count);
  const tz = new Array<number>(count);
  const tyaw = new Array<number>(count);
  const layerY = new Array<number>(count);
  const swRad = new Array<number>(count);
  const swSpeed = new Array<number>(count);
  const swPhase = new Array<number>(count);
  const dOut = new Array<number>(count);
  const dIn = new Array<number>(count);

  const layers = shuffledIndices(count, rng);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rng());
    const a = rng() * Math.PI * 2;
    tx[i] = Math.cos(a) * 1.25 * spreadScale * r;
    tz[i] = Math.sin(a) * 0.85 * spreadScale * r;
    tyaw[i] = (rng() * 2 - 1) * 2.6;
    layerY[i] = layers[i] * 0.0042 + 0.003;
    swRad[i] = 0.05 + rng() * 0.11;
    swSpeed[i] = (2 + rng() * 3) * (rng() < 0.5 ? -1 : 1);
    swPhase[i] = rng() * Math.PI * 2;
    dOut[i] = rng() * 0.3;
    dIn[i] = rng() * 0.25;
  }

  const pSpread = findPhase(phases, 'spread')!;
  const pSwirl = findPhase(phases, 'swirl')!;
  const pGather = findPhase(phases, 'gather')!;
  const pSquare = findPhase(phases, 'square')!;
  const vigor = intensity === ShuffleIntensity.High ? 1.3 : 1;

  const card: CardPoseFn = (i, t, out) => {
    restPose(i, out);
    if (t <= pSpread.start) return;

    const yawEnd = tyaw[i] + swSpeed[i] * 0.6;

    if (t < pSwirl.end) {
      // Spread — staggered fan-out from the stack to the scattered field.
      const sp = easeOut(clamp01((phaseT(pSpread, t) - dOut[i]) / (1 - dOut[i])));
      out.x = lerp(out.x, tx[i], sp);
      out.z = lerp(out.z, tz[i], sp);
      out.y = lerp(out.y, layerY[i], sp) + Math.sin(Math.PI * sp) * 0.04;
      out.yaw = lerp(out.yaw, tyaw[i], sp);

      // Swirl — noisy circular drift; envelope is zero at both ends so the
      // gather phase starts exactly from the scatter targets.
      const wt = phaseT(pSwirl, t);
      if (wt > 0) {
        const env = Math.sin(Math.PI * wt);
        const ang = swPhase[i] + wt * swSpeed[i] * 4 * vigor;
        out.x += Math.cos(ang) * swRad[i] * env;
        out.z += Math.sin(ang) * swRad[i] * env;
        out.y += Math.sin(ang * 2) * 0.003 * env;
        out.yaw = tyaw[i] + wt * swSpeed[i] * 0.6;
      }
      return;
    }

    // Gather — sweep back to center and restack.
    if (t < pGather.end) {
      const g = easeInOut(clamp01((phaseT(pGather, t) - dIn[i]) / (1 - dIn[i])));
      restPose(i, out);
      const rx = out.x;
      const ry = out.y;
      const rz = out.z;
      const ryaw = out.yaw;
      out.x = lerp(tx[i], rx, g);
      out.z = lerp(tz[i], rz, g);
      out.y = lerp(layerY[i], ry, g) + Math.sin(Math.PI * g) * 0.05;
      out.yaw = lerp(yawEnd, ryaw, g);
      return;
    }

    // Square — settle with a tiny compress.
    const qt = phaseT(pSquare, t);
    out.y -= Math.sin(Math.PI * qt) * 0.004 * (count > 0 ? i / count : 0);
  };

  const hand: HandPoseFn = (role, t, out) => {
    // Both palms flat, sweeping overlapping circles over the scattered field.
    const dir = role === 'left' ? -1 : 1;
    const ph = role === 'left' ? Math.PI : 0.6;
    let radius: number;
    let ang: number;
    let y: number;
    if (t < pSpread.end) {
      const s = easeOut(phaseT(pSpread, t));
      radius = lerp(0.12, 0.55 * spreadScale, s);
      ang = ph + s * 1.5 * dir;
      y = lerp(deckH + 0.3, 0.26, s);
    } else if (t < pSwirl.end) {
      const wt = phaseT(pSwirl, t);
      radius = 0.55 * spreadScale + Math.sin(wt * Math.PI * 2) * 0.12;
      ang = ph + 1.5 * dir + wt * Math.PI * 3 * dir * vigor;
      y = 0.24 + Math.sin(wt * Math.PI * 5) * 0.02;
    } else {
      // Gather and square — spiral inward, lifting away.
      const g = easeInOut(phaseT(pGather, t));
      radius = lerp(0.55 * spreadScale, 0.12, g);
      ang = ph + 1.5 * dir + Math.PI * 3 * dir * vigor + g * 1.2 * dir;
      y = lerp(0.24, deckH + 0.28, g);
    }
    setHand(out, Math.cos(ang) * radius, y, Math.sin(ang) * radius * 0.7, -1.2, 0, 0, 0.9);
  };

  return { card, hand };
}

// ── Split — divide into piles, hold, restack in a new order ───────────────────

function buildSplit(
  count: number,
  intensity: ShuffleIntensity,
  rng: Rand,
  phases: PhaseSpec[],
): StylePoses {
  const deckH = count * LIFT;
  const P = Math.min(
    intensity === ShuffleIntensity.Low ? 3 : intensity === ShuffleIntensity.Medium ? 4 : 5,
    Math.max(2, Math.floor(count / 2)),
  );

  // Near-equal contiguous chunk sizes with a little wobble.
  const sizes = new Array<number>(P).fill(Math.floor(count / P));
  for (let k = 0; k < count % P; k++) sizes[k] += 1;
  for (let k = 0; k < P - 1; k++) {
    const shift = Math.floor((rng() - 0.5) * sizes[k] * 0.3);
    if (sizes[k] - shift > 1 && sizes[k + 1] + shift > 1) {
      sizes[k] -= shift;
      sizes[k + 1] += shift;
    }
  }

  // Pile 0 is the top chunk (lifted off first) — portions cut off the top.
  const cumTop = new Array<number>(P + 1).fill(0);
  for (let k = 0; k < P; k++) cumTop[k + 1] = cumTop[k] + sizes[k];
  const pileOf = new Array<number>(count);
  const rankInPile = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    let k = 0;
    while (i < count - cumTop[k + 1]) k++;
    pileOf[i] = k;
    rankInPile[i] = i - (count - cumTop[k + 1]);
  }

  // A row of pile spots across the felt — shared with the hand script.
  // Tighter spacing for wide rows keeps the tableau on the felt and the
  // pile-carry speed calm (split reads as method, not flourish).
  const spacing = P >= 5 ? 0.78 : 0.92;
  const px = new Array<number>(P);
  const pz = new Array<number>(P);
  const pyaw = new Array<number>(P);
  for (let k = 0; k < P; k++) {
    px[k] = (k - (P - 1) / 2) * spacing + (rng() - 0.5) * 0.08;
    pz[k] = 0.14 + (rng() - 0.5) * 0.1;
    pyaw[k] = (rng() - 0.5) * 0.16;
  }

  // Reassembly order — a genuine reorder, never the identity.
  const order = shuffledIndices(P, rng);
  if (order.every((v, idx) => v === idx)) {
    const first = order[0];
    order[0] = order[1];
    order[1] = first;
  }
  // slotOf[k] = when pile k is restacked; destBase[k] = its height in the new stack.
  const slotOf = new Array<number>(P);
  const destBase = new Array<number>(P);
  let baseAcc = 0;
  for (let m = 0; m < P; m++) {
    const k = order[m];
    slotOf[k] = m;
    destBase[k] = baseAcc;
    baseAcc += sizes[k];
  }

  const pDivide = findPhase(phases, 'divide')!;
  const pHold = findPhase(phases, 'hold')!;
  const pReassemble = findPhase(phases, 'reassemble')!;
  const pSquare = findPhase(phases, 'square')!;

  // Sequential pile windows with a slight overlap (the next pile starts as the
  // previous lands) — wider windows keep the carry speed deliberate, and the
  // formula guarantees the last pile lands exactly when the phase ends.
  const OVERLAP = 1.35;
  const pileS = (dt: number, k: number): number =>
    clamp01((dt * (P - 1 + OVERLAP) - k) / OVERLAP);
  const activePile = (dt: number): number =>
    Math.max(0, Math.min(P - 1, Math.floor(dt * (P - 1 + OVERLAP))));

  const card: CardPoseFn = (i, t, out) => {
    restPose(i, out);
    if (t <= pDivide.start) return;

    const k = pileOf[i];
    const pileY = rankInPile[i] * LIFT;
    const destY = (destBase[k] + rankInPile[i]) * LIFT;

    // Divide — piles lift off the top one at a time, deliberately.
    if (t < pHold.end) {
      const dt = phaseT(pDivide, t);
      const s = easeInOut(pileS(dt, k));
      if (s <= 0) return; // still in the source stack
      const arc = Math.sin(Math.PI * s) * 0.18;
      out.x = lerp(out.x, px[k], s);
      out.y = lerp(out.y, pileY, s) + arc;
      out.z = lerp(out.z, pz[k], s);
      out.yaw = lerp(out.yaw, pyaw[k], s);
      return;
    }

    // Reassemble — piles return to a central stack in the new order.
    if (t < pReassemble.end) {
      const rt = phaseT(pReassemble, t);
      const s = easeInOut(pileS(rt, slotOf[k]));
      const arc = Math.sin(Math.PI * s) * 0.16;
      out.x = lerp(px[k], jit(i, 9, 0.02), s);
      out.y = lerp(pileY, destY, s) + arc;
      out.z = lerp(pz[k], jit(i, 23, 0.02), s);
      out.yaw = lerp(pyaw[k], jit(i, 41, 0.05), s);
      return;
    }

    // Square — heights even out into the resting stack.
    const qt = easeInOut(phaseT(pSquare, t));
    const rx = out.x;
    const ry = out.y;
    const rz = out.z;
    const ryaw = out.yaw;
    out.x = lerp(jit(i, 9, 0.02), rx, qt);
    out.y = lerp(destY, ry, qt);
    out.z = lerp(jit(i, 23, 0.02), rz, qt);
    out.yaw = lerp(jit(i, 41, 0.05), ryaw, qt);
  };

  const hand: HandPoseFn = (role, t, out) => {
    if (role === 'left') {
      // The off-hand hovers calmly beside the work.
      setHand(out, -0.45, deckH + 0.3 + Math.sin(t * 8) * 0.01, 0.25, -0.5, 0, 0.2, 0.8);
      return;
    }
    // The working hand carries each pile out, then back in the new order.
    if (t < pHold.end) {
      const dt = phaseT(pDivide, t);
      const k = activePile(dt);
      const s = pileS(dt, k);
      const reach = Math.sin(Math.PI * clamp01(s)); // out and back per pile
      setHand(
        out,
        px[k] * easeInOut(clamp01(s * 1.4)),
        deckH * 0.7 + 0.22 + (1 - reach) * 0.08,
        lerp(0.08, pz[k] + 0.06, reach),
        -0.7,
        0,
        0,
        0.92,
      );
      return;
    }
    if (t < pReassemble.end) {
      const rt = phaseT(pReassemble, t);
      const m = activePile(rt);
      const k = order[m];
      const s = pileS(rt, m);
      // Grab pile k, carry it to the center stack.
      setHand(
        out,
        px[k] * (1 - easeInOut(clamp01(s / 0.7))),
        0.3 + Math.sin(Math.PI * s) * 0.12,
        lerp(pz[k] + 0.06, 0.08, easeInOut(s)),
        -0.7,
        0,
        0,
        0.92,
      );
      return;
    }
    const qt = phaseT(pSquare, t);
    setHand(out, 0.08, deckH + 0.18 + qt * 0.1, 0.1, -0.7, 0, 0, 0.92);
  };

  return { card, hand };
}

// ── Casino — table riffle ×2, strip, box, bridge finale ───────────────────────

function buildCasino(
  count: number,
  intensity: ShuffleIntensity,
  rng: Rand,
  phases: PhaseSpec[],
): StylePoses {
  const deckH = count * LIFT;
  const idPos = identityPositions(count);
  const r1 = buildRifflePerm(idPos, count, rng);
  const strip = buildPacketPass(r1.mergedPos, count, rng, 5, 9);
  const hasR2 = intensity !== ShuffleIntensity.Low;
  const r2 = hasR2 ? buildRifflePerm(strip.destPos, count, rng) : null;
  const posBeforeBox = r2 ? r2.mergedPos : strip.destPos;

  const cut = Math.max(1, Math.min(count - 1, Math.round(count / 2 + (rng() - 0.5) * 4)));
  const boxPos = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const pb = posBeforeBox[i];
    boxPos[i] = pb >= cut ? pb - cut : pb + (count - cut);
  }

  const pRiffle1 = findPhase(phases, 'riffle1')!;
  const pStrip = findPhase(phases, 'strip')!;
  const pRiffle2 = findPhase(phases, 'riffle2');
  const pBox = findPhase(phases, 'box')!;
  const pBridge = findPhase(phases, 'bridge')!;
  const pSquare = findPhase(phases, 'square')!;
  const bridgeAmp = intensity === ShuffleIntensity.High ? 0.5 : 0.42;

  const STRIP_Z_SRC = -0.08;
  const STRIP_Z_DST = 0.12;
  // The stack the box phase starts from sits where the previous phase left it.
  const boxZFrom = hasR2 ? 0 : STRIP_Z_DST;

  // A *table* riffle — flat and low, halves angled corner-to-corner.
  function flatRiffle(
    i: number,
    perm: RifflePerm,
    posBefore: number[],
    pt: number,
    zFrom: number,
    out: CardPose,
  ): void {
    const dir = perm.half[i] === 1 ? 1 : -1;
    const hx = dir * 0.5 + jit(i, 7, 0.03);
    const hy = perm.rankInHalf[i] * LIFT;
    const hz = jit(i, 19, 0.05) + dir * 0.06;
    const hyaw = dir * 0.32 + jit(i, 31, 0.05);

    if (pt < 0.3) {
      // Halves slide apart along the felt.
      const s = easeInOut(pt / 0.3);
      out.x = lerp(jit(i, 9, 0.02), hx, s);
      out.y = lerp(posBefore[i] * LIFT, hy, s);
      out.z = lerp(zFrom + jit(i, 23, 0.02), hz, s);
      out.yaw = lerp(out.yaw, hyaw, s);
      return;
    }
    // Interleave low and horizontal.
    const mt = (pt - 0.3) / 0.7;
    const tau = perm.mergedPos[i] / count;
    const ds = clamp01((mt * 1.08 - tau) / 0.12);
    if (ds <= 0) {
      out.x = hx;
      out.y = hy;
      out.z = hz;
      out.yaw = hyaw;
      return;
    }
    const s = easeOut(ds);
    out.x = lerp(hx, jit(i, 3, 0.015), s);
    out.y = lerp(hy, perm.mergedPos[i] * LIFT, s) + Math.sin(Math.PI * s) * 0.015;
    out.z = lerp(hz, jit(i, 5, 0.015), s);
    out.yaw = lerp(hyaw, jit(i, 13, 0.04), s);
  }

  const card: CardPoseFn = (i, t, out) => {
    restPose(i, out);
    if (t <= pRiffle1.start) return;

    // Table riffle #1.
    if (t < pRiffle1.end) {
      flatRiffle(i, r1, idPos, phaseT(pRiffle1, t), 0, out);
      return;
    }

    // Strip — tight fast packets pulled off the top, re-dropped forward.
    if (t < pStrip.end) {
      const st = phaseT(pStrip, t);
      const win = strip.windows[strip.packetOf[i]];
      const srcY = r1.mergedPos[i] * LIFT;
      const dstY = strip.destPos[i] * LIFT;
      const jx = jit(i, 67, 0.02);
      const s = clamp01((st - win.t0) / Math.max(1e-4, win.t1 - win.t0));
      // Waiting cards ease back as the dealer draws the stack toward them.
      const zSrc = lerp(0, STRIP_Z_SRC, clamp01(st / 0.12));
      if (s <= 0) {
        out.x = jx;
        out.y = srcY;
        out.z = zSrc;
        out.tilt = 0.05;
      } else if (s >= 1) {
        out.x = jx;
        out.y = dstY;
        out.z = STRIP_Z_DST;
        out.tilt = 0.01;
      } else {
        const e = easeInOut(s);
        const arc = Math.sin(Math.PI * e);
        out.x = jx;
        out.y = lerp(srcY, dstY, e) + arc * 0.06;
        out.z = lerp(zSrc, STRIP_Z_DST, e);
        out.tilt = 0.05 + arc * 0.15;
      }
      return;
    }

    // Table riffle #2 (medium/high).
    if (pRiffle2 && r2 && t < pRiffle2.end) {
      flatRiffle(i, r2, strip.destPos, phaseT(pRiffle2, t), STRIP_Z_DST, out);
      return;
    }

    // Box — cut and swap the halves.
    if (t < pBox.end) {
      const bt = phaseT(pBox, t);
      const isTop = posBeforeBox[i] >= cut;
      const srcY = posBeforeBox[i] * LIFT;
      const dstY = boxPos[i] * LIFT;
      // The top portion is lifted out first; the bottom follows it up.
      const s = easeInOut(isTop ? clamp01(bt / 0.65) : clamp01((bt - 0.3) / 0.7));
      const arc = Math.sin(Math.PI * s);
      out.x = jit(i, 3, 0.02) + (isTop ? arc * 0.28 : 0);
      out.y = lerp(srcY, dstY, s) + (isTop ? arc * 0.2 : arc * 0.04);
      out.z = lerp(boxZFrom, jit(i, 5, 0.02), s) + (isTop ? -arc * 0.16 : arc * 0.08);
      out.yaw = jit(i, 13, 0.04);
      return;
    }

    // Bridge finale — the tall arch and cascading waterfall.
    if (t < pBridge.end) {
      const bt = phaseT(pBridge, t);
      const ci = boxPos[i] / count;
      const rise = easeOut(clamp01(bt / 0.35));
      const front = easeIn(clamp01((bt - 0.3) / 0.7));
      const flat = clamp01((front - ci) / 0.12);
      const damp = 1 - easeIn(clamp01((bt - 0.85) / 0.15));
      const env = rise * (1 - flat) * damp;
      out.x = jit(i, 3, 0.015);
      out.y = boxPos[i] * LIFT + Math.sin(Math.PI * ci) * bridgeAmp * env;
      out.z = jit(i, 5, 0.015) + Math.sin(Math.PI * ci) * 0.14 * env;
      out.yaw = jit(i, 13, 0.04);
      out.tilt = Math.cos(Math.PI * ci) * 0.55 * env;
      return;
    }

    // Square — flourish done, the deck evens out.
    const qt = easeInOut(phaseT(pSquare, t));
    const fromY = boxPos[i] * LIFT;
    restPose(i, out);
    out.x = lerp(jit(i, 3, 0.015), out.x, qt);
    out.y = lerp(fromY, out.y, qt);
    out.z = lerp(jit(i, 5, 0.015), out.z, qt);
  };

  const hand: HandPoseFn = (role, t, out) => {
    const dir = role === 'left' ? -1 : 1;

    const flatRiffleHand = (rt: number): void => {
      setHand(
        out,
        dir * lerp(0.56, 0.18, easeInOut(rt)),
        0.2 + Math.sin(rt * 60) * 0.01,
        dir * 0.05,
        -0.9,
        dir * 0.3,
        dir * 0.15,
        0.92,
      );
    };

    if (t < pRiffle1.end) {
      flatRiffleHand(phaseT(pRiffle1, t));
      return;
    }
    if (t < pStrip.end) {
      const st = phaseT(pStrip, t);
      if (role === 'left') {
        setHand(out, -0.12, 0.24, STRIP_Z_SRC, -0.8, 0, 0.2, 0.92);
        return;
      }
      // Right hand runs the strip — quick chops synced to the packet windows.
      let chop = 0;
      for (const win of strip.windows) {
        if (st >= win.t0 && st <= win.t1) {
          chop = (st - win.t0) / Math.max(1e-4, win.t1 - win.t0);
          break;
        }
      }
      const swing = easeInOut(chop);
      setHand(
        out,
        0.1,
        0.26 + Math.sin(Math.PI * swing) * 0.1,
        lerp(STRIP_Z_SRC, STRIP_Z_DST + 0.05, swing),
        -0.7,
        0,
        -0.1,
        0.92,
      );
      return;
    }
    if (pRiffle2 && t < pRiffle2.end) {
      flatRiffleHand(phaseT(pRiffle2, t));
      return;
    }
    if (t < pBox.end) {
      const bt = phaseT(pBox, t);
      const arc = Math.sin(Math.PI * easeInOut(bt));
      if (role === 'right') {
        // Lifts the top portion out and over.
        setHand(out, 0.12 + arc * 0.26, deckH * 0.6 + 0.18 + arc * 0.2, -arc * 0.14, -0.7, 0, 0, 0.92);
      } else {
        setHand(out, -0.16, deckH * 0.4 + 0.14, 0.08 + arc * 0.06, -0.6, 0, 0.15, 0.92);
      }
      return;
    }
    if (t < pBridge.end) {
      const bt = phaseT(pBridge, t);
      const arch = Math.sin(Math.PI * clamp01(bt / 0.6));
      setHand(out, dir * 0.18, deckH * 0.6 + 0.16 + arch * 0.34, 0.06, -1.0, 0, dir * 0.15);
      return;
    }
    const qt = phaseT(pSquare, t);
    setHand(
      out,
      dir * (0.3 + Math.sin(qt * Math.PI * 3) * 0.05 * (1 - qt)),
      deckH * 0.6 + 0.12,
      0.05,
      -0.8,
      0,
      dir * 0.5,
    );
  };

  return { card, hand };
}

// ── Public plan builders ──────────────────────────────────────────────────────

export function buildShufflePlan(
  style: ShuffleStyle,
  intensity: ShuffleIntensity,
  count: number,
  seed: number,
): ShufflePlan {
  const durationMs = getShuffleDurationMs(style, intensity);
  // A near-empty deck has nothing to choreograph — play the quiet settle.
  if (count < 4) return buildSettlePlan(count, seed, durationMs);

  const rng = mulberry32(seed);
  const phases = getPhases(style, intensity);

  let poses: StylePoses;
  switch (style) {
    case ShuffleStyle.Riffle:
      poses = buildRiffle(count, intensity, rng, phases);
      break;
    case ShuffleStyle.Overhand:
      poses = buildOverhand(count, intensity, rng, phases);
      break;
    case ShuffleStyle.Wash:
      poses = buildWash(count, intensity, rng, phases);
      break;
    case ShuffleStyle.Split:
      poses = buildSplit(count, intensity, rng, phases);
      break;
    case ShuffleStyle.Casino:
      poses = buildCasino(count, intensity, rng, phases);
      break;
    default:
      poses = buildRiffle(count, ShuffleIntensity.Medium, rng, phases);
  }

  return {
    style,
    durationMs,
    count,
    phases,
    cardPose(i, t, out) {
      poses.card(i, clamp01(t), out);
      clampFaceDown(out);
    },
    handPose(role, t, out) {
      poses.hand(role, clamp01(t), out);
      out.opacity *= fadeEnvelope(clamp01(t));
    },
  };
}

/** Reduced motion: a short, calm breathe-and-settle. No hands, no flourish. */
export function buildSettlePlan(
  count: number,
  seed: number,
  durationMs: number = REDUCED_MOTION_SETTLE_MS,
): ShufflePlan {
  void seed;
  return {
    style: null,
    durationMs,
    count,
    phases: [],
    cardPose(i, t, out) {
      restPose(i, out);
      const amp = Math.sin(Math.PI * clamp01(t));
      const dir = i % 2 === 0 ? 1 : -1;
      const ci = count > 1 ? i / (count - 1) : 0;
      out.x += dir * amp * 0.05 * (0.3 + ci * 0.7);
      out.yaw += dir * amp * 0.1;
      clampFaceDown(out);
    },
    handPose(_role, _t, out) {
      out.opacity = 0;
    },
  };
}

/** Dealer hands fade in at the start of the shuffle and out at the end. */
function fadeEnvelope(t: number): number {
  return Math.min(1, clamp01(t / 0.07), clamp01((1 - t) / 0.08));
}
