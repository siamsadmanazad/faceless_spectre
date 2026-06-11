'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getClientId } from '../lib/clientId';
import { getServerUrl } from '../lib/serverUrl';
import { palette, lobbyGradient, font } from '../theme/palette';
import { Icon } from '../components/ui/Icon';

// 3D hero background — client-only (WebGL doesn't SSR) and lazy so the form
// paints immediately over the warm gradient while the scene warms up.
const LobbyScene = dynamic(
  () => import('../components/lobby/LobbyScene').then((m) => m.LobbyScene),
  { ssr: false },
);

const NAME_KEY = 'fs_name';

interface RoomInfo {
  roomId: string;
  clients: number;
  maxClients: number;
  locked: boolean;
  mode?: string;
}

const PLAYER_COUNT_HINTS: Record<number, string> = {
  2: 'Head-to-Head',
  3: 'Three-player',
  4: 'Classic',
  5: 'Five-player',
  6: 'Party (max)',
};

export default function LobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [name, setName] = useState('Player');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  // Prefill the name from the last session (a convenience, not a profile).
  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  function rememberName() {
    localStorage.setItem(NAME_KEY, name);
  }

  async function fetchRooms() {
    try {
      const res = await fetch(`${getServerUrl()}/lobby`);
      if (res.ok) setRooms(await res.json());
    } catch {
      // server might not be up yet
    }
  }

  /** Hand the reservation to useColyseus so it skips a second round-trip and
   *  the empty-room dispose race, then navigate into the table. */
  function enterWithReservation(roomId: string, seatReservation: unknown) {
    sessionStorage.setItem(`fs_reservation_${roomId}`, JSON.stringify(seatReservation));
    router.push(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  }

  async function quickPlay() {
    setLoading('quick');
    setError('');
    rememberName();
    try {
      const res = await fetch(`${getServerUrl()}/rooms/quickplay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, clientId: getClientId() }),
      });
      if (!res.ok) throw new Error('Quick Play failed');
      const { roomId, seatReservation } = await res.json();
      enterWithReservation(roomId, seatReservation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setLoading('');
    }
  }

  async function createPrivate() {
    setLoading('create');
    setError('');
    rememberName();
    try {
      const res = await fetch(`${getServerUrl()}/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, maxPlayers, mode: 'private', clientId: getClientId() }),
      });
      if (!res.ok) throw new Error('Failed to create table');
      const { roomId, seatReservation } = await res.json();
      enterWithReservation(roomId, seatReservation);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setLoading('');
    }
  }

  function joinByCode(spectate = false) {
    const code = joinCode.trim();
    if (!code) return;
    rememberName();
    const watch = spectate ? '&spectate=1' : '';
    router.push(`/room/${code}?name=${encodeURIComponent(name)}${watch}`);
  }

  function joinRoom(roomId: string) {
    rememberName();
    router.push(`/room/${roomId}?name=${encodeURIComponent(name)}`);
  }

  return (
    <main style={styles.root}>
      <LobbyScene />
      <div style={styles.card}>
        <h1 style={styles.title}>
          <Icon name="ghost" size={28} style={{ color: palette.hearth }} /> Faceless Spectre
        </h1>
        <p style={styles.subtitle}>Server-authoritative 3D card sandbox</p>

        <div style={styles.field}>
          <label style={styles.label}>Your name</label>
          <input
            style={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={rememberName}
            placeholder="Player"
            maxLength={24}
          />
        </div>

        {/* Random play */}
        <button style={styles.primaryBtn} onClick={quickPlay} disabled={loading !== ''}>
          {loading === 'quick' ? (
            'Finding a game…'
          ) : (
            <span style={styles.btnInner}>
              <Icon name="zap" size={17} /> Quick Play
            </span>
          )}
        </button>
        <p style={styles.helpText}>Jump into a table with other players online now.</p>

        <div style={styles.divider}><span style={styles.dividerText}>or play with friends</span></div>

        {/* Private table */}
        <div style={styles.field}>
          <label style={styles.label}>Table size</label>
          <div style={styles.seatRow}>
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                style={{ ...styles.seatBtn, ...(maxPlayers === n ? styles.seatBtnActive : {}) }}
                onClick={() => setMaxPlayers(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p style={styles.seatHint}>{PLAYER_COUNT_HINTS[maxPlayers]}</p>
        </div>

        <button style={styles.secondaryBtn} onClick={createPrivate} disabled={loading !== ''}>
          {loading === 'create' ? 'Creating…' : '+ Create Private Table'}
        </button>
        <p style={styles.helpText}>You’ll get a code and link to share. Strangers can’t join unless you invite them.</p>

        {/* Join by code */}
        <div style={styles.field}>
          <label style={styles.label}>Have a code?</label>
          <div style={styles.codeRow}>
            <input
              style={{ ...styles.input, fontFamily: font.mono, letterSpacing: 1 }}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') joinByCode(); }}
              placeholder="Enter room code"
            />
            <button style={styles.joinBtn} onClick={() => joinByCode(false)} disabled={!joinCode.trim()}>
              Join
            </button>
            <button style={styles.joinBtn} onClick={() => joinByCode(true)} disabled={!joinCode.trim()} title="Watch without taking a seat">
              <span style={styles.btnInner}><Icon name="eye" size={14} /> Watch</span>
            </button>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {rooms.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>Open Public Tables</h2>
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
    background: lobbyGradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    padding: '24px 16px',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    background: 'rgba(26,20,16,0.55)',
    backdropFilter: 'blur(14px)',
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 16,
    padding: 'clamp(28px, 5vw, 40px) clamp(24px, 5vw, 48px)',
    width: 'min(400px, 92vw)',
    color: palette.textPrimary,
    boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
    boxSizing: 'border-box',
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 600,
    color: palette.textPrimary,
    fontFamily: font.display,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    letterSpacing: 0.2,
  },
  subtitle: { color: palette.textDim, marginTop: 6, marginBottom: 24, fontSize: 14 },
  btnInner: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, color: palette.textDim, marginBottom: 6 },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(247,239,225,0.18)',
    background: 'rgba(247,239,225,0.06)',
    color: palette.textPrimary,
    fontSize: 14,
    boxSizing: 'border-box',
  },
  primaryBtn: {
    width: '100%',
    padding: '14px',
    borderRadius: 8,
    border: 'none',
    background: palette.hearth,
    color: palette.bgDeep,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: 8,
    border: `1px solid ${palette.glassBorder}`,
    background: 'rgba(247,239,225,0.05)',
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  helpText: { fontSize: 12, color: palette.textFaint, margin: '8px 0 0' },
  divider: {
    display: 'flex',
    alignItems: 'center',
    textAlign: 'center',
    margin: '24px 0 16px',
    borderTop: '1px solid rgba(247,239,225,0.1)',
  },
  dividerText: {
    margin: '-10px auto 0',
    background: palette.bgDusk,
    padding: '0 12px',
    fontSize: 12,
    color: palette.textDim,
  },
  codeRow: { display: 'flex', gap: 8 },
  error: { color: palette.danger, fontSize: 13, marginTop: 12 },
  sectionTitle: { fontSize: 14, color: palette.textDim, marginTop: 28, marginBottom: 10 },
  roomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid rgba(247,239,225,0.08)',
  },
  roomId: { flex: 1, fontFamily: font.mono, fontSize: 13, color: palette.textDim },
  roomPlayers: { fontSize: 12, color: palette.textFaint },
  joinBtn: {
    padding: '10px 16px',
    borderRadius: 6,
    border: `1px solid ${palette.glassBorder}`,
    background: 'transparent',
    color: palette.textPrimary,
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  seatRow: { display: 'flex', gap: 8 },
  seatBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    border: '1px solid rgba(247,239,225,0.2)',
    background: 'rgba(247,239,225,0.05)',
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  seatBtnActive: { background: palette.hearth, border: `1px solid ${palette.hearthSoft}`, color: palette.bgDeep },
  seatHint: { margin: '6px 0 0', fontSize: 12, color: palette.textFaint },
};
