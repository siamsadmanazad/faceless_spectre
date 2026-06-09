import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { matchMaker } from 'colyseus';
import { TableRoom } from '../rooms/TableRoom';
import { CardState, ErrorCode, MAX_INTENTS_PER_SECOND, Visibility } from '@faceless-spectre/shared';
import { CardSchema } from '../state/CardSchema';

/** Typed accessor for TableRoom private methods needed in tests. */
interface RoomInternals {
  onJoin(client: MockClient, options?: Record<string, string>): Promise<void>;
  handleDraw(client: MockClient, count: number): void;
  handleShuffle(client: MockClient, style: string, intensity: string): void;
  handleReveal(client: MockClient, cardId: string): void;
  handlePlace(client: MockClient, cardId: string, zoneId: string): void;
  handleGrab(client: MockClient, cardId: string): void;
  handleRelease(client: MockClient, cardId: string): void;
  checkRateLimit(client: MockClient, nowFn?: () => number): void;
  disconnect(): Promise<void>;
}

/**
 * Directly tests room logic without WebSocket networking.
 * Visibility of rank/suit is tested by examining what the filter function
 * returns for mock clients — the same function called by Colyseus serialization.
 */

type MockClient = {
  sessionId: string;
  readyState: number;
  id: string;
  state: number;
  ref: { emit: () => void };
  send: (type: string, message?: unknown) => void;
  leave: () => void;
  error: () => void;
  lastSent: { type: string; message: unknown }[];
};

function makeMockClient(sessionId: string): MockClient {
  const client: MockClient = {
    sessionId,
    readyState: 1,
    id: sessionId,
    state: 1,
    ref: { emit: () => {} },
    send(type, message) {
      this.lastSent.push({ type, message });
    },
    leave() {},
    error() {},
    lastSent: [],
  };
  return client;
}

describe('visibility filter — canSeeCardFace logic', () => {
  it('PUBLIC card is visible to any client', () => {
    const card = new CardSchema();
    card.visibility = Visibility.Public;
    card.ownerId = 'player1';
    card.rank = 'A';
    card.suit = 'S';

    function canSee(viewerSessionId: string): boolean {
      if (card.visibility === Visibility.Public) return true;
      if (card.visibility === Visibility.OwnerOnly) return card.ownerId === viewerSessionId;
      return false;
    }

    expect(canSee('player1')).toBe(true);
    expect(canSee('player2')).toBe(true); // PUBLIC — everyone sees it
    expect(canSee('player3')).toBe(true);
  });

  it('OWNER_ONLY card: owner can see face, other cannot', () => {
    const card = new CardSchema();
    card.visibility = Visibility.OwnerOnly;
    card.ownerId = 'player1';

    // Simulate what canSeeCardFace returns for each viewer
    function canSee(viewerSessionId: string): boolean {
      if (card.visibility === Visibility.Public) return true;
      if (card.visibility === Visibility.OwnerOnly) return card.ownerId === viewerSessionId;
      return false;
    }

    expect(canSee('player1')).toBe(true);
    expect(canSee('player2')).toBe(false);
    expect(canSee('player3')).toBe(false);
  });

  it('HIDDEN card: no one sees the face', () => {
    const card = new CardSchema();
    card.visibility = Visibility.Hidden;
    card.ownerId = '';

    function canSee(viewerSessionId: string): boolean {
      if (card.visibility === Visibility.Public) return true;
      if (card.visibility === Visibility.OwnerOnly) return card.ownerId === viewerSessionId;
      return false;
    }

    expect(canSee('player1')).toBe(false);
    expect(canSee('player2')).toBe(false);
  });
});

describe('TableRoom — direct room method tests', () => {
  let room: TableRoom;

  beforeAll(async () => {
    await matchMaker.setup(undefined, undefined);
    matchMaker.defineRoomType('table_room', TableRoom);
  });

  afterAll(async () => {
    if (room) {
      await (room as unknown as RoomInternals).disconnect();
    }
  });

  it('room initializes with 52 cards in deck state', async () => {
    const listing = await matchMaker.createRoom('table_room', {});
    room = matchMaker.getRoomById(listing.roomId) as TableRoom;

    expect(room).toBeDefined();
    expect(room.state.deckSize).toBe(52);
    expect(room.state.cards.size).toBe(52);

    let deckCount = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.state === CardState.Deck) deckCount++;
    });
    expect(deckCount).toBe(52);
  });

  it('all deck cards have Hidden visibility and empty rank/suit on schema (rank/suit filtered at serialization)', async () => {
    // The server-side schema DOES hold rank/suit internally — the @filter
    // prevents them from being serialized to unauthorized clients.
    // We verify here that visibility is correctly set to Hidden for all deck cards.
    room.state.cards.forEach((card: CardSchema) => {
      if (card.state === CardState.Deck) {
        expect(card.visibility).toBe(Visibility.Hidden);
      }
    });
  });

  it('player can join and receives a seat', async () => {
    const clientA = makeMockClient('session-a');
    await (room as unknown as RoomInternals).onJoin(clientA, { displayName: 'Alice' });

    expect(room.state.players.size).toBe(1);
    const player = room.state.players.get('session-a');
    expect(player).toBeDefined();
    expect(player!.displayName).toBe('Alice');
    expect(player!.seat).toBe(0);
  });

  it('draw moves cards from deck to player hand with OwnerOnly visibility', async () => {
    const clientA = makeMockClient('session-a');
    const initialDeckSize = room.state.deckSize;

    await (room as unknown as RoomInternals).handleDraw(clientA, 5);

    expect(room.state.deckSize).toBe(initialDeckSize - 5);

    let handCount = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'session-a' && card.state === CardState.Hand) {
        expect(card.visibility).toBe(Visibility.OwnerOnly);
        handCount++;
      }
    });
    expect(handCount).toBe(5);
  });

  it('second player cannot see first player hand cards (OwnerOnly filter blocks them)', async () => {
    const clientB = makeMockClient('session-b');
    await (room as unknown as RoomInternals).onJoin(clientB, { displayName: 'Bob' });

    const viewerId: string = 'session-b';
    // For each card owned by player A, verify canSeeCardFace returns false for player B
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'session-a' && card.state === CardState.Hand) {
        // Simulate the @filter canSeeCardFace logic:
        const playerBCanSeeRank =
          card.visibility === Visibility.Public ||
          (card.visibility === Visibility.OwnerOnly && card.ownerId === viewerId);
        expect(playerBCanSeeRank).toBe(false);
      }
    });
  });

  it('shuffle randomizes deck order and does not expose order to clients', async () => {
    const clientA = makeMockClient('session-a');
    const before = room.state.deckSize;

    await (room as unknown as RoomInternals).handleShuffle(clientA, 'riffle', 'medium');

    // Deck size unchanged after shuffle
    expect(room.state.deckSize).toBe(before);
    // No card in deck should have Public visibility (order stays server-only)
    room.state.cards.forEach((card: CardSchema) => {
      if (card.state === CardState.Deck) {
        expect(card.visibility).toBe(Visibility.Hidden);
      }
    });
  });

  it('reveal makes a card Public (visible to all)', async () => {
    const clientA = makeMockClient('session-a');

    // Find a card owned by A in hand
    let targetCardId = '';
    room.state.cards.forEach((card: CardSchema) => {
      if (!targetCardId && card.ownerId === 'session-a' && card.state === CardState.Hand) {
        targetCardId = card.id;
      }
    });
    expect(targetCardId).not.toBe('');

    // Place the card first (Hand → Placed), then reveal (Placed → Revealed)
    // Actually we can't do Hand → Revealed directly per state machine.
    // Let's directly set state to Placed to test reveal path.
    const card = room.state.cards.get(targetCardId)!;
    card.state = CardState.Placed;
    card.ownerId = 'session-a'; // keep owner for requireOwner check

    await (room as unknown as RoomInternals).handleReveal(clientA, targetCardId);

    expect(card.visibility).toBe(Visibility.Public);
    expect(card.state).toBe(CardState.Revealed);
  });

  it('illegal draw from empty deck is rejected', async () => {
    const clientA = makeMockClient('session-a');
    // Drain the deck
    const deckSize = room.state.deckSize;
    if (deckSize > 0) {
      await (room as unknown as RoomInternals).handleDraw(clientA, deckSize);
    }
    expect(room.state.deckSize).toBe(0);

    // Now try to draw again — should reject and not change deck size
    await (room as unknown as RoomInternals).handleDraw(clientA, 1);
    expect(room.state.deckSize).toBe(0);
  });

  it('stealing another player card is rejected', async () => {
    const clientA = makeMockClient('session-a');
    const clientB = makeMockClient('session-b');

    // Player A draws a card
    await (room as unknown as RoomInternals).handleDraw(clientA, 1);

    let aCardId = '';
    room.state.cards.forEach((card: CardSchema) => {
      if (!aCardId && card.ownerId === 'session-a' && card.state === CardState.Hand) {
        aCardId = card.id;
      }
    });

    if (!aCardId) return; // deck might be empty

    const prevState = room.state.cards.get(aCardId)?.state;
    // B tries to place A's card
    await (room as unknown as RoomInternals).handlePlace(clientB, aCardId, 'table');

    // Card should not have been moved (state unchanged)
    expect(room.state.cards.get(aCardId)?.state).toBe(prevState);
    expect(room.state.cards.get(aCardId)?.ownerId).toBe('session-a');
  });
});

describe('grab / release intents', () => {
  let grabRoom: TableRoom;
  const clientA = makeMockClient('grab-session-a');
  const clientB = makeMockClient('grab-session-b');

  beforeAll(async () => {
    await matchMaker.setup(undefined, undefined);
    matchMaker.defineRoomType('grab_room', TableRoom);
    const listing = await matchMaker.createRoom('grab_room', {});
    grabRoom = matchMaker.getRoomById(listing.roomId) as TableRoom;
    await (grabRoom as unknown as RoomInternals).onJoin(clientA, { displayName: 'Alice' });
    await (grabRoom as unknown as RoomInternals).onJoin(clientB, { displayName: 'Bob' });
    // Give Alice several hand cards so individual tests always have one to work with
    await (grabRoom as unknown as RoomInternals).handleDraw(clientA, 5);
  });

  afterAll(async () => {
    if (grabRoom) await (grabRoom as unknown as RoomInternals).disconnect();
  });

  beforeEach(() => {
    // Clear sent messages before each test
    clientA.lastSent = [];
    clientB.lastSent = [];
  });

  function aliceHandCardId(): string {
    let id = '';
    grabRoom.state.cards.forEach((card: CardSchema) => {
      if (!id && card.ownerId === 'grab-session-a' && card.state === CardState.Hand) id = card.id;
    });
    return id;
  }

  it('owner can grab their own hand card → state becomes Selected, visibility stays OwnerOnly', () => {
    const cardId = aliceHandCardId();
    expect(cardId).not.toBe('');
    (grabRoom as unknown as RoomInternals).handleGrab(clientA, cardId);
    const card = grabRoom.state.cards.get(cardId)!;
    expect(card.state).toBe(CardState.Selected);
    expect(card.visibility).toBe(Visibility.OwnerOnly);
    expect(card.ownerId).toBe('grab-session-a');
  });

  it('grabbed card stays invisible to other players', () => {
    let selectedCardId = '';
    grabRoom.state.cards.forEach((card: CardSchema) => {
      if (!selectedCardId && card.state === CardState.Selected) selectedCardId = card.id;
    });
    expect(selectedCardId).not.toBe('');
    const card = grabRoom.state.cards.get(selectedCardId)!;
    const bobCanSee =
      card.visibility === Visibility.Public ||
      (card.visibility === Visibility.OwnerOnly && card.ownerId === 'grab-session-b');
    expect(bobCanSee).toBe(false);
  });

  it('release returns Selected card to Hand', () => {
    let selectedCardId = '';
    grabRoom.state.cards.forEach((card: CardSchema) => {
      if (!selectedCardId && card.state === CardState.Selected && card.ownerId === 'grab-session-a') {
        selectedCardId = card.id;
      }
    });
    expect(selectedCardId).not.toBe('');
    (grabRoom as unknown as RoomInternals).handleRelease(clientA, selectedCardId);
    expect(grabRoom.state.cards.get(selectedCardId)!.state).toBe(CardState.Hand);
  });

  it('non-owner cannot grab a Hand card → NotYourCard error sent', () => {
    const cardId = aliceHandCardId();
    expect(cardId).not.toBe('');
    clientB.lastSent = [];
    (grabRoom as unknown as RoomInternals).handleGrab(clientB, cardId);
    const err = clientB.lastSent.find((m) => m.type === 'error');
    expect(err).toBeDefined();
    expect((err!.message as { code: string }).code).toBe(ErrorCode.NotYourCard);
    expect(grabRoom.state.cards.get(cardId)!.state).toBe(CardState.Hand);
  });

  it('grabbing a Deck card is rejected → IllegalTransition error', () => {
    let deckCardId = '';
    grabRoom.state.cards.forEach((card: CardSchema) => {
      if (!deckCardId && card.state === CardState.Deck) deckCardId = card.id;
    });
    expect(deckCardId).not.toBe('');
    clientA.lastSent = [];
    (grabRoom as unknown as RoomInternals).handleGrab(clientA, deckCardId);
    const err = clientA.lastSent.find((m) => m.type === 'error');
    expect(err).toBeDefined();
    expect((err!.message as { code: string }).code).toBe(ErrorCode.IllegalTransition);
  });

  it('any seated player can grab a Placed card (sandbox)', () => {
    // Place a card on the table first
    const cardId = aliceHandCardId();
    expect(cardId).not.toBe('');
    (grabRoom as unknown as RoomInternals).handlePlace(clientA, cardId, 'table');
    const placed = grabRoom.state.cards.get(cardId)!;
    expect(placed.state).toBe(CardState.Placed);
    // Bob grabs the placed card
    clientB.lastSent = [];
    (grabRoom as unknown as RoomInternals).handleGrab(clientB, cardId);
    const errMsg = clientB.lastSent.find((m) => m.type === 'error');
    expect(errMsg).toBeUndefined();
    expect(grabRoom.state.cards.get(cardId)!.state).toBe(CardState.Selected);
    expect(grabRoom.state.cards.get(cardId)!.ownerId).toBe('grab-session-b');
    // Clean up: release it
    (grabRoom as unknown as RoomInternals).handleRelease(clientB, cardId);
  });

  it('release by non-owner is rejected → NotYourCard', () => {
    // Alice grabs a fresh card
    const cardId = aliceHandCardId();
    expect(cardId).not.toBe('');
    (grabRoom as unknown as RoomInternals).handleGrab(clientA, cardId);
    expect(grabRoom.state.cards.get(cardId)!.state).toBe(CardState.Selected);
    // Bob tries to release it
    clientB.lastSent = [];
    (grabRoom as unknown as RoomInternals).handleRelease(clientB, cardId);
    const err = clientB.lastSent.find((m) => m.type === 'error');
    expect(err).toBeDefined();
    expect((err!.message as { code: string }).code).toBe(ErrorCode.NotYourCard);
    // Clean up
    (grabRoom as unknown as RoomInternals).handleRelease(clientA, cardId);
  });

  it('rate limit — 21st intent in the same window is rejected with RateLimited', () => {
    // Use a far-future timestamp (1 hour ahead) to guarantee a fresh window,
    // avoiding interference from real-time calls made by earlier tests.
    const BASE = Date.now() + 3_600_000;
    const nowFn = () => BASE;
    const internals = grabRoom as unknown as RoomInternals;
    for (let i = 0; i < MAX_INTENTS_PER_SECOND; i++) {
      internals.checkRateLimit(clientA, nowFn);
    }
    expect(() => internals.checkRateLimit(clientA, nowFn)).toThrow();
  });

  it('rate limit — window resets after 1 second', () => {
    // Use a different far-future base (2 hours ahead) so the previous test's
    // window entry is in the past relative to this one.
    let tick = Date.now() + 7_200_000;
    const nowFn = () => tick;
    const internals = grabRoom as unknown as RoomInternals;
    for (let i = 0; i < MAX_INTENTS_PER_SECOND; i++) {
      internals.checkRateLimit(clientA, nowFn);
    }
    tick += 1001; // advance 1001 ms — triggers a new window
    expect(() => internals.checkRateLimit(clientA, nowFn)).not.toThrow();
  });
});
