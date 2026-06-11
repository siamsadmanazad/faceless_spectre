import { Rank, Suit } from './enums';

export const MIN_PLAYERS = 2;
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

/** How long a disconnected player's seat (and cards) are held for reclaim.
 *  Covers both same-socket token reconnects and a return on a new socket with
 *  the same stable clientId (e.g. reopening the invite link on flaky wifi). */
export const RECONNECT_GRACE_SEC = 120;

/** Extra non-seat connection slots for spectators, on top of the player cap. */
export const SPECTATOR_SLOTS = 4;

export const PRESENCE_THROTTLE_MS = 50;
export const MAX_INTENTS_PER_SECOND = 20;
/** Server-side flush cadence for aggregated presence (one broadcast per tick). */
export const PRESENCE_FLUSH_MS = 50;
/** Independent server-side cap on inbound presence messages per session/second.
 *  Above the client's 20/s throttle, with headroom; excess is dropped silently. */
export const MAX_PRESENCE_PER_SECOND = 30;
/** Cap on inbound WebRTC signaling messages per session/second (ICE can burst). */
export const MAX_SIGNALING_PER_SECOND = 60;

/** Server-side cap on inbound chat messages per session/second; excess is
 *  dropped silently (never rejected/logged — chat is low-value, non-causal). */
export const MAX_CHAT_PER_SECOND = 3;
/** Server truncates any chat text to this many characters before broadcasting. */
export const MAX_CHAT_LENGTH = 200;

/** Prebuilt one-tap chat phrases. Sent as ordinary chat text — the list is just
 *  a shared UI convenience so the client renders quick-chat buttons. */
export const QUICK_CHAT_MESSAGES: ReadonlyArray<string> = Object.freeze([
  'Nice hand!',
  'Your turn',
  'Good game',
  'One sec…',
  'Deal me in',
  'Well played',
  'So close!',
]);

/** One-tap emoji, appended to the chat input. Plain Unicode — no special wire
 *  handling; they travel as chat text like anything else. */
export const QUICK_EMOJIS: ReadonlyArray<string> = Object.freeze([
  '👍',
  '😂',
  '😮',
  '🔥',
  '🎉',
  '😎',
  '🤔',
  '💀',
]);

export const CARD_STATE_MACHINE: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  DECK: ['DRAWN'],
  DRAWN: ['HAND', 'PLACED'],
  HAND: ['SELECTED', 'PLACED'],
  SELECTED: ['MOVING', 'HAND', 'PLACED'],
  MOVING: ['PLACED', 'HAND'],
  PLACED: ['SELECTED', 'REVEALED'],
  REVEALED: ['SELECTED'],
});
