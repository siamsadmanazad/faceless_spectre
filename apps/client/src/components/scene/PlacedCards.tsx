'use client';

import { useRef } from 'react';
import { useRoomStore, canSeeFace } from '../../store/roomStore';
import { CardMesh } from './CardMesh';
import { CardState } from '@faceless-spectre/shared';
import { landingFor, flightFor } from '../../lib/table/dropZone';
import { seatPosition } from './seating';

interface PlacedCardsProps {
  /** Flip a table card face-up / face-down. */
  flip: (cardId: string) => void;
}

/** Where a cast flight begins — in front of the caster's seat, at hand height.
 *  Falls back to a generic pluck point near the local edge if the seat is unknown. */
function castOrigin(seat: number | undefined): [number, number, number] {
  if (seat == null) return [0, 0.7, 2.0];
  const [sx, , sz] = seatPosition(seat);
  return [sx * 0.7, 0.55, sz * 0.7];
}

export function PlacedCards({ flip }: PlacedCardsProps) {
  const cards = useRoomStore((s) => s.cards);
  const players = useRoomStore((s) => s.players);
  const activeAnimations = useRoomStore((s) => s.activeAnimations);

  const placedCards = Array.from(cards.values()).filter(
    (c) => c.state === CardState.Placed || c.state === CardState.Revealed,
  );

  // Track which cards were on the table last render so we can tell a *fresh* cast
  // (animate the throw) from cards that were already placed (e.g. present at join,
  // or just re-rendered). null on the very first render = seed without animating.
  const prevRef = useRef<Set<string> | null>(null);
  const prev = prevRef.current;
  prevRef.current = new Set(placedCards.map((c) => c.id));

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

        // A card that wasn't placed last render just arrived → play the cast flight.
        const isFreshCast = prev !== null && !prev.has(card.id);
        const flight = isFreshCast ? flightFor(card.id) : null;
        const casterSeat = isFreshCast
          ? players.get(activeAnimations.get(card.id)?.actorId ?? '')?.seat
          : undefined;

        return (
          <CardMesh
            key={card.id}
            position={[land.x, y, land.z]}
            rotation={[-Math.PI / 2, 0, land.yaw]}
            rank={card.rank}
            suit={card.suit}
            faceUp={faceUp}
            onClick={() => flip(card.id)}
            castFrom={flight ? castOrigin(casterSeat) : undefined}
            castDurationMs={flight?.durationMs}
            castArc={flight?.arcHeight}
            castSpin={flight?.spin}
          />
        );
      })}
    </group>
  );
}
