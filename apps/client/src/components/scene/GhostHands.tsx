'use client';

import { useRoomStore } from '../../store/roomStore';
import { GhostHand } from './GhostHand';
import { SEAT_COLORS } from '../../theme/palette';
import { seatRotationDelta, rotateXZ } from './seating';

// Re-exported for any consumer that imported it from here historically.
export { SEAT_COLORS };

export function GhostHands() {
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const players = useRoomStore((s) => s.players);
  const presences = useRoomStore((s) => s.presences);

  // The camera is fixed in world space for every viewer, so each sender raycasts
  // their hand in *their own* egocentric frame (their seat reads as "near" to
  // them too). Re-stage it into this viewer's egocentric frame before rendering.
  const localSeat = localPlayerId ? players.get(localPlayerId)?.seat ?? 0 : 0;

  return (
    <group>
      {Array.from(presences.values())
        .filter((p) => p.playerId !== localPlayerId && p.hand !== null)
        .map((p) => {
          const seat = players.get(p.playerId)?.seat ?? 0;
          const delta = seatRotationDelta(seat, localSeat);
          const [hx, hy, hz] = p.hand.position;
          const [rx, rz] = rotateXZ(hx, hz, delta);
          return (
            <GhostHand
              key={p.playerId}
              position={[rx, hy, rz]}
              orientation={p.hand.orientation}
              handState={p.hand.handState}
              color={SEAT_COLORS[seat % SEAT_COLORS.length]}
            />
          );
        })}
    </group>
  );
}
