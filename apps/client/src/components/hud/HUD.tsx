'use client';

import { useState } from 'react';
import { RoomMode } from '@faceless-spectre/shared';
import { useRoomStore } from '../../store/roomStore';
import { useEffect } from 'react';
import { palette, font } from '../../theme/palette';
import { Icon } from '../ui/Icon';
import { audio } from '../../lib/audio';

interface HUDProps {
  connected: boolean;
  draw: () => void;
  onShuffleClick: () => void;
  deal: () => void;
  isMuted: boolean;
  toggleMute: () => void;
  audioEnabled: boolean;
  setBackfill: (enabled: boolean) => void;
  backfillVote: (approve: boolean) => void;
  lockTable: () => void;
  kick: (targetId: string) => void;
  spectate: boolean;
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
  backfillVote,
  lockTable,
  kick,
  spectate,
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
  const spectatorCount = useRoomStore((s) => s.spectatorCount);
  const sfxEnabled = useRoomStore((s) => s.sfxEnabled);
  const setSfxEnabled = useRoomStore((s) => s.setSfxEnabled);

  // Keep the synth engine in sync with the toggle.
  useEffect(() => {
    audio.setEnabled(sfxEnabled);
  }, [sfxEnabled]);
  const voteActive = useRoomStore((s) => s.backfillVoteActive);
  const voteYes = useRoomStore((s) => s.backfillVoteYes);
  const voteNo = useRoomStore((s) => s.backfillVoteNo);

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
        {!spectate && <span style={styles.stat}>Hand: {handCount}</span>}
        <span style={styles.stat}>Players: {players.size}</span>
        {spectatorCount > 0 && (
          <span style={{ ...styles.stat, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="eye" size={12} /> {spectatorCount}
          </span>
        )}
      </div>

      {/* Room / invite panel */}
      <div style={styles.roomPanel}>
        <div style={styles.roomCodeRow}>
          <span style={styles.roomBadge}>
            <Icon name={isPrivate ? 'lock' : 'globe'} size={12} /> {isPrivate ? 'Private' : 'Public'}
          </span>
          {roomId && <span style={styles.roomCode}>{roomId}</span>}
          <button style={styles.copyBtn} onClick={copyInvite}>
            <span style={styles.iconLabel}>
              <Icon name={copied ? 'check' : 'copy'} size={12} /> {copied ? 'Copied' : 'Copy link'}
            </span>
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

        {/* Backfill vote — any seated player can open a poll to let randoms fill
            empty seats; a majority enables it. Hidden once randoms are allowed. */}
        {!spectate && isPrivate && !allowRandomFill && (
          <div style={styles.hostRow}>
            {voteActive ? (
              <>
                <span style={styles.voteLabel}>Open seats? {voteYes}✓ {voteNo}✗</span>
                <button style={styles.hostBtn} onClick={() => backfillVote(true)}>Yes</button>
                <button style={styles.hostBtn} onClick={() => backfillVote(false)}>No</button>
              </>
            ) : (
              !isHost && (
                <button
                  style={styles.hostBtn}
                  onClick={() => backfillVote(true)}
                  title="Start a vote to let random players fill empty seats"
                >
                  Vote: open seats
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Action buttons (players only) */}
      {spectate ? (
        <div style={styles.controls}>
          <span style={styles.spectatingBadge}>
            <span style={styles.iconLabel}><Icon name="eye" size={15} /> Spectating — you can watch but not act</span>
          </span>
        </div>
      ) : (
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
          <button
            style={styles.btn}
            onClick={() => setSfxEnabled(!sfxEnabled)}
            title={sfxEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          >
            <Icon name={sfxEnabled ? 'music' : 'music-off'} size={16} />
          </button>
        </div>
      )}

      {/* Player list */}
      <div style={styles.playerList}>
        {Array.from(players.values()).map((p) => (
          <div key={p.id} style={styles.playerEntry}>
            <span
              style={{
                color: p.id === localPlayerId ? palette.hearth : palette.textDim,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {p.displayName}
              {p.id === hostId && <Icon name="crown" size={12} style={{ color: palette.hearth }} />}
              {p.id === localPlayerId ? ' (you)' : ''}
            </span>
            <span style={{ color: palette.textFaint, marginLeft: 8 }}>Hand: {p.handSize}</span>
            {p.id !== localPlayerId && (
              <button
                style={styles.muteBtn}
                onClick={() => togglePeerMute(p.id)}
                title={mutedPeers.has(p.id) ? 'Unmute this player' : 'Mute this player'}
              >
                <Icon name={mutedPeers.has(p.id) ? 'volume-off' : 'volume'} size={13} />
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
    color: palette.textPrimary,
    fontFamily: font.mono,
    fontSize: 13,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    backdropFilter: 'blur(6px)',
    padding: '6px 14px',
    borderRadius: 8,
    pointerEvents: 'none',
    userSelect: 'none',
  },
  stat: { color: palette.textDim },
  iconLabel: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  roomPanel: {
    position: 'absolute',
    top: 52,
    left: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    backdropFilter: 'blur(6px)',
    padding: '8px 12px',
    borderRadius: 8,
    fontFamily: 'sans-serif',
  },
  roomCodeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  roomBadge: { fontSize: 12, color: palette.arcane, display: 'inline-flex', alignItems: 'center', gap: 4 },
  roomCode: { fontFamily: font.mono, fontSize: 13, color: palette.textPrimary, letterSpacing: 1 },
  copyBtn: {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${palette.glassBorder}`,
    background: 'rgba(247,239,225,0.08)',
    color: palette.textPrimary,
    cursor: 'pointer',
  },
  hostRow: { display: 'flex', alignItems: 'center', gap: 8 },
  hostBtn: {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 5,
    border: `1px solid ${palette.glassBorder}`,
    background: 'rgba(247,239,225,0.06)',
    color: palette.textPrimary,
    cursor: 'pointer',
  },
  hostBtnOn: { background: palette.hearth, border: `1px solid ${palette.hearthSoft}`, color: palette.bgDeep },
  voteLabel: { fontSize: 12, color: palette.arcane },
  hostTag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: palette.textFaint,
  },
  spectatingBadge: {
    padding: '10px 20px',
    fontSize: 14,
    fontFamily: 'sans-serif',
    background: palette.glass,
    color: palette.textDim,
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 8,
    backdropFilter: 'blur(6px)',
  } as React.CSSProperties,
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
    background: palette.glass,
    color: palette.textPrimary,
    border: `1px solid ${palette.glassBorder}`,
    borderRadius: 8,
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
    transition: 'background 0.15s',
  } as React.CSSProperties,
  playerList: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    backdropFilter: 'blur(6px)',
    padding: '8px 14px',
    borderRadius: 8,
    fontFamily: font.mono,
    fontSize: 12,
  },
  playerEntry: { display: 'flex', alignItems: 'center' },
  muteBtn: {
    marginLeft: 8,
    padding: '3px 6px',
    fontSize: 11,
    borderRadius: 4,
    border: `1px solid ${palette.glassBorder}`,
    background: 'rgba(247,239,225,0.06)',
    color: palette.textDim,
    cursor: 'pointer',
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
  },
  kickBtn: {
    marginLeft: 10,
    padding: '2px 8px',
    fontSize: 11,
    borderRadius: 4,
    border: `1px solid ${palette.danger}`,
    background: 'rgba(216,116,95,0.15)',
    color: palette.danger,
    cursor: 'pointer',
  },
  hint: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    color: palette.textFaint,
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
    color: palette.textFaint,
    userSelect: 'none',
  } as React.CSSProperties,
};
