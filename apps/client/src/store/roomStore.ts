import { create } from 'zustand';
import {
  AnimationType,
  ShuffleStyle,
  ShuffleIntensity,
  Visibility,
  type AnimationCommand,
  type PresencePayload,
} from '@faceless-spectre/shared';

export interface CardView {
  id: string;
  state: string;
  visibility: string;
  ownerId: string;
  position: number;
  zoneId: string;
  /** Present only when this client is allowed to see the face. */
  rank?: string;
  suit?: string;
}

export interface PlayerView {
  id: string;
  displayName: string;
  seat: number;
  maskId: string;
  connected: boolean;
  handSize: number;
}

export interface ActiveAnimation {
  type: AnimationType;
  startedAt: number;
  durationMs: number;
}

export interface DeckAnimation {
  animation: AnimationType;
  style: ShuffleStyle;
  intensity: ShuffleIntensity;
  startedAt: number;
  durationMs: number;
}

interface RoomState {
  roomId: string | null;
  localPlayerId: string | null;
  phase: string;
  deckSize: number;
  maxPlayers: number;
  hostId: string;
  mode: string;
  allowRandomFill: boolean;
  locked: boolean;
  spectatorCount: number;
  backfillVoteActive: boolean;
  backfillVoteYes: number;
  backfillVoteNo: number;
  cards: Map<string, CardView>;
  players: Map<string, PlayerView>;
  selectedCardId: string | null;
  activeAnimations: Map<string, ActiveAnimation>;
  presences: Map<string, PresencePayload>;

  setRoomId: (id: string) => void;
  setLocalPlayerId: (id: string) => void;
  setDeckSize: (n: number) => void;
  setMaxPlayers: (n: number) => void;
  setPhase: (p: string) => void;
  /**
   * Apply a full server-state snapshot in a single store update. The caller
   * builds the cards/players maps once; replacing the whole map also drops any
   * entity that disappeared server-side. One `set` per patch instead of N.
   */
  applyServerState: (next: {
    deckSize?: number;
    maxPlayers?: number;
    phase?: string;
    hostId?: string;
    mode?: string;
    allowRandomFill?: boolean;
    locked?: boolean;
    spectatorCount?: number;
    backfillVoteActive?: boolean;
    backfillVoteYes?: number;
    backfillVoteNo?: number;
    cards?: Map<string, CardView>;
    players?: Map<string, PlayerView>;
  }) => void;
  upsertCard: (card: CardView) => void;
  removeCard: (id: string) => void;
  upsertPlayer: (player: PlayerView) => void;
  removePlayer: (id: string) => void;
  setSelectedCard: (id: string | null) => void;
  handleAnimationCommand: (cmd: AnimationCommand) => void;
  clearAnimation: (cardId: string) => void;
  deckAnimation: DeckAnimation | null;
  clearDeckAnimation: () => void;
  upsertPresence: (payload: PresencePayload) => void;
  removePresence: (playerId: string) => void;
  isMuted: boolean;
  audioEnabled: boolean;
  setMuted: (v: boolean) => void;
  setAudioEnabled: (v: boolean) => void;
  /** Procedural sound-effects toggle (separate from voice mute). */
  sfxEnabled: boolean;
  setSfxEnabled: (v: boolean) => void;
  /** Peers this client has locally silenced (independent of the tab-active gate). */
  mutedPeers: Set<string>;
  togglePeerMute: (peerId: string) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  localPlayerId: null,
  phase: 'lobby',
  deckSize: 0,
  maxPlayers: 6,
  hostId: '',
  mode: 'public',
  allowRandomFill: false,
  locked: false,
  spectatorCount: 0,
  backfillVoteActive: false,
  backfillVoteYes: 0,
  backfillVoteNo: 0,
  cards: new Map(),
  players: new Map(),
  selectedCardId: null,
  activeAnimations: new Map(),
  deckAnimation: null,
  presences: new Map(),
  isMuted: false,
  audioEnabled: false,
  mutedPeers: new Set(),
  sfxEnabled: true,

  setRoomId: (id) => set({ roomId: id }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setDeckSize: (n) => set({ deckSize: n }),
  setMaxPlayers: (n) => set({ maxPlayers: n }),
  setPhase: (p) => set({ phase: p }),

  applyServerState: (next) =>
    set((s) => ({
      deckSize: next.deckSize ?? s.deckSize,
      maxPlayers: next.maxPlayers ?? s.maxPlayers,
      phase: next.phase ?? s.phase,
      hostId: next.hostId ?? s.hostId,
      mode: next.mode ?? s.mode,
      allowRandomFill: next.allowRandomFill ?? s.allowRandomFill,
      locked: next.locked ?? s.locked,
      spectatorCount: next.spectatorCount ?? s.spectatorCount,
      backfillVoteActive: next.backfillVoteActive ?? s.backfillVoteActive,
      backfillVoteYes: next.backfillVoteYes ?? s.backfillVoteYes,
      backfillVoteNo: next.backfillVoteNo ?? s.backfillVoteNo,
      cards: next.cards ?? s.cards,
      players: next.players ?? s.players,
    })),
  setSelectedCard: (id) => set({ selectedCardId: id }),
  clearDeckAnimation: () => set({ deckAnimation: null }),
  setMuted: (v) => set({ isMuted: v }),
  setAudioEnabled: (v) => set({ audioEnabled: v }),
  setSfxEnabled: (v) => set({ sfxEnabled: v }),

  togglePeerMute: (peerId) =>
    set((s) => {
      const next = new Set(s.mutedPeers);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return { mutedPeers: next };
    }),

  handleAnimationCommand: (cmd) =>
    set((s) => {
      const now = Date.now();
      const next = new Map(s.activeAnimations);
      for (const cardId of cmd.cardIds) {
        next.set(cardId, { type: cmd.animation, startedAt: now, durationMs: cmd.durationMs });
      }
      // Shuffle and Deal animate the deck group rather than individual cards
      if (cmd.animation === AnimationType.Shuffle || cmd.animation === AnimationType.Deal) {
        const da: DeckAnimation = {
          animation: cmd.animation,
          style: cmd.style ?? ShuffleStyle.Riffle,
          intensity: cmd.intensity ?? ShuffleIntensity.Medium,
          startedAt: now,
          durationMs: cmd.durationMs,
        };
        return { activeAnimations: next, deckAnimation: da };
      }
      return { activeAnimations: next };
    }),

  clearAnimation: (cardId) =>
    set((s) => {
      const next = new Map(s.activeAnimations);
      next.delete(cardId);
      return { activeAnimations: next };
    }),

  upsertPresence: (payload) =>
    set((s) => {
      const next = new Map(s.presences);
      if ((payload as { hand: unknown }).hand === null) {
        next.delete(payload.playerId);
      } else {
        next.set(payload.playerId, payload);
      }
      return { presences: next };
    }),

  removePresence: (playerId) =>
    set((s) => {
      const next = new Map(s.presences);
      next.delete(playerId);
      return { presences: next };
    }),

  upsertCard: (card) =>
    set((s) => {
      const next = new Map(s.cards);
      next.set(card.id, card);
      return { cards: next };
    }),

  removeCard: (id) =>
    set((s) => {
      const next = new Map(s.cards);
      next.delete(id);
      return { cards: next };
    }),

  upsertPlayer: (player) =>
    set((s) => {
      const next = new Map(s.players);
      next.set(player.id, player);
      return { players: next };
    }),

  removePlayer: (id) =>
    set((s) => {
      const next = new Map(s.players);
      next.delete(id);
      return { players: next };
    }),

  clearRoom: () =>
    set({
      roomId: null,
      localPlayerId: null,
      phase: 'lobby',
      deckSize: 0,
      maxPlayers: 6,
      hostId: '',
      mode: 'public',
      allowRandomFill: false,
      locked: false,
      spectatorCount: 0,
      backfillVoteActive: false,
      backfillVoteYes: 0,
      backfillVoteNo: 0,
      cards: new Map(),
      players: new Map(),
      selectedCardId: null,
      activeAnimations: new Map(),
      deckAnimation: null,
      presences: new Map(),
      isMuted: false,
      audioEnabled: false,
      mutedPeers: new Set(),
    }),
}));

/** Returns true if this client can see the card's face. */
export function canSeeFace(card: CardView): boolean {
  return !!(card.rank && card.suit && card.visibility !== Visibility.Hidden);
}
