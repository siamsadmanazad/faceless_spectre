import 'dotenv/config';
import http from 'node:http';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as ColyseusServer, matchMaker } from 'colyseus';
import { Client as PgClient } from 'pg';
import Redis from 'ioredis';
import { TableRoom } from './rooms/TableRoom';

const PORT = Number(process.env.PORT ?? 2567);

async function pingPostgres(): Promise<void> {
  const client = new PgClient({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('SELECT 1');
  await client.end();
  console.log('[server] Connected to Postgres');
}

async function pingRedis(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.ping();
  redis.disconnect();
  console.log('[server] Connected to Redis');
}

async function main(): Promise<void> {
  await Promise.all([pingPostgres(), pingRedis()]);

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok', service: 'faceless-spectre-server' }));

  app.get('/lobby', async () => {
    const rooms = await matchMaker.query({ name: 'table_room' });
    return rooms.map((r) => ({
      roomId: r.roomId,
      clients: r.clients,
      maxClients: r.maxClients,
      locked: r.locked,
    }));
  });

  /** Join or create a room and return a seat reservation for direct WS connect. */
  app.post<{ Body: { roomId?: string; displayName?: string; maskId?: string } }>(
    '/rooms/join',
    async (req, reply) => {
      try {
        const { roomId, displayName, maskId } = req.body ?? {};
        const options = { displayName, maskId };

        const reservation = roomId
          ? await matchMaker.joinById(roomId, options)
          : await matchMaker.joinOrCreate('table_room', options);

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

  // Register TableRoom type with matchMaker before first request arrives
  const gameServer = new ColyseusServer();
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
