'use client';

import { useMemo } from 'react';
import { useRoomStore, canSeeFace } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@faceless-spectre/shared';

interface PlacedCardsProps {
  grab: (cardId: string) => void;
  selectedCardId: string | null;
}

export function PlacedCards({ grab, selectedCardId }: PlacedCardsProps) {
  const cards = useRoomStore((s) => s.cards);
  const placedCards = Array.from(cards.values()).filter(
    (c) => c.state === CardState.Placed || c.state === CardState.Revealed,
  );

  // Stable random rotations — keyed by card id so they don't change on re-render
  const rotations = useMemo(() => {
    const map = new Map<string, number>();
    placedCards.forEach((c) => {
      if (!map.has(c.id)) {
        // Deterministic "random" per card id using a simple hash
        let h = 0;
        for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0;
        map.set(c.id, ((h % 1000) / 10000) - 0.05);
      }
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedCards.map((c) => c.id).join(',')]);

  return (
    <group>
      {placedCards.map((card, i) => {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const x = (col - 3.5) * 0.85;
        const z = (row - 1) * 1.15;
        const faceUp = canSeeFace(card);
        const selected = selectedCardId === card.id;
        const rot = rotations.get(card.id) ?? 0;

        return (
          <CardMesh
            key={card.id}
            position={[x, selected ? 0.08 : 0.01 + i * 0.001, z]}
            rotation={[-Math.PI / 2, 0, rot]}
            rank={card.rank}
            suit={card.suit}
            faceUp={faceUp}
            highlighted={selected}
            isSelected={selected}
            onClick={() => grab(card.id)}
          />
        );
      })}
    </group>
  );
}
