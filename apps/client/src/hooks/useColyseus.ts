'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Client, Room } from 'colyseus.js';
import {
  IntentType,
  ServerMessageType,
  ShuffleStyle,
  ShuffleIntensity,
  PRESENCE_THROTTLE_MS,
  type AnimationCommand,
  type HandPresence,
  type PresenceMessage,
} from '@faceless-spectre/shared';
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
  const lastPresenceAt = useRef(0);

  const {
    setRoomId,
    setLocalPlayerId,
    setDeckSize,
    setMaxPlayers,
    setPhase,
    upsertCard,
    upsertPlayer,
    setSelectedCard,
    clearRoom,
  } = useRoomStore();

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const client = new Client(SERVER_URL);
        // eslint-disable-next-line prefer-const
        let room!: Room;
        let joined = false;

        // 1. Consume a seat reservation left by the lobby (freshly created room).
        //    This avoids a second HTTP round-trip and the race where Colyseus
        //    auto-disposes an empty room before we call joinById.
        const reservationKey = `fs_reservation_${roomId}`;
        const pendingJson = sessionStorage.getItem(reservationKey);
        if (pendingJson) {
          sessionStorage.removeItem(reservationKey);
          try {
            room = await client.consumeSeatReservation(JSON.parse(pendingJson));
            joined = true;
          } catch {
            // reservation expired — fall through to fresh join below
          }
        }

        // 2. Reconnect using a saved token, but only for the exact same room.
        //    Ignoring a token for a different room prevents connecting to a
        //    stale session and leaving the intended room orphaned.
        if (!joined) {
          const saved = localStorage.getItem('fs_session');
          if (saved) {
            try {
              const { roomId: savedRoomId, reconnectionToken } = JSON.parse(saved) as {
                roomId: string;
                reconnectionToken: string;
              };
              if (savedRoomId === roomId) {
                room = await client.reconnect(reconnectionToken);
                joined = true;
              } else {
                localStorage.removeItem('fs_session');
              }
            } catch {
              localStorage.removeItem('fs_session');
            }
          }
        }

        // 3. Fresh join as final fallback (joining an existing room from the lobby list).
        if (!joined) {
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

          room = await client.consumeSeatReservation(seatReservation);
        }

        if (cancelled) {
          room.leave();
          return;
        }

        // Persist reconnection token with its roomId so future reconnect attempts
        // can verify they're targeting the right room.
        localStorage.setItem('fs_session', JSON.stringify({ roomId: room.id, reconnectionToken: room.reconnectionToken }));

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

        // Receive animation commands and store them for scene components to consume
        room.onMessage(ServerMessageType.AnimationCommand, (msg: AnimationCommand) => {
          useRoomStore.getState().handleAnimationCommand(msg);
        });

        // Receive presence updates — update ghost hand positions in store
        room.onMessage(ServerMessageType.Presence, (msg: PresenceMessage) => {
          const store = useRoomStore.getState();
          msg.presences.forEach((p) => {
            if ((p as { hand: unknown }).hand === null) store.removePresence(p.playerId);
            else store.upsertPresence(p);
          });
        });

        room.onLeave(() => {
          localStorage.removeItem('fs_session');
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
      if (typeof state.maxPlayers === 'number') setMaxPlayers(state.maxPlayers);
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
    (style: ShuffleStyle = ShuffleStyle.Riffle, intensity: ShuffleIntensity = ShuffleIntensity.Medium) =>
      sendIntent(IntentType.Shuffle, { style, intensity }),
    [sendIntent],
  );

  const deal = useCallback(
    (count = 5) => sendIntent(IntentType.Deal, { count, seats: [] }),
    [sendIntent],
  );

  const grab = useCallback(
    (cardId: string) => {
      sendIntent(IntentType.Grab, { cardId });
      setSelectedCard(cardId);
    },
    [sendIntent, setSelectedCard],
  );

  const release = useCallback(
    (cardId: string) => {
      sendIntent(IntentType.Release, { cardId });
      setSelectedCard(null);
    },
    [sendIntent, setSelectedCard],
  );

  const sendPresence = useCallback(
    (hand: HandPresence, maskId: string) => {
      const now = Date.now();
      if (now - lastPresenceAt.current < PRESENCE_THROTTLE_MS) return;
      lastPresenceAt.current = now;
      sendIntent(IntentType.Presence, { hand, maskId });
    },
    [sendIntent],
  );

  return { connected, error, draw, shuffle, deal, grab, release, sendPresence, sendIntent, roomRef };
}
