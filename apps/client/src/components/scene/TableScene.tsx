'use client';

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { ShuffleStyle, ShuffleIntensity } from '@faceless-spectre/shared';
import { Table } from './Table';
import { DeckStack } from './DeckStack';
import { PlayerHand } from './PlayerHand';
import { PlacedCards } from './PlacedCards';
import { GhostHands } from './GhostHands';
import { OpponentHands } from './OpponentHands';
import { LocalPresenceSender } from './LocalPresenceSender';
import { SafeEnvironment } from './SafeEnvironment';
import { useColyseus } from '../../hooks/useColyseus';
import { useVoice } from '../../hooks/useVoice';
import { usePageVisible } from '../../hooks/usePageVisible';
import { useRoomStore } from '../../store/roomStore';
import { HUD } from '../hud/HUD';
import { ShuffleSelector } from '../hud/ShuffleSelector';

interface TableSceneProps {
  roomId: string;
  displayName?: string;
  spectate?: boolean;
}

export function TableScene({ roomId, displayName, spectate = false }: TableSceneProps) {
  // Whether the game tab is the active foreground tab. While inactive the whole
  // game pauses — render loop, presence, and voice — so it consumes nothing.
  const visible = usePageVisible();

  const { connected, error, draw, shuffle, deal, grab, release, sendPresence, setBackfill, lockTable, kick, sendIntent, roomRef } = useColyseus(roomId, displayName, spectate);
  const { isMuted, toggleMute, audioEnabled } = useVoice({ roomRef, sendIntent, active: visible });
  const [shufflePanelOpen, setShufflePanelOpen] = useState(false);
  const selectedCardId = useRoomStore((s) => s.selectedCardId);
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const players = useRoomStore((s) => s.players);
  const maskId = (localPlayerId ? players.get(localPlayerId)?.maskId : undefined) ?? 'faceless';

  // Render continuously only while we have something live to show. When the
  // server is gone or the tab is hidden, freeze the loop ('never') so a stale
  // or backgrounded tab can't pin the GPU. Because per-frame presence and all
  // scene animation run inside R3F's useFrame, freezing the loop also stops
  // those — one switch pauses GPU, per-frame CPU, and presence traffic at once.
  // The loop resumes the instant the tab is active again and we're connected.
  const frameloop = connected && visible ? 'always' : 'never';

  // Tab-strip notification: while the game is paused, the browser tab title
  // reflects it (visible in the tab list while the player is on another tab).
  useEffect(() => {
    if (visible) return;
    const previousTitle = document.title;
    document.title = '⏸ Paused — Faceless Spectre';
    return () => {
      document.title = previousTitle;
    };
  }, [visible]);

  useEffect(() => {
    if (spectate) return; // spectators have no actions
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'd': draw(); break;
        case 'r': setShufflePanelOpen(true); break;
        case 'enter': deal(5); break;
        case 'escape':
          if (selectedCardId) release(selectedCardId);
          break;
        case 'm': toggleMute(); break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spectate, draw, deal, release, selectedCardId, toggleMute]);

  if (error) {
    return (
      <div style={styles.errorBanner}>
        Connection error: {error}
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <Canvas
        shadows
        frameloop={frameloop}
        camera={{ position: [0, 5, 7], fov: 50, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#1a1a2e']} />

        <ambientLight intensity={0.4} />
        <pointLight position={[0, 6, 0]} intensity={1.2} castShadow />
        <pointLight position={[-4, 3, 3]} intensity={0.3} color="#ffe0a0" />

        {/* Optional IBL — isolated so a slow/unreachable HDR CDN never blanks the table. */}
        <SafeEnvironment />

        <Suspense fallback={null}>
          <Table />
          <DeckStack />
          <PlacedCards grab={grab} selectedCardId={selectedCardId} />
          <PlayerHand grab={grab} release={release} selectedCardId={selectedCardId} />
          <GhostHands />
          <OpponentHands />
          {/* Spectators have no seat, hand, or ghost hand — they only observe. */}
          {!spectate && (
            <LocalPresenceSender
              sendPresence={sendPresence}
              maskId={maskId}
              selectedCardId={selectedCardId}
            />
          )}

          {/* Invisible table plane — clicking it releases the selected card */}
          {selectedCardId && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.005, 0]}
              onClick={() => release(selectedCardId)}
            >
              <planeGeometry args={[12, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={3}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2.2}
        />

        {process.env.NODE_ENV === 'development' && <Stats />}
      </Canvas>

      <HUD connected={connected} draw={draw} onShuffleClick={() => setShufflePanelOpen(true)} deal={() => deal(5)} isMuted={isMuted} toggleMute={toggleMute} audioEnabled={audioEnabled} setBackfill={setBackfill} lockTable={lockTable} kick={kick} spectate={spectate} />

      <ShuffleSelector
        open={shufflePanelOpen}
        onClose={() => setShufflePanelOpen(false)}
        onConfirm={(s: ShuffleStyle, i: ShuffleIntensity) => { shuffle(s, i); setShufflePanelOpen(false); }}
      />

      {visible && !connected && !error && (
        <div style={styles.connecting}>Connecting to table…</div>
      )}

      {!visible && (
        <div style={styles.paused}>
          <div style={styles.pausedIcon}>⏸</div>
          <div style={styles.pausedTitle}>Paused</div>
          <div style={styles.pausedSubtitle}>Tab inactive — switch back to resume</div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: '#1a1a2e',
  },
  connecting: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'sans-serif',
    background: 'rgba(0,0,0,0.6)',
    padding: '12px 24px',
    borderRadius: 8,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    background: '#1a1a2e',
    color: '#ff6b6b',
    fontFamily: 'sans-serif',
    fontSize: 16,
  },
  paused: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'rgba(10, 10, 20, 0.85)',
    color: '#ffffff',
    fontFamily: 'sans-serif',
    backdropFilter: 'blur(2px)',
  },
  pausedIcon: { fontSize: 48, lineHeight: 1 },
  pausedTitle: { fontSize: 24, fontWeight: 600 },
  pausedSubtitle: { fontSize: 14, opacity: 0.7 },
};

