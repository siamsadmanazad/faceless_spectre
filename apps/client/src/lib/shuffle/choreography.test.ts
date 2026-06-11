import { describe, it, expect } from 'vitest';
import { ShuffleStyle, ShuffleIntensity } from '@faceless-spectre/shared';
import {
  buildShufflePlan,
  buildSettlePlan,
  createCardPose,
  createHandPose,
  restPose,
  FACE_DOWN_LIMIT,
  LIFT,
} from './choreography';
import { getShuffleDurationMs, getPhases, REDUCED_MOTION_SETTLE_MS } from './timings';

const STYLES = Object.values(ShuffleStyle);
const INTENSITIES = Object.values(ShuffleIntensity);
const COUNT = 52;
const SEED = 0xc0ffee;

/** Sample grid: every card × 101 time steps. */
function* samples(count: number): Generator<[number, number]> {
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    for (let i = 0; i < count; i++) yield [i, t];
  }
}

describe('shuffle choreography plans', () => {
  for (const style of STYLES) {
    for (const intensity of INTENSITIES) {
      describe(`${style} × ${intensity}`, () => {
        const plan = buildShufflePlan(style, intensity, COUNT, SEED);
        const pose = createCardPose();
        const rest = createCardPose();

        it('starts and ends at the resting stack', () => {
          for (let i = 0; i < COUNT; i++) {
            restPose(i, rest);
            plan.cardPose(i, 0, pose);
            expect(pose.x).toBeCloseTo(rest.x, 5);
            expect(pose.y).toBeCloseTo(rest.y, 5);
            expect(pose.z).toBeCloseTo(rest.z, 5);
            plan.cardPose(i, 1, pose);
            expect(pose.x).toBeCloseTo(rest.x, 3);
            expect(pose.y).toBeCloseTo(rest.y, 3);
            expect(pose.z).toBeCloseTo(rest.z, 3);
            expect(pose.tilt).toBeCloseTo(0, 2);
            expect(pose.bank).toBeCloseTo(0, 2);
          }
        });

        it('never tips a card past face-down and stays on the table', () => {
          for (const [i, t] of samples(COUNT)) {
            plan.cardPose(i, t, pose);
            expect(Number.isFinite(pose.x)).toBe(true);
            expect(Number.isFinite(pose.y)).toBe(true);
            expect(Number.isFinite(pose.z)).toBe(true);
            expect(Number.isFinite(pose.yaw)).toBe(true);
            // The sacred invariant: no roll/pitch ever approaches a face flip.
            expect(Math.abs(pose.tilt)).toBeLessThanOrEqual(FACE_DOWN_LIMIT);
            expect(Math.abs(pose.bank)).toBeLessThanOrEqual(FACE_DOWN_LIMIT);
            // Never below the felt, never off the table.
            expect(pose.y).toBeGreaterThanOrEqual(-0.02);
            expect(Math.abs(pose.x)).toBeLessThanOrEqual(2.5);
            expect(Math.abs(pose.z)).toBeLessThanOrEqual(2.5);
          }
        });

        it('does not teleport cards between frames', () => {
          // Max per-1%-of-timeline travel — generous, but catches discontinuities.
          const prev = createCardPose();
          for (let i = 0; i < COUNT; i += 7) {
            plan.cardPose(i, 0, prev);
            for (let step = 1; step <= 100; step++) {
              plan.cardPose(i, step / 100, pose);
              const d = Math.hypot(pose.x - prev.x, pose.y - prev.y, pose.z - prev.z);
              expect(d).toBeLessThan(0.6);
              prev.x = pose.x;
              prev.y = pose.y;
              prev.z = pose.z;
            }
          }
        });

        it('produces finite, fading dealer-hand poses', () => {
          const hp = createHandPose();
          for (const role of ['left', 'right'] as const) {
            for (let step = 0; step <= 100; step++) {
              plan.handPose(role, step / 100, hp);
              expect(Number.isFinite(hp.x)).toBe(true);
              expect(Number.isFinite(hp.y)).toBe(true);
              expect(Number.isFinite(hp.z)).toBe(true);
              expect(hp.opacity).toBeGreaterThanOrEqual(0);
              expect(hp.opacity).toBeLessThanOrEqual(1);
            }
            // Hands are invisible at the very start and end (fade envelope).
            plan.handPose(role, 0, hp);
            expect(hp.opacity).toBe(0);
            plan.handPose(role, 1, hp);
            expect(hp.opacity).toBe(0);
          }
        });

        it('matches the duration table', () => {
          expect(plan.durationMs).toBe(getShuffleDurationMs(style, intensity));
          expect(plan.durationMs).toBeGreaterThan(0);
        });
      });
    }
  }

  it('higher intensity always runs at least as long', () => {
    for (const style of STYLES) {
      const low = getShuffleDurationMs(style, ShuffleIntensity.Low);
      const med = getShuffleDurationMs(style, ShuffleIntensity.Medium);
      const high = getShuffleDurationMs(style, ShuffleIntensity.High);
      expect(med).toBeGreaterThanOrEqual(low);
      expect(high).toBeGreaterThanOrEqual(med);
    }
  });

  it('phase timelines are contiguous and span [0, 1]', () => {
    for (const style of STYLES) {
      for (const intensity of INTENSITIES) {
        const phases = getPhases(style, intensity);
        expect(phases[0].start).toBe(0);
        expect(phases[phases.length - 1].end).toBe(1);
        for (let p = 1; p < phases.length; p++) {
          expect(phases[p].start).toBeCloseTo(phases[p - 1].end, 6);
        }
      }
    }
  });

  it('handles small decks without exploding', () => {
    for (const style of STYLES) {
      for (const count of [1, 2, 3, 5, 11]) {
        const plan = buildShufflePlan(style, ShuffleIntensity.High, count, SEED);
        const pose = createCardPose();
        for (const [i, t] of samples(count)) {
          plan.cardPose(i, t, pose);
          expect(Number.isFinite(pose.x)).toBe(true);
          expect(Number.isFinite(pose.y)).toBe(true);
          expect(Number.isFinite(pose.z)).toBe(true);
        }
      }
    }
  });

  it('varies with the cosmetic seed', () => {
    const a = buildShufflePlan(ShuffleStyle.Wash, ShuffleIntensity.Medium, COUNT, 1);
    const b = buildShufflePlan(ShuffleStyle.Wash, ShuffleIntensity.Medium, COUNT, 2);
    const pa = createCardPose();
    const pb = createCardPose();
    let differs = false;
    for (let i = 0; i < COUNT && !differs; i++) {
      a.cardPose(i, 0.5, pa);
      b.cardPose(i, 0.5, pb);
      if (Math.abs(pa.x - pb.x) > 1e-6 || Math.abs(pa.z - pb.z) > 1e-6) differs = true;
    }
    expect(differs).toBe(true);
  });
});

describe('reduced-motion settle plan', () => {
  it('is short, calm, flat, and handless', () => {
    const plan = buildSettlePlan(COUNT, SEED);
    expect(plan.durationMs).toBe(REDUCED_MOTION_SETTLE_MS);
    const pose = createCardPose();
    const rest = createCardPose();
    for (const [i, t] of samples(COUNT)) {
      plan.cardPose(i, t, pose);
      restPose(i, rest);
      expect(pose.tilt).toBe(0);
      expect(pose.bank).toBe(0);
      expect(pose.y).toBeCloseTo(i * LIFT, 5);
      expect(Math.abs(pose.x - rest.x)).toBeLessThan(0.08);
    }
    const hp = createHandPose();
    plan.handPose('left', 0.5, hp);
    expect(hp.opacity).toBe(0);
  });
});
