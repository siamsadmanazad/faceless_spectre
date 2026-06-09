'use client';

import { useRef, useMemo } from 'react';
import { Group, Quaternion, Vector3 } from 'three';
import { useFrame } from '@react-three/fiber';
import { HandState } from '@faceless-spectre/shared';

interface GhostHandProps {
  position: [number, number, number];
  orientation: [number, number, number, number]; // quaternion [x, y, z, w]
  handState: HandState;
  color?: string;
}

// Emissive intensity per hand state — conveys activity without animation complexity
const STATE_INTENSITY: Record<HandState, number> = {
  [HandState.Idle]: 0.15,
  [HandState.Hover]: 0.3,
  [HandState.Grab]: 0.6,
  [HandState.Thinking]: 0.4,
  [HandState.Reveal]: 0.8,
};

// Scale per hand state — grab closes slightly, reveal opens
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
  color = '#4488ff',
}: GhostHandProps) {
  const groupRef = useRef<Group>(null);
  const lerpedPos = useRef(new Vector3(...position));
  const lerpedQuat = useRef(new Quaternion(...orientation));
  const targetQuat = useMemo(() => new Quaternion(), []);

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
    const next = cur + (targetScale - cur) * 0.12;
    groupRef.current.scale.setScalar(next);
  });

  const targetIntensity = STATE_INTENSITY[handState] ?? 0.15;

  return (
    <group ref={groupRef}>
      {/* Palm */}
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.08, 0.22]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={targetIntensity}
          transparent
          opacity={0.75}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>

      {/* Finger stubs — 4 small boxes above the palm */}
      {[-0.1, -0.033, 0.033, 0.1].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.06, -0.1]} castShadow>
          <boxGeometry args={[0.055, 0.07, 0.09]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={targetIntensity * 0.8}
            transparent
            opacity={0.7}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Thumb */}
      <mesh position={[0.17, 0.02, 0.02]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.055, 0.09, 0.06]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={targetIntensity * 0.8}
          transparent
          opacity={0.7}
          roughness={0.4}
        />
      </mesh>

      {/* Mask — floating torus above the hand */}
      <mesh position={[0, 0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.035, 8, 20]} />
        <meshStandardMaterial
          color="#e8e8e8"
          emissive={color}
          emissiveIntensity={0.25}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* Mask eye-slots — two small boxes cut into the mask face */}
      {[-0.045, 0.045].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.38, 0.1]}>
          <boxGeometry args={[0.03, 0.02, 0.04]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
      ))}
    </group>
  );
}
