'use client';

import { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { Group, MathUtils } from 'three';
import { Atmosphere } from '../scene/Atmosphere';
import { GhostHand } from '../scene/GhostHand';
import { CardMesh } from '../scene/CardMesh';
import { HandState } from '@faceless-spectre/shared';
import { palette } from '../../theme/palette';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

/** The hero motif: a floating masked ghost hand with a few drifting cards.
 *  Slowly auto-rotates and leans toward the cursor (idle parallax). */
function HeroMotif({ animate }: { animate: boolean }) {
  const groupRef = useRef<Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (animate) g.rotation.y += delta * 0.18; // slow turn
    // Lean toward the cursor — subtle parallax.
    const targetX = animate ? pointer.y * 0.12 : 0;
    const targetZ = animate ? -pointer.x * 0.1 : 0;
    g.rotation.x = MathUtils.lerp(g.rotation.x, targetX, 0.05);
    g.rotation.z = MathUtils.lerp(g.rotation.z, targetZ, 0.05);
  });

  return (
    <group ref={groupRef} position={[0, 0.3, 0]} scale={2.2}>
      <Float speed={animate ? 1.4 : 0} rotationIntensity={0.2} floatIntensity={0.5}>
        <GhostHand
          position={[0, 0, 0]}
          orientation={[0, 0, 0, 1]}
          handState={HandState.Idle}
          color={palette.hearth}
        />
      </Float>

      {/* A few card backs drifting around the hand. */}
      {[
        { p: [-1.15, -0.2, 0.3] as [number, number, number], r: [-0.4, 0.3, 0.5] as [number, number, number] },
        { p: [1.2, 0.1, -0.2] as [number, number, number], r: [0.3, -0.4, -0.6] as [number, number, number] },
        { p: [0.2, -0.9, 0.6] as [number, number, number], r: [-0.6, 0.1, 0.2] as [number, number, number] },
      ].map((c, i) => (
        <Float key={i} speed={animate ? 1.1 + i * 0.2 : 0} rotationIntensity={0.4} floatIntensity={0.8}>
          <CardMesh position={c.p} rotation={c.r} faceUp={false} scale={0.55} />
        </Float>
      ))}
    </group>
  );
}

/** Full-viewport 3D hero behind the lobby form. */
export function LobbyScene() {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <Canvas
      camera={{ position: [0, 0.5, 6], fov: 45, near: 0.1, far: 100 }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[palette.bgDeep]} />
      {/* Direct warm lights — no ground contact-shadow (the hero floats). */}
      <ambientLight intensity={0.4} color={palette.hearth} />
      <pointLight position={[2, 3, 4]} intensity={1.1} color={palette.hearthSoft} />
      <pointLight position={[-4, -1, -3]} intensity={0.5} color={palette.arcane} />
      <Atmosphere animate={!reducedMotion} />
      <HeroMotif animate={!reducedMotion} />
    </Canvas>
  );
}
