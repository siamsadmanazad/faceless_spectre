import { ErrorCode } from '@faceless-spectre/shared';
import { CardSchema } from '../state/CardSchema';
import { MapSchema } from '@colyseus/schema';
import { PlayerSchema } from '../state/PlayerSchema';

export class IntentError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = 'IntentError';
  }
}

export function requireCard(
  cards: MapSchema<CardSchema>,
  cardId: string,
): CardSchema {
  const card = cards.get(cardId);
  if (!card) throw new IntentError(ErrorCode.UnknownCard, `Unknown card: ${cardId}`);
  return card;
}

export function requireOwner(card: CardSchema, sessionId: string): void {
  if (card.ownerId !== sessionId) {
    throw new IntentError(ErrorCode.NotYourCard, `Card ${card.id} does not belong to ${sessionId}`);
  }
}

export function requireSeat(
  players: MapSchema<PlayerSchema>,
  sessionId: string,
): PlayerSchema {
  const player = players.get(sessionId);
  if (!player) throw new IntentError(ErrorCode.InvalidSeat, `No seat for ${sessionId}`);
  return player;
}

export function requireNonEmptyDeck(deckSize: number): void {
  if (deckSize === 0) throw new IntentError(ErrorCode.EmptyDeck, 'Deck is empty');
}
