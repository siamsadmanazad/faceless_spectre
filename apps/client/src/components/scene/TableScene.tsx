'use client';

import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Stats } from '@react-three/drei';
import { Table } from './Table';
import { DeckStack } from './DeckStack';
import { PlayerHand } from './PlayerHand';
import { PlacedCards } from './PlacedCards';
import { GhostHands } from './GhostHands';
import { LocalPresenceSender } from './LocalPresenceSender';
import { useColyseus } from '../../hooks/useColyseus';
import { useRoomStore } from '../../store/roomStore';
import { HUD } from '../hud/HUD';

interface TableSceneProps {
  roomId: string;
  displayName?: string;
}

export function TableScene({ roomId, displayName }: TableSceneProps) {
  const { connected, error, draw, shuffle, deal, grab, release, sendPresence } = useColyseus(roomId, displayName);
  const selectedCardId = useRoomStore((s) => s.selectedCardId);
  const localPlayerId = useRoomStore((s) => s.localPlayerId);
  const players = useRoomStore((s) => s.players);
  const maskId = (localPlayerId ? players.get(localPlayerId)?.maskId : undefined) ?? 'faceless';

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'd': draw(); break;
        case 'r': shuffle(); break;
        case 'enter': deal(5); break;
        case 'escape':
          if (selectedCardId) release(selectedCardId);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draw, shuffle, deal, release, selectedCardId]);

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
        camera={{ position: [0, 5, 7], fov: 50, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#1a1a2e']} />

        <ambientLight intensity={0.4} />
        <pointLight position={[0, 6, 0]} intensity={1.2} castShadow />
        <pointLight position={[-4, 3, 3]} intensity={0.3} color="#ffe0a0" />

        <Suspense fallback={null}>
          <Environment preset="apartment" />
          <Table />
          <DeckStack />
          <PlacedCards grab={grab} selectedCardId={selectedCardId} />
          <PlayerHand grab={grab} release={release} selectedCardId={selectedCardId} />
          <GhostHands />
          <LocalPresenceSender
            sendPresence={sendPresence}
            maskId={maskId}
            selectedCardId={selectedCardId}
          />

          {/* Invisible table plane — clicking it releases the selected card */}
          {selectedCardId && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.005, 0]}
              onClick={() => release(selectedCardId)}
            >
              <planeGeometry args={[8, 5]} />
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

      <HUD connected={connected} draw={draw} shuffle={shuffle} deal={() => deal(5)} />

      {!connected && !error && (
        <div style={styles.connecting}>Connecting to table…</div>
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
};
