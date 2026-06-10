import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import net from 'node:net';
import { Server as ColyseusServer, matchMaker } from 'colyseus';
import { Client as ColyseusClient, type Room } from 'colyseus.js';
import { ErrorCode, IntentType, RoomMode, ServerMessageType } from '@faceless-spectre/shared';
import { TableRoom } from '../rooms/TableRoom';

/**
 * MATCHMAKING / JOIN-MODEL INTEGRATION TESTS.
 *
 * One real Colyseus WS server for the file (local presence/driver — no Redis or
 * Postgres). Tests are isolated by disposing every room between them (afterEach
 * waits for the room list to drain), rather than rebooting Colyseus's global
 * matchmaker per test, which degrades after a few boot/shutdown cycles. Real
 * `colyseus.js` clients exercise Quick Play (joinOrCreate), private create, code
 * join (joinById), and host-only controls over the wire.
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

/** Replicates the GET /lobby visibility filter (browsable, unlocked, public). */
interface RoomListing {
  roomId: string;
  locked: boolean;
  private: boolean;
  metadata?: { browsable?: boolean; mode?: string };
}
async function browsableLobby(): Promise<RoomListing[]> {
  const rooms = (await matchMaker.query({ name: 'table_room' })) as unknown as RoomListing[];
  return rooms.filter((r) => r.metadata?.browsable === true && !r.locked && !r.private);
}

async function rawQuery(): Promise<RoomListing[]> {
  return (await matchMaker.query({ name: 'table_room' })) as unknown as RoomListing[];
}

describe('matchmaking & join model', () => {
  let server: ColyseusServer;
  let endpoint: string;
  const openRooms: Room[] = [];

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

  // Bounded, CONSENTED leave: consented removes the player immediately so the
  // empty room disposes (unconsented would hold the seat for 30s and pollute the
  // next test's matchmaking). The race-timeout guards a kicked/dead socket.
  const safeLeave = (room: Room): Promise<void> =>
    Promise.race([
      room.leave(true).then(() => undefined).catch(() => undefined),
      new Promise<void>((r) => setTimeout(r, 300)),
    ]);

  afterEach(async () => {
    await Promise.all(openRooms.map(safeLeave));
    openRooms.length = 0;
    // Wait for empty rooms to auto-dispose so the next test starts clean.
    // Non-throwing: tolerate a lingering room rather than failing on cleanup.
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const rooms = await matchMaker.query({ name: 'table_room' });
      if (rooms.length === 0) break;
      await new Promise((r) => setTimeout(r, 25));
    }
  });

  function track(room: Room): Room {
    openRooms.push(room);
    return room;
  }
  const client = () => new ColyseusClient(endpoint);

  it('Quick Play co-locates players, then opens a fresh room once one is full', async () => {
    // Seed a 2-seat public room (host fills seat 1).
    const roomA = track(await client().create('table_room', { mode: RoomMode.Public, maxPlayers: 2, displayName: 'A' }));
    // A second Quick Play joins the same room (1 free seat) → now full.
    const roomB = track(await client().joinOrCreate('table_room', { mode: RoomMode.Public, displayName: 'B' }));
    expect(roomB.id).toBe(roomA.id);

    // The room is full+locked; a third Quick Play must land in a NEW room.
    const roomC = track(await client().joinOrCreate('table_room', { mode: RoomMode.Public, displayName: 'C' }));
    expect(roomC.id).not.toBe(roomA.id);
  });

  it('a private room is hidden from the lobby and never Quick-Play matched', async () => {
    const priv = track(await client().create('table_room', { mode: RoomMode.Private, maxPlayers: 4, displayName: 'Host' }));

    const lobby = await browsableLobby();
    expect(lobby.find((r) => r.roomId === priv.id)).toBeUndefined();

    // Quick Play must not enter the private room — it spins up a new one.
    const quick = track(await client().joinOrCreate('table_room', { mode: RoomMode.Public, displayName: 'Rando' }));
    expect(quick.id).not.toBe(priv.id);
  });

  it('enabling backfill makes a private room Quick-Play matchable but still unlisted', async () => {
    const host = client();
    const priv = track(await host.create('table_room', { mode: RoomMode.Private, maxPlayers: 4, displayName: 'Host' }));

    // Before backfill: listing shows it private.
    let listing = (await rawQuery()).find((r) => r.roomId === priv.id)!;
    expect(listing.private).toBe(true);

    // Host opts into backfill.
    priv.send(IntentType.SetBackfill, { enabled: true });
    await waitFor(() => (priv.state as unknown as { allowRandomFill: boolean }).allowRandomFill === true);

    // Now matchmaking-eligible (private flag cleared) ...
    listing = (await rawQuery()).find((r) => r.roomId === priv.id)!;
    expect(listing.private).toBe(false);
    // ... but still kept OUT of the browsable lobby.
    const lobby = await browsableLobby();
    expect(lobby.find((r) => r.roomId === priv.id)).toBeUndefined();

    // With no other room available, Quick Play lands in the backfill room.
    const filler = track(await client().joinOrCreate('table_room', { mode: RoomMode.Public, displayName: 'Filler' }));
    expect(filler.id).toBe(priv.id);
  });

  it('non-host control intents are rejected with NOT_HOST; the host succeeds', async () => {
    const host = client();
    const roomHost = track(await host.create('table_room', { mode: RoomMode.Private, maxPlayers: 4, displayName: 'Host' }));
    const roomGuest = track(await client().joinById(roomHost.id, { displayName: 'Guest' }));

    // Guest tries to lock → server replies with an Error(NOT_HOST), no state change.
    let guestError: { code?: string } | null = null;
    roomGuest.onMessage(ServerMessageType.Error, (msg: { code?: string }) => {
      guestError = msg;
    });
    roomGuest.send(IntentType.LockTable, {});
    await waitFor(() => guestError !== null);
    expect(guestError!.code).toBe(ErrorCode.NotHost);
    expect((roomHost.state as unknown as { locked: boolean }).locked).toBe(false);

    // Host locks successfully.
    roomHost.send(IntentType.LockTable, {});
    await waitFor(() => (roomHost.state as unknown as { locked: boolean }).locked === true);
  });

  it('host kick removes the target immediately', async () => {
    const host = client();
    const roomHost = track(await host.create('table_room', { mode: RoomMode.Private, maxPlayers: 4, displayName: 'Host' }));
    const guestClient = client();
    const roomGuest = track(await guestClient.joinById(roomHost.id, { displayName: 'Guest' }));
    const guestSession = roomGuest.sessionId;

    await waitFor(() => (roomHost.state as unknown as { players: { size: number } }).players.size === 2);

    roomHost.send(IntentType.Kick, { targetId: guestSession });

    await waitFor(
      () =>
        !(roomHost.state as unknown as { players: { has(id: string): boolean } }).players.has(guestSession),
    );
    expect(
      (roomHost.state as unknown as { players: { size: number } }).players.size,
    ).toBe(1);
  });

  it('a locked/full room rejects further joins by code', async () => {
    const roomHost = track(await client().create('table_room', { mode: RoomMode.Private, maxPlayers: 2, displayName: 'Host' }));
    track(await client().joinById(roomHost.id, { displayName: 'Guest' })); // 2/2 → player-full

    await expect(client().joinById(roomHost.id, { displayName: 'Late' })).rejects.toBeDefined();
  });

  it('a spectator joins a full table without a seat and cannot act', async () => {
    // Fill a 2-seat public room.
    const a = track(await client().create('table_room', { mode: RoomMode.Public, maxPlayers: 2, displayName: 'A' }));
    const b = track(await client().joinOrCreate('table_room', { mode: RoomMode.Public, displayName: 'B' }));
    expect(b.id).toBe(a.id);

    // A would-be player is rejected (full)...
    await expect(client().joinById(a.id, { displayName: 'late' })).rejects.toBeDefined();

    // ...but a spectator can still join the full table by id.
    const spec = track(await client().joinById(a.id, { displayName: 'Watcher', spectate: true }));
    await waitFor(() => (spec.state as unknown as { spectatorCount: number }).spectatorCount === 1);
    // No seat taken — players stays at 2.
    expect((spec.state as unknown as { players: { size: number } }).players.size).toBe(2);

    // A spectator action is rejected (no seat).
    let specError: { code?: string } | null = null;
    spec.onMessage(ServerMessageType.Error, (m: { code?: string }) => {
      specError = m;
    });
    spec.send(IntentType.Draw, {});
    await waitFor(() => specError !== null);
    expect(specError!.code).toBe(ErrorCode.InvalidSeat);
  });

  it('a majority backfill vote opens a private room to randoms', async () => {
    const roomHost = track(await client().create('table_room', { mode: RoomMode.Private, maxPlayers: 4, displayName: 'Host' }));
    const roomB = track(await client().joinById(roomHost.id, { displayName: 'B' }));
    const roomC = track(await client().joinById(roomHost.id, { displayName: 'C' }));
    await waitFor(() => (roomHost.state as unknown as { players: { size: number } }).players.size === 3);

    type VoteState = { backfillVoteActive: boolean; backfillVoteYes: number; allowRandomFill: boolean };
    const vs = () => roomHost.state as unknown as VoteState;

    // First vote opens the poll; 1 of 3 is not yet a majority.
    roomB.send(IntentType.BackfillVote, { approve: true });
    await waitFor(() => vs().backfillVoteActive && vs().backfillVoteYes === 1);
    expect(vs().allowRandomFill).toBe(false);

    // Second yes reaches a majority (2 of 3) → backfill enabled, vote closes.
    roomC.send(IntentType.BackfillVote, { approve: true });
    await waitFor(() => vs().allowRandomFill === true);
    expect(vs().backfillVoteActive).toBe(false);
  });
});
