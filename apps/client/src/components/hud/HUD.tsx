'use client';

import { useRoomStore } from '../../store/roomStore';

interface HUDProps {
  connected: boolean;
  draw: () => void;
  onShuffleClick: () => void;
  deal: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  audioEnabled: boolean;
}

export function HUD({ connected, draw, onShuffleClick, deal, isMuted, toggleMute, audioEnabled }: HUDProps) {
  const deckSize = useRoomStore((s) => s.deckSize);
  const players = useRoomStore((s) => s.players);
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const cards = useRoomStore((s) => s.cards);

  const handCount = Array.from(cards.values()).filter(
    (c) => c.ownerId === localPlayerId && (c.state === 'HAND' || c.state === 'SELECTED'),
  ).length;

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
              {p.id === localPlayerId ? ' (you)' : ''}
            </span>
            <span style={{ color: '#aaa', marginLeft: 8 }}>
              Hand: {p.handSize}
            </span>
          </div>
        ))}
      </div>

      {/* Keyboard hint */}
      <div style={styles.hint}>
        Orbit: drag · Zoom: scroll
      </div>
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
  stat: {
    color: '#ddd',
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
  playerEntry: {
    display: 'flex',
    alignItems: 'center',
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
