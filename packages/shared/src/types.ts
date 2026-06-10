import {
  AnimationType,
  CardState,
  ErrorCode,
  HandState,
  IntentType,
  Rank,
  RoomMode,
  ServerMessageType,
  ShuffleIntensity,
  ShuffleStyle,
  Suit,
  Visibility,
} from './enums';
import { SeatIndex } from './constants';

// ── Card & Deck ─────────────────────────────────────────────────────────────

export interface CardFace {
  rank: Rank;
  suit: Suit;
}

/**
 * What a client receives for a card.
 * If the card is not visible to this viewer, face is absent — only the back is sent.
 */
export interface CardView {
  id: string;
  state: CardState;
  visibility: Visibility;
  ownerId: string | null;
  position: number;
  /** Present only when the viewer is entitled to see the face. */
  face?: CardFace;
  /** Table zone or hand slot the card occupies, if placed/in-hand. */
  zoneId: string | null;
}

export interface DeckHistoryEntry {
  timestamp: number;
  actor: string;
  action: 'create' | 'shuffle' | 'deal' | 'draw' | 'cut';
  seed?: string;
  beforeHash: string;
  afterHash: string;
  /** Canonical deck order logged by the 'create' entry — replay starting point. */
  initialOrder?: string[];
  /** Position used for a 'cut' operation — required for deterministic replay. */
  cutAt?: number;
  /** Card IDs removed from the deck by a 'draw' or 'deal' operation. */
  cardIds?: string[];
}

/** Server-only deck truth — never serialized to clients. */
export interface DeckTruth {
  /** Ordered list of card ids — server eyes only. */
  order: string[];
  seed: string | null;
  history: DeckHistoryEntry[];
}

// ── Players & Seats ─────────────────────────────────────────────────────────

export interface PlayerView {
  id: string;
  displayName: string;
  seat: SeatIndex;
  maskId: string;
  connected: boolean;
  handSize: number;
}

// ── Room State (filtered, safe to send to clients) ───────────────────────────

export interface RoomStateView {
  roomId: string;
  players: PlayerView[];
  cards: CardView[];
  deckSize: number;
  phase: 'lobby' | 'playing';
  /** sessionId of the host (room creator / seat 0). */
  hostId: string;
  mode: RoomMode;
  /** Host has opened empty seats to random fill (private rooms). */
  allowRandomFill: boolean;
  /** No further joins accepted (full or host-locked). */
  locked: boolean;
}

// ── Presence ─────────────────────────────────────────────────────────────────

export interface HandPresence {
  position: [number, number, number];
  orientation: [number, number, number, number];
  handState: HandState;
}

export interface PresencePayload {
  playerId: string;
  hand: HandPresence;
  maskId: string;
}

// ── Client → Server Intent Messages ──────────────────────────────────────────

interface BaseIntent {
  type: IntentType;
}

export interface GrabIntent extends BaseIntent {
  type: IntentType.Grab;
  cardId: string;
}

export interface ReleaseIntent extends BaseIntent {
  type: IntentType.Release;
  cardId: string;
}

export interface DrawIntent extends BaseIntent {
  type: IntentType.Draw;
}

export interface MultiDrawIntent extends BaseIntent {
  type: IntentType.MultiDraw;
  count: number;
}

export interface CutIntent extends BaseIntent {
  type: IntentType.Cut;
  /** Position in deck to cut at (0-based). */
  cutAt: number;
}

export interface ShuffleIntent extends BaseIntent {
  type: IntentType.Shuffle;
  style: ShuffleStyle;
  intensity: ShuffleIntensity;
}

export interface DealIntent extends BaseIntent {
  type: IntentType.Deal;
  /** Number of cards to deal to each player. */
  count: number;
  /** Which seats to deal to. */
  seats: SeatIndex[];
}

export interface GestureIntent extends BaseIntent {
  type: IntentType.Gesture;
  gestureId: string;
}

export interface PlaceIntent extends BaseIntent {
  type: IntentType.Place;
  cardId: string;
  zoneId: string;
  position: [number, number, number];
}

export interface RevealIntent extends BaseIntent {
  type: IntentType.Reveal;
  cardId: string;
}

export interface ChatIntent extends BaseIntent {
  type: IntentType.Chat;
  text: string;
}

export interface PresenceIntent extends BaseIntent {
  type: IntentType.Presence;
  hand: HandPresence;
  maskId: string;
}

export interface SetBackfillIntent extends BaseIntent {
  type: IntentType.SetBackfill;
  /** Host-only: allow randoms to fill empty seats in a private room. */
  enabled: boolean;
}

export interface LockTableIntent extends BaseIntent {
  type: IntentType.LockTable;
}

export interface KickIntent extends BaseIntent {
  type: IntentType.Kick;
  /** sessionId of the player the host wants to remove. */
  targetId: string;
}

export interface WebRTCOfferIntent extends BaseIntent {
  type: IntentType.WebRTCOffer;
  targetId: string;
  sdp: string;
}

export interface WebRTCAnswerIntent extends BaseIntent {
  type: IntentType.WebRTCAnswer;
  targetId: string;
  sdp: string;
}

export interface WebRTCIceIntent extends BaseIntent {
  type: IntentType.WebRTCIce;
  targetId: string;
  candidate: string;
}

export type ClientIntent =
  | GrabIntent
  | ReleaseIntent
  | DrawIntent
  | MultiDrawIntent
  | CutIntent
  | ShuffleIntent
  | DealIntent
  | GestureIntent
  | PlaceIntent
  | RevealIntent
  | ChatIntent
  | PresenceIntent
  | SetBackfillIntent
  | LockTableIntent
  | KickIntent
  | WebRTCOfferIntent
  | WebRTCAnswerIntent
  | WebRTCIceIntent;

// ── Server → Client Messages ──────────────────────────────────────────────────

export interface StateUpdateMessage {
  type: ServerMessageType.StateUpdate;
  state: RoomStateView;
}

export interface AnimationCommand {
  type: ServerMessageType.AnimationCommand;
  animation: AnimationType;
  durationMs: number;
  cardIds: string[];
  /** Cosmetic style/intensity for the animation — does not affect outcomes. */
  style?: ShuffleStyle;
  intensity?: ShuffleIntensity;
}

export interface ErrorMessage {
  type: ServerMessageType.Error;
  code: ErrorCode;
  message: string;
}

export interface PresenceMessage {
  type: ServerMessageType.Presence;
  presences: PresencePayload[];
}

export interface WebRTCSignalMessage {
  type: ServerMessageType.WebRTCOffer | ServerMessageType.WebRTCAnswer | ServerMessageType.WebRTCIce;
  fromId: string;
  sdp?: string;
  candidate?: string;
}

export type ServerMessage =
  | StateUpdateMessage
  | AnimationCommand
  | ErrorMessage
  | PresenceMessage
  | WebRTCSignalMessage;
