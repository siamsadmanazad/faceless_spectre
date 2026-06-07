'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:2567';

interface RoomInfo {
  roomId: string;
  clients: number;
  maxClients: number;
  locked: boolean;
}

export default function LobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [name, setName] = useState('Player');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  async function fetchRooms() {
    try {
      const res = await fetch(`${SERVER}/lobby`);
      if (res.ok) setRooms(await res.json());
    } catch {
      // server might not be up yet
    }
  }

  async function createRoom() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER}/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      if (!res.ok) throw new Error('Failed to create room');
      const { roomId } = await res.json();
      router.push(`/room/${roomId}?name=${encodeURIComponent(name)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom(roomId: string) {
    router.push(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  }

  return (
    <main style={styles.root}>
      <div style={styles.card}>
        <h1 style={styles.title}>👻 Phantom Table</h1>
        <p style={styles.subtitle}>Server-authoritative 3D card sandbox</p>

        <div style={styles.field}>
          <label style={styles.label}>Your name</label>
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player"
            maxLength={24}
          />
        </div>

        <button style={styles.primaryBtn} onClick={createRoom} disabled={loading}>
          {loading ? 'Creating…' : '+ New Table'}
        </button>

        {error && <p style={styles.error}>{error}</p>}

        {rooms.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>Open Tables</h2>
            {rooms.map((room) => (
              <div key={room.roomId} style={styles.roomRow}>
                <span style={styles.roomId}>{room.roomId.slice(0, 8)}…</span>
                <span style={styles.roomPlayers}>
                  {room.clients}/{room.maxClients} players
                </span>
                <button
                  style={styles.joinBtn}
                  onClick={() => joinRoom(room.roomId)}
                  disabled={room.locked}
                >
                  {room.locked ? 'Full' : 'Join'}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
  },
  card: {
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: '40px 48px',
    width: 400,
    color: '#fff',
  },
  title: { margin: 0, fontSize: 28, fontWeight: 700 },
  subtitle: { color: 'rgba(255,255,255,0.5)', marginTop: 6, marginBottom: 28 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 14,
    boxSizing: 'border-box',
  },
  primaryBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: 8,
    border: 'none',
    background: '#4f46e5',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
  error: { color: '#ff6b6b', fontSize: 13, marginTop: 8 },
  sectionTitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 28, marginBottom: 10 },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  roomId: { flex: 1, fontFamily: 'monospace', fontSize: 13, color: '#ccc' },
  roomPlayers: { fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  joinBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
};
