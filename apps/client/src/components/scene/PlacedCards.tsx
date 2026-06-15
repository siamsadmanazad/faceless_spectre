'use client';

import { useRoomStore, canSeeFace } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@faceless-spectre/shared';
import { landingFor } from '../../lib/table/dropZone';

interface PlacedCardsProps {
  /** Flip a table card face-up / face-down. */
  flip: (cardId: string) => void;
}

export function PlacedCards({ flip }: PlacedCardsProps) {
  const cards = useRoomStore((s) => s.cards);
  const placedCards = Array.from(cards.values()).filter(
    (c) => c.state === CardState.Placed || c.state === CardState.Revealed,
  );

  return (
    <group>
      {placedCards.map((card, i) => {
        // Deterministic scatter inside the invisible centre zone — same landing
        // on every client (hashed from the card id), no server coordinates.
        const land = landingFor(card.id);
        const faceUp = canSeeFace(card);
        // Stack in map order so later cards rest on top; the per-card lift
        // jitter keeps coincident cards from z-fighting.
        const y = 0.012 + i * 0.004 + land.lift;

        return (
          <CardMesh
            key={card.id}
            position={[land.x, y, land.z]}
            rotation={[-Math.PI / 2, 0, land.yaw]}
            rank={card.rank}
            suit={card.suit}
            faceUp={faceUp}
            onClick={() => flip(card.id)}
          />
        );
      })}
    </group>
  );
}
