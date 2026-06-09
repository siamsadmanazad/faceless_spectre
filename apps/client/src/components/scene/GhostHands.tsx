'use client';

import { useRoomStore } from '../../store/roomStore';
import { GhostHand } from './GhostHand';

// One distinct color per seat so players are identifiable at a glance
export const SEAT_COLORS = [
  '#4488ff', // seat 0 — blue
  '#ff4488', // seat 1 — pink
  '#44ff88', // seat 2 — green
  '#ff8844', // seat 3 — orange
  '#aa44ff', // seat 4 — purple
  '#ffee44', // seat 5 — yellow
] as const;

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
