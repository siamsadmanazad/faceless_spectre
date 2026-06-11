import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import { Server as ColyseusServer } from 'colyseus';
import { Client as ColyseusClient, type Room } from 'colyseus.js';
import {
  IntentType,
  ServerMessageType,
  MAX_CHAT_LENGTH,
  MAX_CHAT_PER_SECOND,
  type ChatMessage,
} from '@faceless-spectre/shared';
import { TableRoom } from '../rooms/TableRoom';

/**
 * LIVE WIRE — chat relay.
 *
 * Boots a real Colyseus server + TableRoom and connects real clients over a
 * socket. Chat is server-authoritative and non-secret: the client sends only
 * intent text; the server resolves the sender's name, sanitizes/length-caps the
 * text, rate-limits floods, and broadcasts a ChatMessage to everyone. These
 * tests assert the bytes that actually cross the wire (the decoded broadcast).
 */

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

/** Collect every ChatMessage a room receives. */
function chatSink(room: Room): ChatMessage[] {
  const out: ChatMessage[] = [];
  room.onMessage(ServerMessageType.Chat, (m: ChatMessage) => out.push(m));
  return out;
}

describe('LIVE WIRE — chat relay', () => {
  let server: ColyseusServer;
  let endpoint: string;

  beforeAll(async () => {
    const port = await getFreePort();
    endpoint = `ws://localhost:${port}`;
    server = new ColyseusServer();
    server.define('table_room', TableRoom);
    await server.listen(port);
  });

  afterAll(async () => {
    if (server) await server.gracefullyShutdown(false);
  });

  it('broadcasts a chat line to every client with the server-resolved sender name', async () => {
    const clientA = new ColyseusClient(endpoint);
    const roomA = await clientA.joinOrCreate('table_room', { displayName: 'Alice' });
    const clientB = new ColyseusClient(endpoint);
    const roomB = await clientB.joinById(roomA.id, { displayName: 'Bob' });

    const seenByA = chatSink(roomA);
    const seenByB = chatSink(roomB);

    try {
      await waitFor(() => (roomB.state as unknown as { players: { size: number } }).players.size === 2);

      roomA.send(IntentType.Chat, { text: 'Nice hand!' });

      // Sender and peer both receive the same broadcast.
      await waitFor(() => seenByA.length === 1 && seenByB.length === 1);

      const msg = seenByB[0];
      expect(msg.text).toBe('Nice hand!');
      expect(msg.fromName).toBe('Alice'); // resolved server-side, not client-supplied
      expect(msg.fromId).toBe(roomA.sessionId);
      expect(typeof msg.ts).toBe('number');
    } finally {
      await roomA.leave();
      await roomB.leave();
    }
  });

  it('trims and length-caps the text; drops empty/whitespace messages', async () => {
    const client = new ColyseusClient(endpoint);
    const room = await client.joinOrCreate('table_room', { displayName: 'Solo' });
    const seen = chatSink(room);

    try {
      await waitFor(() => (room.state as unknown as { players: { size: number } }).players.size === 1);

      // Whitespace-only → no broadcast.
      room.send(IntentType.Chat, { text: '   ' });
      // Over-length → truncated to MAX_CHAT_LENGTH.
      const long = 'x'.repeat(MAX_CHAT_LENGTH + 50);
      room.send(IntentType.Chat, { text: long });

      await waitFor(() => seen.length === 1);
      // Only the long message survived, capped.
      expect(seen).toHaveLength(1);
      expect(seen[0].text).toHaveLength(MAX_CHAT_LENGTH);
    } finally {
      await room.leave();
    }
  });

  it('silently drops messages above the per-second rate cap', async () => {
    const client = new ColyseusClient(endpoint);
    const room = await client.joinOrCreate('table_room', { displayName: 'Spammer' });
    const seen = chatSink(room);

    try {
      await waitFor(() => (room.state as unknown as { players: { size: number } }).players.size === 1);

      const sent = MAX_CHAT_PER_SECOND + 5;
      for (let i = 0; i < sent; i++) room.send(IntentType.Chat, { text: `m${i}` });

      // Give the server time to relay whatever it accepts.
      await new Promise((r) => setTimeout(r, 300));

      // The cap holds: fewer delivered than sent, and never more than the cap.
      expect(seen.length).toBeLessThanOrEqual(MAX_CHAT_PER_SECOND);
      expect(seen.length).toBeLessThan(sent);
      expect(seen.length).toBeGreaterThan(0);
    } finally {
      await room.leave();
    }
  });
});
