import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import { Server as ColyseusServer } from 'colyseus';
import { Client as ColyseusClient, type Room } from 'colyseus.js';
import { CardState, IntentType, Visibility } from '@faceless-spectre/shared';
import { TableRoom } from '../rooms/TableRoom';

/**
 * LIVE WIRE INTEGRATION TEST.
 *
 * Boots a real Colyseus WebSocket server with the real TableRoom (default
 * transport + LOCAL presence/driver — no Redis, no Postgres) and connects real
 * `colyseus.js` clients over an actual socket. Assertions read the DECODED
 * client state — i.e. exactly the bytes that crossed the wire, decoded by the
 * client's own reflection-based deserializer.
 *
 * This is the test the unit suites could not be: it proves end-to-end that
 *   (a) state actually serializes (regression guard for the
 *       useDefineForClassFields break, where a joining client got 0 cards), and
 *   (b) the per-viewer @filter holds on the live wire — a non-owner decodes
 *       backs (empty rank/suit) for hidden and owner-only cards.
 */

// Minimal shape of a decoded card on the client.
interface WireCard {
  id: string;
  state: string;
  visibility: string;
  ownerId: string;
  rank: string;
  suit: string;
  position: number;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(
  predicate: () => boolean,
  { timeout = 5000, interval = 20 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('waitFor timed out');
}

/** All decoded cards in a client's view as plain objects. */
function cardsOf(room: Room): WireCard[] {
  const out: WireCard[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (room.state as any).cards.forEach((c: any) => {
    out.push({
      id: c.id,
      state: c.state,
      visibility: c.visibility,
      ownerId: c.ownerId,
      rank: c.rank,
      suit: c.suit,
      position: c.position,
    });
  });
  return out;
}

const deckSizeOf = (room: Room): number =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (room.state as any).deckSize as number;

describe('LIVE WIRE — server→client serialization + per-viewer filter', () => {
  let server: ColyseusServer;
  let endpoint: string;

  beforeAll(async () => {
    const port = await getFreePort();
    endpoint = `ws://localhost:${port}`;
    server = new ColyseusServer(); // default WS transport, local presence + driver
    server.define('table_room', TableRoom);
    await server.listen(port);
  });

  afterAll(async () => {
    if (server) await server.gracefullyShutdown(false);
  });

  it('a freshly joined client decodes 52 face-down deck cards (serialization works)', async () => {
    const client = new ColyseusClient(endpoint);
    const room = await client.joinOrCreate('table_room', { displayName: 'Solo' });
    try {
      await waitFor(() => (room.state as unknown as { cards: { size: number } }).cards.size === 52);

      expect(deckSizeOf(room)).toBe(52);
      const cards = cardsOf(room);
      expect(cards).toHaveLength(52);
      // Every deck card is face-down on the wire: the filtered fields never
      // arrive, so they decode as absent (undefined). A leak would surface a
      // real rank/suit, or a non-zero position index.
      for (const c of cards) {
        expect(c.state).toBe(CardState.Deck);
        expect(c.visibility).toBe(Visibility.Hidden);
        expect(c.rank).toBeFalsy();
        expect(c.suit).toBeFalsy();
        expect(c.position).toBeFalsy();
        // id is an opaque handle, never the face.
        expect(c.id).not.toMatch(/^(?:[2-9]|10|[JQKA])[SHDC]$/);
      }
    } finally {
      await room.leave();
    }
  });

  it("a non-owner decodes backs for another player's drawn cards; the owner sees faces", async () => {
    const clientA = new ColyseusClient(endpoint);
    const roomA = await clientA.joinOrCreate('table_room', { displayName: 'Alice' });
    const clientB = new ColyseusClient(endpoint);
    const roomB = await clientB.joinById(roomA.id, { displayName: 'Bob' });

    try {
      await waitFor(() => (roomB.state as unknown as { cards: { size: number } }).cards.size === 52);

      // Alice draws 3 cards.
      roomA.send(IntentType.Draw, {});
      roomA.send(IntentType.Draw, {});
      roomA.send(IntentType.Draw, {});

      // Both clients converge on the new deck size over the wire.
      await waitFor(() => deckSizeOf(roomA) === 49 && deckSizeOf(roomB) === 49);

      const aSession = roomA.sessionId;

      // Alice's OWN view: her 3 hand cards carry rank + suit.
      const aliceHand = cardsOf(roomA).filter(
        (c) => c.ownerId === aSession && c.state === CardState.Hand,
      );
      expect(aliceHand).toHaveLength(3);
      for (const c of aliceHand) {
        expect(c.rank).toBeTruthy();
        expect(c.suit).toBeTruthy();
        expect(c.visibility).toBe(Visibility.OwnerOnly);
      }

      // Bob's view of the SAME cards (matched by opaque id): backs only.
      const aliceCardIds = new Set(aliceHand.map((c) => c.id));
      const bobsViewOfAlice = cardsOf(roomB).filter((c) => aliceCardIds.has(c.id));
      expect(bobsViewOfAlice).toHaveLength(3);
      for (const c of bobsViewOfAlice) {
        expect(c.ownerId).toBe(aSession); // ownerId is structural, not secret
        expect(c.rank).toBeFalsy(); // face never crossed the wire to Bob
        expect(c.suit).toBeFalsy();
        expect(c.position).toBeFalsy();
      }
    } finally {
      await roomA.leave();
      await roomB.leave();
    }
  });

  it('deal filters per-owner: each player sees only their own dealt faces', async () => {
    const clientA = new ColyseusClient(endpoint);
    const roomA = await clientA.joinOrCreate('table_room', { displayName: 'Alice' });
    const clientB = new ColyseusClient(endpoint);
    const roomB = await clientB.joinById(roomA.id, { displayName: 'Bob' });

    try {
      await waitFor(() => (roomB.state as unknown as { cards: { size: number } }).cards.size === 52);

      // Deal 2 to every seat.
      roomA.send(IntentType.Deal, { count: 2, seats: [] });

      // 2 seats × 2 cards = 4 dealt.
      await waitFor(() => deckSizeOf(roomA) === 48 && deckSizeOf(roomB) === 48);

      const aSession = roomA.sessionId;
      const bSession = roomB.sessionId;

      // From Alice's view: her own dealt cards have faces, Bob's are backs.
      const fromAlice = cardsOf(roomA);
      const aliceOwn = fromAlice.filter((c) => c.ownerId === aSession && c.state === CardState.Hand);
      const bobSeenByAlice = fromAlice.filter((c) => c.ownerId === bSession && c.state === CardState.Hand);
      expect(aliceOwn.length).toBe(2);
      expect(bobSeenByAlice.length).toBe(2);
      expect(aliceOwn.every((c) => c.rank && c.suit)).toBeTruthy();
      expect(bobSeenByAlice.every((c) => !c.rank && !c.suit)).toBe(true);

      // Symmetric from Bob's view.
      const fromBob = cardsOf(roomB);
      const bobOwn = fromBob.filter((c) => c.ownerId === bSession && c.state === CardState.Hand);
      const aliceSeenByBob = fromBob.filter((c) => c.ownerId === aSession && c.state === CardState.Hand);
      expect(bobOwn.length).toBe(2);
      expect(aliceSeenByBob.length).toBe(2);
      expect(bobOwn.every((c) => c.rank && c.suit)).toBeTruthy();
      expect(aliceSeenByBob.every((c) => !c.rank && !c.suit)).toBe(true);
    } finally {
      await roomA.leave();
      await roomB.leave();
    }
  });
});
