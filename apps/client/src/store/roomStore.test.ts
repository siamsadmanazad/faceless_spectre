import { describe, it, expect, beforeEach } from 'vitest';
import { Visibility } from '@faceless-spectre/shared';
import { useRoomStore, canSeeFace, type CardView, type PlayerView } from './roomStore';

function card(partial: Partial<CardView>): CardView {
  return {
    id: 'x',
    state: 'DECK',
    visibility: Visibility.Hidden,
    ownerId: '',
    position: 0,
    zoneId: 'deck',
    ...partial,
  };
}

function player(partial: Partial<PlayerView>): PlayerView {
  return {
    id: 'p',
    displayName: 'P',
    seat: 0,
    maskId: 'faceless',
    connected: true,
    handSize: 0,
    ...partial,
  };
}

describe('roomStore.applyServerState', () => {
  beforeEach(() => {
    useRoomStore.getState().clearRoom();
  });

  it('applies cards, players, and scalars in a single update', () => {
    useRoomStore.getState().applyServerState({
      deckSize: 50,
      maxPlayers: 4,
      phase: 'playing',
      cards: new Map([['a', card({ id: 'a' })]]),
      players: new Map([['p1', player({ id: 'p1' })]]),
    });
    const s = useRoomStore.getState();
    expect(s.deckSize).toBe(50);
    expect(s.maxPlayers).toBe(4);
    expect(s.phase).toBe('playing');
    expect(s.cards.get('a')).toBeDefined();
    expect(s.players.get('p1')).toBeDefined();
  });

  it('drops entities that are absent from the next snapshot', () => {
    const store = useRoomStore.getState();
    store.applyServerState({
      cards: new Map([
        ['a', card({ id: 'a' })],
        ['b', card({ id: 'b' })],
      ]),
    });
    expect(useRoomStore.getState().cards.size).toBe(2);

    store.applyServerState({ cards: new Map([['a', card({ id: 'a' })]]) });
    expect(useRoomStore.getState().cards.size).toBe(1);
    expect(useRoomStore.getState().cards.has('b')).toBe(false);
  });

  it('replaces the map reference so subscribers update once', () => {
    const store = useRoomStore.getState();
    const before = useRoomStore.getState().cards;
    store.applyServerState({ cards: new Map([['a', card({ id: 'a' })]]) });
    expect(useRoomStore.getState().cards).not.toBe(before);
  });

  it('leaves slices not present in the snapshot unchanged', () => {
    const store = useRoomStore.getState();
    store.applyServerState({ deckSize: 10 });
    store.applyServerState({ phase: 'playing' });
    const s = useRoomStore.getState();
    expect(s.deckSize).toBe(10); // preserved across the second partial update
    expect(s.phase).toBe('playing');
  });
});

describe('canSeeFace', () => {
  it('is true only when rank+suit are present AND visibility is not Hidden', () => {
    expect(canSeeFace(card({ rank: 'K', suit: 'H', visibility: Visibility.OwnerOnly }))).toBe(true);
    expect(canSeeFace(card({ rank: 'K', suit: 'H', visibility: Visibility.Public }))).toBe(true);
    // No face on the wire → cannot see.
    expect(canSeeFace(card({ visibility: Visibility.Public }))).toBe(false);
    // Face present but explicitly hidden → still cannot see.
    expect(canSeeFace(card({ rank: 'K', suit: 'H', visibility: Visibility.Hidden }))).toBe(false);
  });
});
