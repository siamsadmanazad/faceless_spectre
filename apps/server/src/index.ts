import 'dotenv/config';
import http from 'node:http';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as ColyseusServer, matchMaker } from 'colyseus';
import { RedisPresence } from '@colyseus/redis-presence';
import { RedisDriver } from '@colyseus/redis-driver';
import Redis from 'ioredis';
import { TableRoom } from './rooms/TableRoom';
import { auditStore } from './engine/AuditStore';
import { verifyReplay } from './engine/replayVerifier';
import { pgPool } from './db';

const PORT = Number(process.env.PORT ?? 2567);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function pingRedis(): Promise<void> {
  const redis = new Redis(REDIS_URL);
  await redis.ping();
  redis.disconnect();
  console.log('[server] Connected to Redis');
}

async function main(): Promise<void> {
  // Verify connectivity
  await Promise.all([
    pgPool.query('SELECT 1').then(() => console.log('[server] Connected to Postgres')),
    pingRedis(),
  ]);

  // Create audit table if it doesn't exist
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS room_audits (
      room_id TEXT PRIMARY KEY,
      history JSONB NOT NULL DEFAULT '[]',
      rejected_intents JSONB NOT NULL DEFAULT '[]',
      finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok', service: 'faceless-spectre-server' }));

  /** Public, joinable tables only — private and backfill rooms are hidden,
   *  as are full/locked rooms. Filtered in JS so it's driver-agnostic. */
  app.get('/lobby', async () => {
    const rooms = await matchMaker.query({ name: 'table_room' });
    return rooms
      .filter((r) => r.metadata?.browsable === true && !r.locked && !r.private)
      .map((r) => ({
        roomId: r.roomId,
        clients: r.clients,
        maxClients: r.maxClients,
        locked: r.locked,
        mode: r.metadata?.mode ?? 'public',
      }));
  });

  /** Quick Play — drop into any matchmade public/backfill room with a free
   *  seat, or create a fresh public one. */
  app.post<{ Body: { displayName?: string; maskId?: string; clientId?: string } }>('/rooms/quickplay', async (req, reply) => {
    try {
      const { displayName, maskId, clientId } = req.body ?? {};
      const reservation = await matchMaker.joinOrCreate('table_room', { displayName, maskId, clientId, mode: 'public' });
      return reply.code(200).send({ roomId: reservation.room.roomId, seatReservation: reservation });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Quick Play failed';
      return reply.code(400).send({ error: msg });
    }
  });

  /** Create a new table (public or private) and return its code + reservation. */
  app.post<{ Body: { displayName?: string; maskId?: string; maxPlayers?: number; mode?: string; clientId?: string } }>(
    '/rooms/create',
    async (req, reply) => {
      try {
        const { displayName, maskId, maxPlayers, mode, clientId } = req.body ?? {};
        const reservation = await matchMaker.create('table_room', {
          displayName,
          maskId,
          clientId,
          maxPlayers,
          mode: mode === 'private' ? 'private' : 'public',
        });
        return reply.code(200).send({
          roomId: reservation.room.roomId,
          code: reservation.room.roomId,
          seatReservation: reservation,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create room';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  /** Join an existing room by code/id, or create one as a fallback. */
  app.post<{ Body: { roomId?: string; displayName?: string; maskId?: string; maxPlayers?: number; clientId?: string } }>(
    '/rooms/join',
    async (req, reply) => {
      try {
        const { roomId, displayName, maskId, maxPlayers, clientId } = req.body ?? {};
        const joinOptions = { displayName, maskId, clientId };

        const reservation = roomId
          ? await matchMaker.joinById(roomId, joinOptions)
          : await matchMaker.create('table_room', { ...joinOptions, maxPlayers });

        return reply.code(200).send({
          roomId: reservation.room.roomId,
          seatReservation: reservation,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to join room';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  /** Returns the full audit trail for a room, including inline replay verification.
   *  Checks in-memory AuditStore first (live rooms), then falls back to Postgres (closed rooms). */
  app.get<{ Params: { roomId: string } }>('/rooms/:roomId/audit', async (req, reply) => {
    const { roomId } = req.params;

    let audit = auditStore.get(roomId);

    if (!audit) {
      const result = await pgPool.query(
        'SELECT room_id, history, rejected_intents, finalized_at FROM room_audits WHERE room_id = $1',
        [roomId],
      );
      if (result.rows.length === 0) return reply.code(404).send({ error: 'Room audit not found' });
      const r = result.rows[0];
      audit = {
        roomId: r.room_id,
        history: r.history,
        rejectedIntents: r.rejected_intents,
        snapshotAt: new Date(r.finalized_at).getTime(),
      };
    }

    const verification = verifyReplay(audit.history);
    return reply.send({ ...audit, verification });
  });

  // Register TableRoom type with matchMaker before first request arrives
  const gameServer = new ColyseusServer({
    presence: new RedisPresence(REDIS_URL),
    driver: new RedisDriver(REDIS_URL),
  });
  gameServer.define('table_room', TableRoom);

  // Listen first so Fastify's request handler is registered on app.server
  await app.listen({ port: PORT, host: '0.0.0.0' });

  // Attach Colyseus WebSocket transport to the same HTTP server AFTER listen
  // so Fastify's listeners are captured in attachMatchMakingRoutes.
  gameServer.attach({ server: app.server as http.Server });

  console.log(`[server] Faceless Spectre server listening on port ${PORT}`);
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
