'use client';

import { useRef, useMemo } from 'react';
import { Group, Quaternion, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { HandState } from '@faceless-spectre/shared';
import { getHandMatcap, getMaskMatcap } from '../../theme/matcaps';
import { palette } from '../../theme/palette';

interface GhostHandProps {
  position: [number, number, number];
  orientation: [number, number, number, number]; // quaternion [x, y, z, w]
  handState: HandState;
  color?: string;
}

// Opacity per hand state — the ghost firms up when active, fades when idle.
const STATE_OPACITY: Record<HandState, number> = {
  [HandState.Idle]: 0.72,
  [HandState.Hover]: 0.82,
  [HandState.Grab]: 0.96,
  [HandState.Thinking]: 0.85,
  [HandState.Reveal]: 1.0,
};

// Scale per hand state — grab closes slightly, reveal opens.
const STATE_SCALE: Record<HandState, number> = {
  [HandState.Idle]: 1.0,
  [HandState.Hover]: 1.05,
  [HandState.Grab]: 0.88,
  [HandState.Thinking]: 0.95,
  [HandState.Reveal]: 1.12,
};

export function GhostHand({
  position,
  orientation,
  handState,
  color = palette.hearth,
}: GhostHandProps) {
  const groupRef = useRef<Group>(null);
  const lerpedPos = useRef(new Vector3(...position));
  const lerpedQuat = useRef(new Quaternion(...orientation));
  const targetQuat = useMemo(() => new Quaternion(), []);

  // Shared, cached matcaps (one rim matcap per seat colour + one porcelain mask).
  const handMatcap = useMemo(() => getHandMatcap(color), [color]);
  const maskMatcap = useMemo(() => getMaskMatcap(), []);
  const opacity = STATE_OPACITY[handState] ?? 0.72;

  useFrame(() => {
    if (!groupRef.current) return;

    // Smooth position lerp
    lerpedPos.current.lerp(new Vector3(...position), 0.15);
    groupRef.current.position.copy(lerpedPos.current);

    // Smooth rotation slerp
    targetQuat.set(orientation[0], orientation[1], orientation[2], orientation[3]);
    lerpedQuat.current.slerp(targetQuat, 0.15);
    groupRef.current.quaternion.copy(lerpedQuat.current);

    // Smooth scale lerp toward state target
    const targetScale = STATE_SCALE[handState] ?? 1.0;
    const cur = groupRef.current.scale.x;
    groupRef.current.scale.setScalar(cur + (targetScale - cur) * 0.12);
  });

  return (
    <group ref={groupRef}>
      {/* Palm */}
      <mesh>
        <boxGeometry args={[0.3, 0.08, 0.22]} />
        <meshMatcapMaterial matcap={handMatcap} transparent opacity={opacity} />
      </mesh>

      {/* Finger stubs — 4 small boxes above the palm */}
      {[-0.1, -0.033, 0.033, 0.1].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.06, -0.1]}>
          <boxGeometry args={[0.055, 0.07, 0.09]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={opacity * 0.95} />
        </mesh>
      ))}

      {/* Thumb */}
      <mesh position={[0.17, 0.02, 0.02]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.055, 0.09, 0.06]} />
        <meshMatcapMaterial matcap={handMatcap} transparent opacity={opacity * 0.95} />
      </mesh>

      {/* Mask — floating porcelain torus above the hand */}
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.035, 10, 24]} />
        <meshMatcapMaterial matcap={maskMatcap} />
      </mesh>

      {/* Mask eye-slots — two dark notches */}
      {[-0.045, 0.045].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.38, 0.1]}>
          <boxGeometry args={[0.03, 0.02, 0.04]} />
          <meshBasicMaterial color={palette.bgDeep} />
        </mesh>
      ))}
    </group>
  );
}
