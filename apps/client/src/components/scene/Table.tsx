'use client';

import { useRef } from 'react';
import { Mesh } from 'three';

export function Table() {
  const ref = useRef<Mesh>(null);

  return (
    <group>
      {/* Felt surface */}
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 5]} />
        <meshStandardMaterial color="#2d5a27" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Table edge / rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[3.9, 4.5, 64]} />
        <meshStandardMaterial color="#5c3d1e" roughness={0.7} />
      </mesh>

      {/* Shadow catcher under table */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <shadowMaterial opacity={0.3} />
      </mesh>
    </group>
  );
}
