import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { matchMaker } from 'colyseus';
import { TableRoom } from '../rooms/TableRoom';
import { CardState, Visibility } from '@faceless-spectre/shared';
import { CardSchema } from '../state/CardSchema';

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

interface RoomInternals {
  onJoin(client: MockClient, options?: Record<string, string>): Promise<void>;
  onLeave(client: MockClient, consented: boolean): Promise<void>;
  onDispose(): Promise<void>;
  handleDraw(client: MockClient, count: number): void;
  removePlayer(sessionId: string): void;
  remapSession(oldId: string, newId: string): void;
  allowReconnection(client: MockClient, seconds: number): Promise<void>;
  disconnect(): Promise<void>;
}

describe('TableRoom — reconnection', () => {
  let room: TableRoom;

  beforeAll(async () => {
    await matchMaker.setup(undefined, undefined);
    matchMaker.defineRoomType('table_room', TableRoom);
    const listing = await matchMaker.createRoom('table_room', {});
    room = matchMaker.getRoomById(listing.roomId) as TableRoom;
  });

  afterAll(async () => {
    if (room) {
      await (room as unknown as RoomInternals).disconnect();
    }
  });

  it('consented leave removes player immediately', async () => {
    const client = makeMockClient('leave-consented');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Alice' });
    expect(room.state.players.has('leave-consented')).toBe(true);

    await (room as unknown as RoomInternals).onLeave(client, true);
    expect(room.state.players.has('leave-consented')).toBe(false);
  });

  it('unconsentented disconnect holds seat with connected=false', async () => {
    const client = makeMockClient('leave-uncon');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Bob' });

    // Stub allowReconnection to never resolve (open window)
    (room as unknown as RoomInternals).allowReconnection = () => new Promise<void>(() => {});

    // Call onLeave but don't await — it will hang waiting for reconnection
    (room as unknown as RoomInternals).onLeave(client, false);

    // Player should still be in state with connected=false
    await new Promise((r) => setTimeout(r, 10));
    const player = room.state.players.get('leave-uncon');
    expect(player).toBeDefined();
    expect(player!.connected).toBe(false);
  });

  it('cards are kept for player during reconnection window', async () => {
    const client = makeMockClient('leave-cards');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Carol' });
    (room as unknown as RoomInternals).handleDraw(client, 3);

    // Count cards owned by this player before leaving
    let ownedBefore = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'leave-cards') ownedBefore++;
    });
    expect(ownedBefore).toBe(3);

    // Stub allowReconnection to hold indefinitely
    (room as unknown as RoomInternals).allowReconnection = () => new Promise<void>(() => {});

    (room as unknown as RoomInternals).onLeave(client, false);
    await new Promise((r) => setTimeout(r, 10));

    // Cards should still be owned by the player
    let ownedAfter = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'leave-cards') ownedAfter++;
    });
    expect(ownedAfter).toBe(3);
  });

  it('reconnection timeout removes player and returns cards to table', async () => {
    const client = makeMockClient('leave-timeout');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Dave' });
    (room as unknown as RoomInternals).handleDraw(client, 2);

    // Stub allowReconnection to reject immediately (timeout)
    (room as unknown as RoomInternals).allowReconnection = () => Promise.reject(new Error('timeout'));

    await (room as unknown as RoomInternals).onLeave(client, false);

    // Player should be gone
    expect(room.state.players.has('leave-timeout')).toBe(false);

    // Cards should have been returned (ownerId cleared, state Placed)
    let ownedAfter = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'leave-timeout') ownedAfter++;
    });
    expect(ownedAfter).toBe(0);
  });

  it('removePlayer clears cards and deletes player from state', async () => {
    const client = makeMockClient('remove-player');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Eve' });
    (room as unknown as RoomInternals).handleDraw(client, 2);

    (room as unknown as RoomInternals).removePlayer('remove-player');

    expect(room.state.players.has('remove-player')).toBe(false);

    let owned = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'remove-player') owned++;
    });
    expect(owned).toBe(0);
  });

  it('remapSession updates ownerId on all cards owned by old sessionId', async () => {
    const client = makeMockClient('old-session');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Frank' });
    (room as unknown as RoomInternals).handleDraw(client, 2);

    // Verify cards are owned by old-session
    let before = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'old-session') before++;
    });
    expect(before).toBe(2);

    (room as unknown as RoomInternals).remapSession('old-session', 'new-session');

    let afterOld = 0;
    let afterNew = 0;
    room.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'old-session') afterOld++;
      if (card.ownerId === 'new-session') afterNew++;
    });
    expect(afterOld).toBe(0);
    expect(afterNew).toBe(2);
  });

  it('returned cards are placed on table with Hidden visibility', async () => {
    const client = makeMockClient('returned-cards');
    await (room as unknown as RoomInternals).onJoin(client, { displayName: 'Grace' });
    (room as unknown as RoomInternals).handleDraw(client, 2);

    // Stub allowReconnection to reject (timeout)
    (room as unknown as RoomInternals).allowReconnection = () => Promise.reject(new Error('timeout'));
    await (room as unknown as RoomInternals).onLeave(client, false);

    // All previously owned cards should now be Placed + Hidden
    room.state.cards.forEach((card: CardSchema) => {
      if (card.state === CardState.Placed && card.zoneId === 'table') {
        expect(card.visibility).toBe(Visibility.Hidden);
      }
    });
  });
});
