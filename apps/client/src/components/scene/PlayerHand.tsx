'use client';

import { useRoomStore, canSeeFace } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@faceless-spectre/shared';

const FAN_RADIUS = 2.8;
const FAN_ARC = Math.PI * 0.5; // 90° spread

interface PlayerHandProps {
  grab: (cardId: string) => void;
  release: (cardId: string) => void;
  selectedCardId: string | null;
}

export function PlayerHand({ grab, release, selectedCardId }: PlayerHandProps) {
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
        const selected = selectedCardId === card.id;
        // Lift selected card slightly above the fan
        const yOffset = selected ? 0.15 : 0.02 + i * 0.003;

        return (
          <CardMesh
            key={card.id}
            position={[x, yOffset, z]}
            rotation={[-Math.PI / 2, 0, rotY]}
            rank={card.rank}
            suit={card.suit}
            faceUp={faceUp}
            highlighted={selected}
            isSelected={selected}
            onClick={() => {
              if (selected) {
                release(card.id);
              } else {
                if (selectedCardId) release(selectedCardId);
                grab(card.id);
              }
            }}
          />
        );
      })}
    </group>
  );
}
