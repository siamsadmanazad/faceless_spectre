'use client';

import { useMemo } from 'react';
import { Text } from '@react-three/drei';
import { useRoomStore } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@faceless-spectre/shared';

// Table radius for seating (world units)
const SEAT_RADIUS = 3.8;
// Fan spread for opponent hands (radians)
const FAN_ARC = Math.PI * 0.45;
const FAN_RADIUS = 1.6;

// Seat 0 is the local player at the near edge (positive Z).
// Remaining seats fan around the table counterclockwise.
// These angles are measured from +Z axis, going counterclockwise.
const SEAT_ANGLES: Record<number, number> = {
  0: 0,              // near center (local player — rendered by PlayerHand)
  1: Math.PI,        // far center
  2: -Math.PI / 3,  // near right
  3: Math.PI / 3,   // far left
  4: (-2 * Math.PI) / 3, // right
  5: (2 * Math.PI) / 3,  // left
};

function seatPosition(seat: number): [number, number, number] {
  const angle = SEAT_ANGLES[seat] ?? 0;
  return [Math.sin(angle) * SEAT_RADIUS, 0.05, Math.cos(angle) * SEAT_RADIUS];
}

// Rotate card fan to face inward toward the table center
function seatFanYaw(seat: number): number {
  const angle = SEAT_ANGLES[seat] ?? 0;
  return angle + Math.PI; // flip to face center
}

interface OpponentHandProps {
  playerId: string;
  seat: number;
  displayName: string;
  handSize: number;
}

function OpponentHand({ playerId, seat, displayName, handSize }: OpponentHandProps) {
  const cards = useRoomStore((s) => s.cards);

  // Cards in this player's hand (backs only — rank/suit are absent from the store
  // because the server's @filter strips them for unauthorized viewers)
  const handCards = useMemo(
    () =>
      Array.from(cards.values()).filter(
        (c) =>
          c.ownerId === playerId &&
          (c.state === CardState.Hand || c.state === CardState.Selected),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, playerId],
  );

  const count = handCards.length || handSize; // fall back to handSize if cards lag
  if (count === 0) return null;

  const [px, py, pz] = seatPosition(seat);
  const yaw = seatFanYaw(seat);

  return (
    <group position={[px, py, pz]} rotation={[0, yaw, 0]}>
      {/* Name label floating above the hand */}
      <Text
        position={[0, 0.6, 0]}
        fontSize={0.18}
        color="#dddddd"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {displayName}
      </Text>

      {/* Card count badge */}
      <Text
        position={[0, 0.38, 0]}
        fontSize={0.13}
        color="rgba(200,200,200,0.7)"
        anchorX="center"
        anchorY="middle"
      >
        {count} card{count !== 1 ? 's' : ''}
      </Text>

      {/* Fan of backs */}
      {Array.from({ length: Math.min(count, 13) }).map((_, i) => {
        const total = Math.min(count, 13);
        const t = total === 1 ? 0 : (i / (total - 1) - 0.5) * FAN_ARC;
        const x = Math.sin(t) * FAN_RADIUS;
        const z = (1 - Math.cos(t)) * 0.35;
        const rotY = -t * 0.55;

        return (
          <CardMesh
            key={i}
            position={[x, i * 0.003, z]}
            rotation={[-Math.PI / 2, 0, rotY]}
            faceUp={false}
          />
        );
      })}
    </group>
  );
}

export function OpponentHands() {
  const players = useRoomStore((s) => s.players);
  const localPlayerId = useRoomStore((s) => s.localPlayerId);

  const opponents = useMemo(
    () => Array.from(players.values()).filter((p) => p.id !== localPlayerId && p.connected),
    [players, localPlayerId],
  );

  return (
    <>
      {opponents.map((player) => (
        <OpponentHand
          key={player.id}
          playerId={player.id}
          seat={player.seat}
          displayName={player.displayName}
          handSize={player.handSize}
        />
      ))}
    </>
  );
}
