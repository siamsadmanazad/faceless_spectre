/**
 * 4-player load test — verifies game-state bandwidth stays under 40 KB/s per player.
 * Usage: SERVER_URL=http://localhost:2567 node scripts/load-test.mjs
 *
 * Requires a running server with at least one empty table room available.
 */

import { Client } from 'colyseus.js';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:2567';
const DURATION_MS = 10_000;
const BUDGET_BYTES_PER_SEC = 40 * 1024; // 40 KB/s per player

async function joinRoom(displayName, roomId) {
  const body = { displayName };
  if (roomId) body.roomId = roomId;

  const res = await fetch(`${SERVER}/rooms/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to join room: ${err.error ?? res.status}`);
  }

  const { seatReservation, roomId: assignedRoomId } = await res.json();
  const client = new Client(SERVER);
  const room = await client.consumeSeatReservation(seatReservation);
  return { room, roomId: assignedRoomId };
}

async function main() {
  console.log(`Connecting 4 players to ${SERVER}...`);

  const { room: room1, roomId } = await joinRoom('Player 1');
  console.log(`Room created: ${roomId}`);

  const [{ room: room2 }, { room: room3 }, { room: room4 }] = await Promise.all([
    joinRoom('Player 2', roomId),
    joinRoom('Player 3', roomId),
    joinRoom('Player 4', roomId),
  ]);

  const rooms = [room1, room2, room3, room4];
  const byteCounts = rooms.map(() => 0);

  // Intercept raw WebSocket messages to count inbound bytes
  rooms.forEach((room, i) => {
    const ws = room.connection?.ws ?? room._client?.connection?.ws;
    if (!ws) {
      console.warn(`Warning: cannot access WebSocket for Player ${i + 1} — byte count will be 0`);
      return;
    }
    const original = ws.onmessage;
    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        byteCounts[i] += evt.data.byteLength;
      } else if (typeof evt.data === 'string') {
        byteCounts[i] += new TextEncoder().encode(evt.data).length;
      } else if (evt.data?.byteLength !== undefined) {
        byteCounts[i] += evt.data.byteLength;
      }
      original?.call(ws, evt);
    };
  });

  console.log(`Running for ${DURATION_MS / 1000}s with simulated activity...`);

  // Simulate realistic activity: draws, shuffles, deals at a moderate pace
  let tick = 0;
  const interval = setInterval(() => {
    const actor = rooms[tick % rooms.length];
    if (tick % 10 === 0) {
      actor.send('shuffle', { style: 'riffle', intensity: 'medium' });
    } else if (tick % 5 === 0) {
      actor.send('deal', { count: 1, seats: [] });
    } else {
      actor.send('draw', {});
    }
    tick++;
  }, 500);

  await new Promise((r) => setTimeout(r, DURATION_MS));
  clearInterval(interval);
  rooms.forEach((r) => r.leave());

  console.log('\nResults:');
  console.log('─'.repeat(50));

  const durationSec = DURATION_MS / 1000;
  let failed = false;

  byteCounts.forEach((bytes, i) => {
    const bps = bytes / durationSec;
    const kbps = (bps / 1024).toFixed(2);
    const pass = bps <= BUDGET_BYTES_PER_SEC;
    const marker = pass ? '✓' : '✗ OVER BUDGET';
    console.log(`Player ${i + 1}: ${kbps.padStart(8)} KB/s  ${marker}`);
    if (!pass) failed = true;
  });

  console.log('─'.repeat(50));

  if (failed) {
    console.error('\nLoad test FAILED — bandwidth budget exceeded (limit: 40 KB/s per player)');
    process.exit(1);
  } else {
    console.log('\nLoad test PASSED — all players within 40 KB/s budget');
  }
}

main().catch((err) => {
  console.error('Load test error:', err.message);
  process.exit(1);
});
