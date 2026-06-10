'use client';

import { useState } from 'react';
import { RoomMode } from '@faceless-spectre/shared';
import { useRoomStore } from '../../store/roomStore';

interface HUDProps {
  connected: boolean;
  draw: () => void;
  onShuffleClick: () => void;
  deal: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  audioEnabled: boolean;
  setBackfill: (enabled: boolean) => void;
  lockTable: () => void;
  kick: (targetId: string) => void;
}

export function HUD({
  connected,
  draw,
  onShuffleClick,
  deal,
  isMuted,
  toggleMute,
  audioEnabled,
  setBackfill,
  lockTable,
  kick,
}: HUDProps) {
  const deckSize = useRoomStore((s) => s.deckSize);
  const players = useRoomStore((s) => s.players);
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const cards = useRoomStore((s) => s.cards);
  const roomId = useRoomStore((s) => s.roomId);
  const hostId = useRoomStore((s) => s.hostId);
  const mode = useRoomStore((s) => s.mode);
  const allowRandomFill = useRoomStore((s) => s.allowRandomFill);
  const locked = useRoomStore((s) => s.locked);
  const mutedPeers = useRoomStore((s) => s.mutedPeers);
  const togglePeerMute = useRoomStore((s) => s.togglePeerMute);

  const isHost = !!localPlayerId && localPlayerId === hostId;
  const isPrivate = mode === RoomMode.Private;
  const [copied, setCopied] = useState(false);

  const handCount = Array.from(cards.values()).filter(
    (c) => c.ownerId === localPlayerId && (c.state === 'HAND' || c.state === 'SELECTED'),
  ).length;

  function copyInvite() {
    if (!roomId) return;
    const link = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard?.writeText(link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }

  return (
    <>
      {/* Status bar */}
      <div style={styles.statusBar}>
        <span style={{ color: connected ? '#4caf50' : '#ff9800' }}>
          {connected ? '● Connected' : '◌ Connecting…'}
        </span>
        <span style={styles.stat}>Deck: {deckSize}</span>
        <span style={styles.stat}>Hand: {handCount}</span>
        <span style={styles.stat}>Players: {players.size}</span>
      </div>

      {/* Room / invite panel */}
      <div style={styles.roomPanel}>
        <div style={styles.roomCodeRow}>
          <span style={styles.roomBadge}>{isPrivate ? '🔒 Private' : '🌐 Public'}</span>
          {roomId && <span style={styles.roomCode}>{roomId}</span>}
          <button style={styles.copyBtn} onClick={copyInvite}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>

        {isHost && (
          <div style={styles.hostRow}>
            {isPrivate && (
              <button
                style={{ ...styles.hostBtn, ...(allowRandomFill ? styles.hostBtnOn : {}) }}
                onClick={() => setBackfill(!allowRandomFill)}
                disabled={locked}
                title="Let random players fill empty seats"
              >
                Randoms: {allowRandomFill ? 'On' : 'Off'}
              </button>
            )}
            <button style={styles.hostBtn} onClick={lockTable} disabled={locked}>
              {locked ? 'Locked' : 'Lock table'}
            </button>
            <span style={styles.hostTag}>host</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={styles.controls}>
        <button style={styles.btn} onClick={draw} title="[D]">
          Draw <kbd>D</kbd>
        </button>
        <button style={styles.btn} onClick={onShuffleClick} title="[R]">
          Shuffle <kbd>R</kbd>
        </button>
        <button style={styles.btn} onClick={deal} title="[Enter]">
          Deal 5 <kbd>↵</kbd>
        </button>
        {audioEnabled ? (
          <button style={styles.btn} onClick={toggleMute} title="[M]">
            {isMuted ? 'Unmute' : 'Mute'} <kbd>M</kbd>
          </button>
        ) : (
          <span style={styles.noMic}>Mic unavailable</span>
        )}
      </div>

      {/* Player list */}
      <div style={styles.playerList}>
        {Array.from(players.values()).map((p) => (
          <div key={p.id} style={styles.playerEntry}>
            <span style={{ color: p.id === localPlayerId ? '#ffd700' : '#ccc' }}>
              {p.displayName}
              {p.id === hostId ? ' 👑' : ''}
              {p.id === localPlayerId ? ' (you)' : ''}
            </span>
            <span style={{ color: '#aaa', marginLeft: 8 }}>Hand: {p.handSize}</span>
            {p.id !== localPlayerId && (
              <button
                style={styles.muteBtn}
                onClick={() => togglePeerMute(p.id)}
                title={mutedPeers.has(p.id) ? 'Unmute this player' : 'Mute this player'}
              >
                {mutedPeers.has(p.id) ? '🔇' : '🔊'}
              </button>
            )}
            {isHost && p.id !== localPlayerId && (
              <button style={styles.kickBtn} onClick={() => kick(p.id)} title="Remove player">
                Kick
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Keyboard hint */}
      <div style={styles.hint}>Orbit: drag · Zoom: scroll</div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statusBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    display: 'flex',
    gap: 16,
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 13,
    background: 'rgba(0,0,0,0.55)',
    padding: '6px 14px',
    borderRadius: 6,
    pointerEvents: 'none',
    userSelect: 'none',
  },
  stat: { color: '#ddd' },
  roomPanel: {
    position: 'absolute',
    top: 48,
    left: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'rgba(0,0,0,0.55)',
    padding: '8px 12px',
    borderRadius: 6,
    fontFamily: 'sans-serif',
  },
  roomCodeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  roomBadge: { fontSize: 12, color: '#cbd5ff' },
  roomCode: { fontFamily: 'monospace', fontSize: 13, color: '#fff', letterSpacing: 1 },
  copyBtn: {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    cursor: 'pointer',
  },
  hostRow: { display: 'flex', alignItems: 'center', gap: 8 },
  hostBtn: {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    cursor: 'pointer',
  },
  hostBtnOn: { background: '#3a7d44', border: '1px solid #4caf50' },
  hostTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)',
  },
  controls: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: 12,
  },
  btn: {
    padding: '10px 20px',
    fontSize: 14,
    fontFamily: 'sans-serif',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 8,
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    transition: 'background 0.15s',
  } as React.CSSProperties,
  playerList: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'rgba(0,0,0,0.55)',
    padding: '8px 14px',
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  playerEntry: { display: 'flex', alignItems: 'center' },
  muteBtn: {
    marginLeft: 8,
    padding: '2px 6px',
    fontSize: 11,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.08)',
    cursor: 'pointer',
    lineHeight: 1,
  },
  kickBtn: {
    marginLeft: 10,
    padding: '2px 8px',
    fontSize: 11,
    borderRadius: 4,
    border: '1px solid rgba(255,80,80,0.5)',
    background: 'rgba(255,80,80,0.15)',
    color: '#ff9a9a',
    cursor: 'pointer',
  },
  hint: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontFamily: 'sans-serif',
    userSelect: 'none',
    pointerEvents: 'none',
  },
  noMic: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    fontSize: 13,
    fontFamily: 'sans-serif',
    color: 'rgba(255,255,255,0.35)',
    userSelect: 'none',
  } as React.CSSProperties,
};
