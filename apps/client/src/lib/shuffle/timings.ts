/**
 * Shuffle timing tables — the single source of truth for how long each shuffle
 * style runs and how its phase timeline is divided. Purely cosmetic: the server
 * decided the deck order before any of this plays.
 *
 * Consumed by three independent systems that must stay in sync:
 *   - the per-card deck choreography (lib/shuffle/choreography.ts)
 *   - the scripted dealer hands (components/scene/DealerHands.tsx)
 *   - the per-style sound design (lib/audio.ts)
 */

import { ShuffleStyle, ShuffleIntensity } from '@faceless-spectre/shared';

/** Per-style × intensity duration — a wash breathes, a riffle snaps. */
const DURATION_MS: Record<ShuffleStyle, Record<ShuffleIntensity, number>> = {
  [ShuffleStyle.Overhand]: {
    [ShuffleIntensity.Low]: 1200,
    [ShuffleIntensity.Medium]: 1900,
    [ShuffleIntensity.High]: 2600,
  },
  [ShuffleStyle.Riffle]: {
    [ShuffleIntensity.Low]: 950,
    [ShuffleIntensity.Medium]: 1450,
    [ShuffleIntensity.High]: 2000,
  },
  [ShuffleStyle.Wash]: {
    [ShuffleIntensity.Low]: 1700,
    [ShuffleIntensity.Medium]: 2300,
    [ShuffleIntensity.High]: 3000,
  },
  [ShuffleStyle.Split]: {
    [ShuffleIntensity.Low]: 1500,
    [ShuffleIntensity.Medium]: 1900,
    [ShuffleIntensity.High]: 2400,
  },
  [ShuffleStyle.Casino]: {
    [ShuffleIntensity.Low]: 2900,
    [ShuffleIntensity.Medium]: 3500,
    [ShuffleIntensity.High]: 4200,
  },
};

/** Reduced-motion shuffles collapse to one short, calm settle. */
export const REDUCED_MOTION_SETTLE_MS = 420;

export function getShuffleDurationMs(
  style: ShuffleStyle,
  intensity: ShuffleIntensity,
  reducedMotion = false,
): number {
  if (reducedMotion) return REDUCED_MOTION_SETTLE_MS;
  return DURATION_MS[style]?.[intensity] ?? 1400;
}

// ── Phase timelines ───────────────────────────────────────────────────────────

export interface PhaseSpec {
  name: string;
  /** Normalized start/end within [0, 1] of the whole shuffle. */
  start: number;
  end: number;
}

function spec(name: string, start: number, end: number): PhaseSpec {
  return { name, start, end };
}

const RIFFLE_PHASES: Record<ShuffleIntensity, PhaseSpec[]> = {
  [ShuffleIntensity.Low]: [
    spec('split', 0, 0.22),
    spec('riffle', 0.22, 0.78),
    spec('square', 0.78, 1),
  ],
  [ShuffleIntensity.Medium]: [
    spec('split', 0, 0.18),
    spec('riffle', 0.18, 0.52),
    spec('bridge', 0.52, 0.82),
    spec('square', 0.82, 1),
  ],
  [ShuffleIntensity.High]: [
    spec('split', 0, 0.12),
    spec('riffle', 0.12, 0.34),
    spec('resplit', 0.34, 0.44),
    spec('riffle2', 0.44, 0.64),
    spec('bridge', 0.64, 0.9),
    spec('square', 0.9, 1),
  ],
};

const OVERHAND_PHASES: PhaseSpec[] = [spec('passes', 0, 0.88), spec('square', 0.88, 1)];

const WASH_PHASES: Record<ShuffleIntensity, PhaseSpec[]> = {
  [ShuffleIntensity.Low]: [
    spec('spread', 0, 0.24),
    spec('swirl', 0.24, 0.62),
    spec('gather', 0.62, 0.92),
    spec('square', 0.92, 1),
  ],
  [ShuffleIntensity.Medium]: [
    spec('spread', 0, 0.2),
    spec('swirl', 0.2, 0.68),
    spec('gather', 0.68, 0.93),
    spec('square', 0.93, 1),
  ],
  [ShuffleIntensity.High]: [
    spec('spread', 0, 0.18),
    spec('swirl', 0.18, 0.72),
    spec('gather', 0.72, 0.94),
    spec('square', 0.94, 1),
  ],
};

const SPLIT_PHASES: PhaseSpec[] = [
  spec('divide', 0, 0.42),
  spec('hold', 0.42, 0.52),
  spec('reassemble', 0.52, 0.9),
  spec('square', 0.9, 1),
];

const CASINO_PHASES: Record<ShuffleIntensity, PhaseSpec[]> = {
  [ShuffleIntensity.Low]: [
    spec('riffle1', 0, 0.26),
    spec('strip', 0.26, 0.46),
    spec('box', 0.46, 0.6),
    spec('bridge', 0.6, 0.88),
    spec('square', 0.88, 1),
  ],
  [ShuffleIntensity.Medium]: [
    spec('riffle1', 0, 0.2),
    spec('strip', 0.2, 0.36),
    spec('riffle2', 0.36, 0.56),
    spec('box', 0.56, 0.68),
    spec('bridge', 0.68, 0.92),
    spec('square', 0.92, 1),
  ],
  [ShuffleIntensity.High]: [
    spec('riffle1', 0, 0.2),
    spec('strip', 0.2, 0.36),
    spec('riffle2', 0.36, 0.56),
    spec('box', 0.56, 0.68),
    spec('bridge', 0.68, 0.92),
    spec('square', 0.92, 1),
  ],
};

export function getPhases(style: ShuffleStyle, intensity: ShuffleIntensity): PhaseSpec[] {
  switch (style) {
    case ShuffleStyle.Riffle:
      return RIFFLE_PHASES[intensity];
    case ShuffleStyle.Overhand:
      return OVERHAND_PHASES;
    case ShuffleStyle.Wash:
      return WASH_PHASES[intensity];
    case ShuffleStyle.Split:
      return SPLIT_PHASES;
    case ShuffleStyle.Casino:
      return CASINO_PHASES[intensity];
    default:
      return RIFFLE_PHASES[ShuffleIntensity.Medium];
  }
}

/** Find a phase by name; returns null if the style/intensity doesn't include it. */
export function findPhase(phases: PhaseSpec[], name: string): PhaseSpec | null {
  return phases.find((p) => p.name === name) ?? null;
}

/** Normalized progress within a phase (0 before, 1 after). */
export function phaseT(phase: PhaseSpec, t: number): number {
  if (t <= phase.start) return 0;
  if (t >= phase.end) return 1;
  return (t - phase.start) / (phase.end - phase.start);
}
