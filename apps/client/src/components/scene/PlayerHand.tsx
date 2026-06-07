'use client';

import { useRoomStore, canSeeFace } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@phantom-table/shared';

const FAN_RADIUS = 2.8;
const FAN_ARC = Math.PI * 0.5; // 90° spread

export function PlayerHand() {
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const cards = useRoomStore((s) => s.cards);

  const handCards = Array.from(cards.values()).filter(
    (c) =>
      c.ownerId === localPlayerId &&
      (c.state === CardState.Hand || c.state === CardState.Selected),
  );

  if (handCards.length === 0) return null;

  const count = handCards.length;

  return (
    <group position={[0, 0, 3.2]}>
      {handCards.map((card, i) => {
        const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * FAN_ARC;
        const x = Math.sin(t) * FAN_RADIUS;
        const z = (1 - Math.cos(t)) * 0.4;
        const rotY = -t * 0.6;
        const faceUp = canSeeFace(card);

        return (
          <CardMesh
            key={card.id}
            position={[x, 0.02 + i * 0.003, z]}
            rotation={[-Math.PI / 2, 0, rotY]}
            rank={card.rank}
            suit={card.suit}
            faceUp={faceUp}
          />
        );
      })}
    </group>
  );
}
