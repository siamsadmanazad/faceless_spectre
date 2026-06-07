'use client';

import { useRoomStore, canSeeFace } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@faceless-spectre/shared';

export function PlacedCards() {
  const cards = useRoomStore((s) => s.cards);
  const placedCards = Array.from(cards.values()).filter(
    (c) => c.state === CardState.Placed || c.state === CardState.Revealed,
  );

  return (
    <group>
      {placedCards.map((card, i) => {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const x = (col - 3.5) * 0.85;
        const z = (row - 1) * 1.15;
        const faceUp = canSeeFace(card);

        return (
          <CardMesh
            key={card.id}
            position={[x, 0.01 + i * 0.001, z]}
            rotation={[-Math.PI / 2, 0, (Math.random() - 0.5) * 0.1]}
            rank={card.rank}
            suit={card.suit}
            faceUp={faceUp}
          />
        );
      })}
    </group>
  );
}
