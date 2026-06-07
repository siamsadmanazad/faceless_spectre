import { Rank, Suit } from './enums';

export const MAX_PLAYERS = 6;
export const SEATS = [0, 1, 2, 3, 4, 5] as const;
export type SeatIndex = (typeof SEATS)[number];

export const DECK_SIZE = 52;

export const STANDARD_DECK: ReadonlyArray<{ rank: Rank; suit: Suit }> = Object.freeze(
  Object.values(Suit).flatMap((suit) =>
    Object.values(Rank).map((rank) => ({ rank, suit })),
  ),
);

export const MAX_MULTI_DRAW = 13;

export const PRESENCE_THROTTLE_MS = 50;
export const MAX_INTENTS_PER_SECOND = 20;

export const CARD_STATE_MACHINE: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  DECK: ['DRAWN'],
  DRAWN: ['HAND', 'PLACED'],
  HAND: ['SELECTED', 'PLACED'],
  SELECTED: ['MOVING', 'HAND'],
  MOVING: ['PLACED', 'HAND'],
  PLACED: ['SELECTED', 'REVEALED'],
  REVEALED: ['SELECTED'],
});
