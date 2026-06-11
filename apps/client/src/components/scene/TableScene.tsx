'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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
import { SceneLighting } from './SceneLighting';
import { Atmosphere } from './Atmosphere';
import { CameraHome, type OrbitControlsLike } from './CameraHome';
import { JoinIntro } from './JoinIntro';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { palette, font } from '../../theme/palette';
import { Icon } from '../ui/Icon';
import { isWebGLAvailable } from '../../lib/webgl';
import { useColyseus } from '../../hooks/useColyseus';
import { useVoice } from '../../hooks/useVoice';
import { usePageVisible } from '../../hooks/usePageVisible';
import { useRoomStore } from '../../store/roomStore';
import { HUD } from '../hud/HUD';
import { ChatPanel } from '../hud/ChatPanel';
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
  const reducedMotion = usePrefersReducedMotion();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  // Join cinematic: a camera descent into the seated view, with a dark veil that
  // masks the connection. Skippable; disabled for reduced motion.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    if (reducedMotion) setIntro(false);
  }, [reducedMotion]);
  useEffect(() => {
    if (!intro) return;
    const skip = () => setIntro(false);
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [intro]);

  const { connected, error, draw, shuffle, deal, grab, release, sendChat, sendPresence, setBackfill, backfillVote, lockTable, kick, sendIntent, roomRef } = useColyseus(roomId, displayName, spectate);
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
    if (spectate || intro) return; // spectators/intro have no game actions
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
  }, [spectate, intro, draw, deal, release, selectedCardId, toggleMute]);

  if (error) {
    return (
      <div style={styles.errorBanner}>
        Connection error: {error}
      </div>
    );
  }

  // 3D requires WebGL — fail gracefully (and on theme) rather than crash.
  if (typeof window !== 'undefined' && !isWebGLAvailable()) {
    return (
      <div style={styles.errorBanner}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
          <Icon name="ghost" size={40} style={{ color: palette.hearth }} />
          <div style={{ fontFamily: font.display, fontSize: 22, marginTop: 12 }}>
            This table needs WebGL
          </div>
          <div style={{ color: palette.textDim, fontSize: 14, marginTop: 8 }}>
            Your browser or device has 3D graphics disabled. Enable WebGL or try a
            different browser to take your seat.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <Canvas
        shadows
        frameloop={frameloop}
        dpr={[1, 2]}
        camera={{ position: [0, 5, 7], fov: 50, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[palette.bgDeep]} />

        {/* Warm hearth light rig + warm atmosphere (gradient backdrop, glow, motes). */}
        <SceneLighting />
        <Atmosphere animate={!reducedMotion} />

        {/* Procedural warm IBL — isolated so it can never blank the table. */}
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

        {/* The intro owns the camera; OrbitControls is disabled until it lands. */}
        {intro && <JoinIntro onDone={() => setIntro(false)} />}

        <OrbitControls
          ref={controlsRef}
          enabled={!intro}
          enablePan={false}
          minDistance={3}
          maxDistance={12}
          maxPolarAngle={Math.PI / 2.2}
        />
        {/* Free orbit, then smoothly glide back to the seated home view.
            OrbitControls is a superset of OrbitControlsLike — narrow the ref. */}
        <CameraHome
          controlsRef={controlsRef as React.RefObject<OrbitControlsLike | null>}
          animate={!reducedMotion && !intro}
        />

        {process.env.NODE_ENV === 'development' && <Stats />}
      </Canvas>

      <HUD connected={connected} draw={draw} onShuffleClick={() => setShufflePanelOpen(true)} deal={() => deal(5)} isMuted={isMuted} toggleMute={toggleMute} audioEnabled={audioEnabled} setBackfill={setBackfill} backfillVote={backfillVote} lockTable={lockTable} kick={kick} spectate={spectate} />

      {/* In-room chat — players and spectators alike. Voice is on Discord. */}
      {connected && <ChatPanel sendChat={sendChat} />}

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
          <Icon name="pause" size={44} style={{ color: palette.hearth }} />
          <div style={styles.pausedTitle}>Paused</div>
          <div style={styles.pausedSubtitle}>Tab inactive — switch back to resume</div>
        </div>
      )}

      {/* Join cinematic — warm veil masks the connection; title resolves over the
          camera descent. Both fade out as the table is revealed / the intro ends. */}
      <div
        style={{
          ...styles.introVeil,
          opacity: intro && !connected ? 1 : 0,
          pointerEvents: intro && !connected ? 'auto' : 'none',
        }}
      />
      <div style={{ ...styles.introTitleWrap, opacity: intro ? 1 : 0, pointerEvents: 'none' }}>
        <Icon name="ghost" size={40} style={{ color: palette.hearth }} />
        <div style={styles.introTitle}>Faceless Spectre</div>
        <div style={styles.introSub}>
          {connected ? (spectate ? 'Taking your seat in the gallery…' : 'Taking your seat…') : 'Entering the table…'}
        </div>
        <div style={styles.introHint}>click or press any key to skip</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: palette.bgDeep,
  },
  connecting: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: palette.textPrimary,
    fontSize: 18,
    fontFamily: 'sans-serif',
    background: palette.glass,
    border: `1px solid ${palette.glassBorder}`,
    backdropFilter: 'blur(6px)',
    padding: '12px 24px',
    borderRadius: 8,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    background: palette.bgDeep,
    color: palette.danger,
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
    background: 'rgba(26, 20, 16, 0.82)',
    color: palette.textPrimary,
    fontFamily: 'sans-serif',
    backdropFilter: 'blur(2px)',
  },
  pausedTitle: { fontSize: 24, fontWeight: 600, fontFamily: font.display, marginTop: 8 },
  pausedSubtitle: { fontSize: 14, opacity: 0.7 },
  introVeil: {
    position: 'absolute',
    inset: 0,
    background: `radial-gradient(circle at 50% 42%, ${palette.bgDusk}, ${palette.bgDeep} 70%)`,
    transition: 'opacity 900ms ease',
    zIndex: 20,
  },
  introTitleWrap: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    color: palette.textPrimary,
    transition: 'opacity 800ms ease',
    zIndex: 21,
    textShadow: '0 2px 24px rgba(0,0,0,0.6)',
  },
  introTitle: {
    fontFamily: font.display,
    fontSize: 'clamp(34px, 6vw, 56px)',
    fontWeight: 600,
    letterSpacing: 1,
  },
  introSub: { fontSize: 14, color: palette.textDim, fontFamily: font.ui },
  introHint: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: palette.textFaint,
    fontFamily: font.ui,
    letterSpacing: 0.5,
  },
};

