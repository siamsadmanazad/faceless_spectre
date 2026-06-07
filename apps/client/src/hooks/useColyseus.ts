'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Client, Room } from 'colyseus.js';
import { IntentType, ShuffleStyle, ShuffleIntensity } from '@phantom-table/shared';
import { useRoomStore, CardView, PlayerView } from '../store/roomStore';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:2567';

function schemaToCardView(card: Record<string, unknown>): CardView {
  return {
    id: String(card.id ?? ''),
    state: String(card.state ?? ''),
    visibility: String(card.visibility ?? ''),
    ownerId: String(card.ownerId ?? ''),
    position: Number(card.position ?? 0),
    zoneId: String(card.zoneId ?? ''),
    rank: card.rank ? String(card.rank) : undefined,
    suit: card.suit ? String(card.suit) : undefined,
  };
}

function schemaToPlayerView(player: Record<string, unknown>): PlayerView {
  return {
    id: String(player.id ?? ''),
    displayName: String(player.displayName ?? ''),
    seat: Number(player.seat ?? 0),
    maskId: String(player.maskId ?? 'faceless'),
    connected: Boolean(player.connected ?? true),
    handSize: Number(player.handSize ?? 0),
  };
}

export function useColyseus(roomId: string, displayName?: string) {
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    setRoomId,
    setLocalPlayerId,
    setDeckSize,
    setPhase,
    upsertCard,
    upsertPlayer,
    clearRoom,
  } = useRoomStore();

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        // Get seat reservation from our Fastify endpoint (bypasses Colyseus HTTP matchmaking)
        const res = await fetch(`${SERVER_URL}/rooms/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, displayName: displayName ?? 'Player' }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Server error' }));
          throw new Error((err as { error?: string }).error ?? 'Failed to join room');
        }

        const { seatReservation } = await res.json();
        if (cancelled) return;

        const client = new Client(SERVER_URL);
        const room = await client.consumeSeatReservation(seatReservation);
        if (cancelled) {
          room.leave();
          return;
        }

        roomRef.current = room;
        setRoomId(room.id);
        setLocalPlayerId(room.sessionId);
        setConnected(true);

        // Sync initial state
        syncFullState(room.state as Record<string, unknown>);

        // Listen for state patches
        room.onStateChange((state: unknown) => {
          syncFullState(state as Record<string, unknown>);
        });

        room.onLeave(() => {
          setConnected(false);
          clearRoom();
        });

        room.onError((code: number, message?: string) => {
          setError(`Room error ${code}: ${message ?? ''}`);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Connection failed');
        }
      }
    }

    function syncFullState(state: Record<string, unknown>) {
      if (typeof state.deckSize === 'number') setDeckSize(state.deckSize);
      if (typeof state.phase === 'string') setPhase(state.phase);

      const cards = state.cards as Map<string, Record<string, unknown>> | undefined;
      if (cards && typeof cards.forEach === 'function') {
        cards.forEach((card, id) => {
          upsertCard(schemaToCardView({ ...card, id }));
        });
      }

      const players = state.players as Map<string, Record<string, unknown>> | undefined;
      if (players && typeof players.forEach === 'function') {
        players.forEach((player, id) => {
          upsertPlayer(schemaToPlayerView({ ...player, id }));
        });
      }
    }

    connect();

    return () => {
      cancelled = true;
      roomRef.current?.leave();
      roomRef.current = null;
      clearRoom();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const sendIntent = useCallback((type: IntentType, payload?: Record<string, unknown>) => {
    roomRef.current?.send(type, payload);
  }, []);

  const draw = useCallback(() => sendIntent(IntentType.Draw), [sendIntent]);

  const shuffle = useCallback(
    () =>
      sendIntent(IntentType.Shuffle, {
        style: ShuffleStyle.Riffle,
        intensity: ShuffleIntensity.Medium,
      }),
    [sendIntent],
  );

  const deal = useCallback(
    (count = 5) => sendIntent(IntentType.Deal, { count, seats: [] }),
    [sendIntent],
  );

  return { connected, error, draw, shuffle, deal, sendIntent };
}
