import { describe, it, expect } from 'vitest';
import {
  landingFor,
  flightFor,
  ZONE_HALF_WIDTH,
  ZONE_HALF_DEPTH,
  MAX_YAW,
  MAX_LIFT_JITTER,
  MIN_CAST_MS,
  MAX_CAST_MS,
  TRICK_SHOT_CHANCE,
} from './dropZone';

/** A spread of realistic-looking ids (server uses randomUUID). */
const IDS = Array.from({ length: 4000 }, (_, i) => `card-${i}-${(i * 2654435761) >>> 0}`);

describe('drop zone — landings', () => {
  it('is deterministic (same id → identical landing)', () => {
    for (const id of IDS.slice(0, 50)) {
      expect(landingFor(id)).toEqual(landingFor(id));
    }
  });

  it('always lands inside the centre zone', () => {
    for (const id of IDS) {
      const { x, z, yaw, lift } = landingFor(id);
      expect(Math.abs(x)).toBeLessThanOrEqual(ZONE_HALF_WIDTH);
      expect(Math.abs(z)).toBeLessThanOrEqual(ZONE_HALF_DEPTH);
      expect(Math.abs(yaw)).toBeLessThanOrEqual(MAX_YAW);
      expect(lift).toBeGreaterThanOrEqual(0);
      expect(lift).toBeLessThanOrEqual(MAX_LIFT_JITTER);
      expect(Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(yaw)).toBe(true);
    }
  });

  it('scatters — different ids generally land in different spots', () => {
    const spots = new Set(IDS.slice(0, 500).map((id) => {
      const { x, z } = landingFor(id);
      return `${x.toFixed(3)},${z.toFixed(3)}`;
    }));
    // Expect near-unique scatter, not a handful of clumped slots.
    expect(spots.size).toBeGreaterThan(480);
  });

  it('uses the full width and depth of the zone', () => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const id of IDS) {
      const { x, z } = landingFor(id);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    // The scatter should reach close to each edge of the zone.
    expect(maxX).toBeGreaterThan(ZONE_HALF_WIDTH * 0.9);
    expect(minX).toBeLessThan(-ZONE_HALF_WIDTH * 0.9);
    expect(maxZ).toBeGreaterThan(ZONE_HALF_DEPTH * 0.9);
    expect(minZ).toBeLessThan(-ZONE_HALF_DEPTH * 0.9);
  });
});

describe('drop zone — flights', () => {
  it('is deterministic (same id → identical flight)', () => {
    for (const id of IDS.slice(0, 50)) {
      expect(flightFor(id)).toEqual(flightFor(id));
    }
  });

  it('produces finite, in-range, flat-spin-safe flights', () => {
    for (const id of IDS) {
      const { arcHeight, spin, durationMs } = flightFor(id);
      expect(arcHeight).toBeGreaterThan(0);
      expect(Number.isFinite(arcHeight)).toBe(true);
      // Spin is a single flat-rotation scalar — bounded so it can never tumble
      // a card face-over (the consumer applies it only about the table normal).
      expect(Number.isFinite(spin)).toBe(true);
      expect(Math.abs(spin)).toBeLessThanOrEqual(Math.PI * 2 + 1e-6);
      expect(durationMs).toBeGreaterThanOrEqual(MIN_CAST_MS);
      expect(durationMs).toBeLessThanOrEqual(MAX_CAST_MS);
    }
  });

  it('ordinary casts stay calm; trick shots lob higher and spin more', () => {
    for (const id of IDS) {
      const f = flightFor(id);
      if (!f.trickShot) {
        expect(f.arcHeight).toBeLessThanOrEqual(0.42);
        expect(Math.abs(f.spin)).toBeLessThanOrEqual(0.5);
      } else {
        expect(f.arcHeight).toBeGreaterThan(0.42);
        expect(Math.abs(f.spin)).toBeGreaterThanOrEqual(Math.PI);
      }
    }
  });

  it('trick shots are rare (~1 in 6)', () => {
    const tricks = IDS.filter((id) => flightFor(id).trickShot).length;
    const rate = tricks / IDS.length;
    expect(rate).toBeGreaterThan(TRICK_SHOT_CHANCE * 0.5);
    expect(rate).toBeLessThan(TRICK_SHOT_CHANCE * 1.6);
  });
});
