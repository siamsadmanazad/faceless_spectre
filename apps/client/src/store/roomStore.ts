import { create } from 'zustand';
import { AnimationType, Visibility, type AnimationCommand } from '@faceless-spectre/shared';

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

interface RoomState {
  roomId: string | null;
  localPlayerId: string | null;
  phase: string;
  deckSize: number;
  cards: Map<string, CardView>;
  players: Map<string, PlayerView>;
  selectedCardId: string | null;
  activeAnimations: Map<string, ActiveAnimation>;

  setRoomId: (id: string) => void;
  setLocalPlayerId: (id: string) => void;
  setDeckSize: (n: number) => void;
  setPhase: (p: string) => void;
  upsertCard: (card: CardView) => void;
  removeCard: (id: string) => void;
  upsertPlayer: (player: PlayerView) => void;
  removePlayer: (id: string) => void;
  setSelectedCard: (id: string | null) => void;
  handleAnimationCommand: (cmd: AnimationCommand) => void;
  clearAnimation: (cardId: string) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  localPlayerId: null,
  phase: 'lobby',
  deckSize: 0,
  cards: new Map(),
  players: new Map(),
  selectedCardId: null,
  activeAnimations: new Map(),

  setRoomId: (id) => set({ roomId: id }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  setDeckSize: (n) => set({ deckSize: n }),
  setPhase: (p) => set({ phase: p }),
  setSelectedCard: (id) => set({ selectedCardId: id }),

  handleAnimationCommand: (cmd) =>
    set((s) => {
      const next = new Map(s.activeAnimations);
      const now = Date.now();
      for (const cardId of cmd.cardIds) {
        next.set(cardId, { type: cmd.animation, startedAt: now, durationMs: cmd.durationMs });
      }
      return { activeAnimations: next };
    }),

  clearAnimation: (cardId) =>
    set((s) => {
      const next = new Map(s.activeAnimations);
      next.delete(cardId);
      return { activeAnimations: next };
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
      cards: new Map(),
      players: new Map(),
      selectedCardId: null,
      activeAnimations: new Map(),
    }),
}));

/** Returns true if this client can see the card's face. */
export function canSeeFace(card: CardView): boolean {
  return !!(card.rank && card.suit && card.visibility !== Visibility.Hidden);
}
