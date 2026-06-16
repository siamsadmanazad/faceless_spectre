import { describe, it, expect } from 'vitest';
import {
  SEAT_ANGLES,
  SEAT_RADIUS,
  relativeSeat,
  seatAngle,
  seatPosition,
  seatFanYaw,
  seatRotationDelta,
  rotateXZ,
} from './seating';

describe('relativeSeat', () => {
  it('maps the viewer\'s own seat to 0 regardless of its absolute number', () => {
    for (let total = 2; total <= 6; total++) {
      for (let localSeat = 0; localSeat < total; localSeat++) {
        expect(relativeSeat(localSeat, localSeat, total)).toBe(0);
      }
    }
  });

  it('wraps using the table\'s actual seat count, not always 6', () => {
    // 2-seat table: the lone opponent (seat 1, viewed by seat 0) lands at
    // relative 1 — the same slot a 6-seat table also calls "far" — but the
    // wrap must use n=2, not 6, or seat math beyond the real seats leaks in.
    expect(relativeSeat(1, 0, 2)).toBe(1);
    expect(relativeSeat(0, 1, 2)).toBe(1);
  });

  it('is consistent with the original (seat-0-as-local) behaviour when localSeat is 0', () => {
    for (let seat = 0; seat < 6; seat++) {
      expect(relativeSeat(seat, 0, 6)).toBe(seat);
    }
  });
});

describe('seatAngle / seatPosition / seatFanYaw', () => {
  it('places the viewer\'s own seat at the canonical near position', () => {
    // Whoever is viewing, their own seat must render exactly where
    // PlayerHand.tsx hardcodes the local hand: near, +Z.
    for (let localSeat = 0; localSeat < 6; localSeat++) {
      expect(seatAngle(localSeat, localSeat, 6)).toBe(SEAT_ANGLES[0]);
      const [x, , z] = seatPosition(localSeat, localSeat, 6);
      expect(x).toBeCloseTo(0);
      expect(z).toBeCloseTo(SEAT_RADIUS);
    }
  });

  it('a 2-seat table always puts the other player directly across, whichever seat is "local"', () => {
    expect(seatAngle(1, 0, 2)).toBe(SEAT_ANGLES[1]); // host (seat 0) viewing the guest
    expect(seatAngle(0, 1, 2)).toBe(SEAT_ANGLES[1]); // guest (seat 1) viewing the host
  });

  it('seatFanYaw always turns a seat to face the table center', () => {
    for (let seat = 0; seat < 6; seat++) {
      expect(seatFanYaw(seat, 0, 6)).toBe(seatAngle(seat, 0, 6) + Math.PI);
    }
  });
});

describe('seatRotationDelta / rotateXZ (hand-presence re-staging)', () => {
  it('is zero when sender and receiver are the same seat', () => {
    expect(seatRotationDelta(2, 2)).toBe(0);
    const [x, z] = rotateXZ(1.23, -0.45, 0);
    expect(x).toBeCloseTo(1.23);
    expect(z).toBeCloseTo(-0.45);
  });

  it('re-stages a sender\'s own egocentric "near" point to their true seat position for another viewer', () => {
    // Seat 1 (far, absolute) raycasts in their own egocentric frame, where
    // their seat reads as "near" — i.e. their raw point is (0, R). Re-staged
    // for seat 0's viewer, it must land exactly on seat 1's absolute position.
    const delta = seatRotationDelta(1, 0);
    const [rx, rz] = rotateXZ(0, SEAT_RADIUS, delta);
    const [ex, , ez] = seatPosition(1, 0, 6);
    expect(rx).toBeCloseTo(ex);
    expect(rz).toBeCloseTo(ez);
  });
});
