/**
 * Seat layout — the single source of truth for where each seat sits around the
 * table. Used by opponent hands, ghost hands, and the dealer-hand staging for
 * shuffle animations.
 *
 * The camera is fixed in world space for every viewer (it never rotates per
 * player), so for each player's own seat to always read as "near" on their
 * own screen, every seat-dependent position must be computed *relative to the
 * local viewer's own seat* — not from the seat's raw, absolute number. See
 * `relativeSeat`. Absolute seat numbers (join order) are still the source of
 * truth for state/identity (ownership, colour); only on-table placement needs
 * the egocentric rotation.
 */

// Table radius for seating (world units)
export const SEAT_RADIUS = 3.8;

// Seat 0 is the local player at the near edge (positive Z), in the canonical
// (unrotated) frame — i.e. from the point of view of whichever viewer's own
// seat is being treated as 0 via relativeSeat.
// Remaining seats fan around the table counterclockwise.
// These angles are measured from +Z axis, going counterclockwise.
export const SEAT_ANGLES: Record<number, number> = {
  0: 0, // near center (local player — rendered by PlayerHand)
  1: Math.PI, // far center
  2: -Math.PI / 3, // near right
  3: Math.PI / 3, // far left
  4: (-2 * Math.PI) / 3, // right
  5: (2 * Math.PI) / 3, // left
};

/**
 * Re-indexes an absolute seat number into the local viewer's egocentric
 * frame, so the viewer's own seat always lands on index 0 (the near edge)
 * regardless of which absolute seat (join order) they were actually
 * assigned. `totalSeats` is the table's actual `maxPlayers` (2-6) — wrapping
 * by the table's real seat count, not always 6, keeps a 2-seat table's lone
 * opponent directly across rather than at SEAT_ANGLES[1]'s fixed slot only
 * coincidentally matching.
 */
export function relativeSeat(seat: number, localSeat: number, totalSeats: number): number {
  const n = Math.max(1, totalSeats);
  return ((seat - localSeat) % n + n) % n;
}

export function seatAngle(seat: number, localSeat: number, totalSeats: number): number {
  return SEAT_ANGLES[relativeSeat(seat, localSeat, totalSeats)] ?? 0;
}

export function seatPosition(seat: number, localSeat: number, totalSeats: number): [number, number, number] {
  const angle = seatAngle(seat, localSeat, totalSeats);
  return [Math.sin(angle) * SEAT_RADIUS, 0.05, Math.cos(angle) * SEAT_RADIUS];
}

/** Rotate a card fan (or anything seat-anchored) to face the table center. */
export function seatFanYaw(seat: number, localSeat: number, totalSeats: number): number {
  return seatAngle(seat, localSeat, totalSeats) + Math.PI;
}

/**
 * Rotation (radians) needed to convert a position expressed in `fromSeat`'s
 * own egocentric frame into `toSeat`'s egocentric frame — both measured in
 * the canonical (absolute, unrotated) SEAT_ANGLES table. Used to re-stage a
 * broadcast hand-presence position (computed by the sender in their own
 * egocentric frame) for each receiving viewer's egocentric frame.
 */
export function seatRotationDelta(fromSeat: number, toSeat: number): number {
  return (SEAT_ANGLES[fromSeat] ?? 0) - (SEAT_ANGLES[toSeat] ?? 0);
}

/**
 * Rotate an (x, z) point about the table's vertical axis by `angle` radians,
 * using the same convention as seatAngle/seatPosition (angle measured from
 * +Z, counterclockwise).
 */
export function rotateXZ(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, -x * s + z * c];
}
