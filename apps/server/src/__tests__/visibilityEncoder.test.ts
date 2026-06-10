import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { matchMaker } from 'colyseus';
import { CardState, Visibility } from '@faceless-spectre/shared';
import { RoomStateSchema } from '../state/RoomStateSchema';
import { CardSchema } from '../state/CardSchema';
import { TableRoom } from '../rooms/TableRoom';

/**
 * THE SACRED TEST — exercises the REAL serialization path.
 *
 * The unit tests in visibility.test.ts assert on a re-implemented copy of
 * canSeeCardFace. This file instead drives the actual `@filter` decorator
 * through Colyseus's own serializer: it asks the room serializer for the full
 * state a given client would receive (`getFullState(client)` — the exact call
 * Colyseus makes on join) and decodes those bytes into a fresh schema. The
 * decoded schema is byte-for-byte what that client gets over the wire.
 *
 * It guards three ways hidden card data could leak:
 *   1. the filtered `rank`/`suit` fields themselves,
 *   2. `position` — the initial deck index, which maps to a face via the public
 *      deck order, so it must be filtered too,
 *   3. the card `id` — an UNFILTERED handle that must not encode the face.
 *
 * If any of these fail, hidden card data is leaving the server. They must pass
 * on every commit.
 */

type MockClient = {
  sessionId: string;
  readyState: number;
  id: string;
  state: number;
  ref: { emit: () => void };
  send: () => void;
  leave: () => void;
  error: () => void;
  lastSent: unknown[];
};

function makeMockClient(sessionId: string): MockClient {
  return {
    sessionId,
    readyState: 1,
    id: sessionId,
    state: 1,
    ref: { emit: () => {} },
    send: () => {},
    leave: () => {},
    error: () => {},
    lastSent: [],
  };
}

interface RoomInternals {
  onJoin(client: MockClient, options?: Record<string, string>): Promise<void>;
  handleDraw(client: MockClient, count: number): void;
  disconnect(): Promise<void>;
}

/** Decode the exact bytes Colyseus would send `client` as full room state. */
function wireView(room: TableRoom, client: MockClient): RoomStateSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bytes = (room as any)._serializer.getFullState(client);
  const decoded = new RoomStateSchema();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (decoded as any).decode(bytes);
  return decoded;
}

describe('visibility — REAL Colyseus encoder path (sacred)', () => {
  let room: TableRoom;
  const alice = makeMockClient('alice');
  const bob = makeMockClient('bob');
  let aliceView: RoomStateSchema;
  let bobView: RoomStateSchema;

  beforeAll(async () => {
    await matchMaker.setup(undefined, undefined);
    matchMaker.defineRoomType('sacred_room', TableRoom);
    const listing = await matchMaker.createRoom('sacred_room', {});
    room = matchMaker.getRoomById(listing.roomId) as TableRoom;
    await (room as unknown as RoomInternals).onJoin(alice, { displayName: 'Alice' });
    await (room as unknown as RoomInternals).onJoin(bob, { displayName: 'Bob' });
    (room as unknown as RoomInternals).handleDraw(alice, 3); // Alice owns 3 hand cards

    aliceView = wireView(room, alice);
    bobView = wireView(room, bob);
  });

  afterAll(async () => {
    if (room) await (room as unknown as RoomInternals).disconnect();
  });

  it('serialization actually works (all 52 cards reach the wire)', () => {
    // Guards the change-tracking regression: if the schema setters are shadowed
    // (useDefineForClassFields), the encoder emits nothing and this is 0.
    expect(aliceView.cards.size).toBe(52);
    expect(bobView.cards.size).toBe(52);
    expect(aliceView.deckSize).toBe(49);
  });

  it("a NON-owner receives no rank/suit/position for another player's hand cards", () => {
    let checked = 0;
    bobView.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'alice' && card.state === CardState.Hand) {
        expect(card.rank).toBe('');
        expect(card.suit).toBe('');
        expect(card.position).toBe(0); // filtered → default, never the real index
        checked++;
      }
    });
    expect(checked).toBe(3);
  });

  it('NObody receives rank/suit for face-down deck cards', () => {
    for (const view of [aliceView, bobView]) {
      let deckChecked = 0;
      view.cards.forEach((card: CardSchema) => {
        if (card.state === CardState.Deck) {
          expect(card.rank).toBe('');
          expect(card.suit).toBe('');
          deckChecked++;
        }
      });
      expect(deckChecked).toBe(49);
    }
  });

  it('the OWNER does receive rank/suit for their own hand cards', () => {
    let withFace = 0;
    aliceView.cards.forEach((card: CardSchema) => {
      if (card.ownerId === 'alice' && card.state === CardState.Hand) {
        expect(card.rank).not.toBe('');
        expect(card.suit).not.toBe('');
        withFace++;
      }
    });
    expect(withFace).toBe(3);
  });

  it('structural fields (id, visibility, state) reach every client', () => {
    for (const view of [aliceView, bobView]) {
      view.cards.forEach((card: CardSchema) => {
        expect(card.id).not.toBe('');
        expect(card.visibility).not.toBe('');
        expect(card.state).not.toBe('');
      });
    }
  });
});

describe('visibility — card id is opaque (no face leak via unfiltered handle)', () => {
  let room: TableRoom;

  beforeAll(async () => {
    await matchMaker.setup(undefined, undefined);
    matchMaker.defineRoomType('opaque_id_room', TableRoom);
    const listing = await matchMaker.createRoom('opaque_id_room', {});
    room = matchMaker.getRoomById(listing.roomId) as TableRoom;
  });

  afterAll(async () => {
    if (room) await (room as unknown as RoomInternals).disconnect();
  });

  it('no card id equals or contains its rank+suit', () => {
    room.state.cards.forEach((card: CardSchema) => {
      const face = `${card.rank}${card.suit}`;
      expect(card.id).not.toBe(face);
      // suits are uppercase letters absent from a lowercase-hex uuid, so this
      // also fails loudly for any scheme like `${rank}${suit}-${uuid}`.
      expect(card.id.includes(card.rank) && card.id.includes(card.suit)).toBe(false);
    });
  });

  it('all 52 card ids are unique', () => {
    const ids = new Set<string>();
    room.state.cards.forEach((card: CardSchema) => ids.add(card.id));
    expect(ids.size).toBe(52);
  });
});
