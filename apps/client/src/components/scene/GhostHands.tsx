'use client';

import { useRoomStore } from '../../store/roomStore';
import { GhostHand } from './GhostHand';
import { SEAT_COLORS } from '../../theme/palette';

// Re-exported for any consumer that imported it from here historically.
export { SEAT_COLORS };

export function GhostHands() {
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const players = useRoomStore((s) => s.players);
  const presences = useRoomStore((s) => s.presences);

  return (
    <group>
      {Array.from(presences.values())
        .filter((p) => p.playerId !== localPlayerId && p.hand !== null)
        .map((p) => {
          const seat = players.get(p.playerId)?.seat ?? 0;
          return (
            <GhostHand
              key={p.playerId}
              position={p.hand.position}
              orientation={p.hand.orientation}
              handState={p.hand.handState}
              color={SEAT_COLORS[seat % SEAT_COLORS.length]}
            />
          );
        })}
    </group>
  );
}
