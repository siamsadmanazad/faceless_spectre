'use client';

import { useMemo, useRef } from 'react';
import { Mesh, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import { getBackTexture, getFaceTexture } from './cardTextures';

const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.008;

interface CardMeshProps {
  rank?: string;
  suit?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  onClick?: () => void;
  highlighted?: boolean;
  isSelected?: boolean;
  faceUp?: boolean;
}

const SELECTED_EMISSIVE = new Color('#4488ff');
const NEUTRAL_EMISSIVE = new Color('#000000');

export function CardMesh({
  rank,
  suit,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onClick,
  highlighted = false,
  isSelected = false,
  faceUp = false,
}: CardMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const hasFace = !!(rank && suit);
  // Lerped position — driven by useFrame so the mesh follows position smoothly
  const lerpedPos = useRef<[number, number, number]>([...position]);

  // Shared, cached textures — never per-instance, never disposed here (owned by
  // the module-level cache and reused across every card for the whole session).
  const backTex = getBackTexture();
  const faceTex = hasFace ? getFaceTexture(rank!, suit!) : backTex;

  useFrame(() => {
    if (!meshRef.current) return;

    // Scale lerp for hover/selected highlight
    const targetScale = highlighted ? 1.08 : 1.0;
    meshRef.current.scale.setScalar(
      meshRef.current.scale.x + (targetScale - meshRef.current.scale.x) * 0.12,
    );

    // Position lerp for smooth card movement
    lerpedPos.current[0] += (position[0] - lerpedPos.current[0]) * 0.18;
    lerpedPos.current[1] += (position[1] - lerpedPos.current[1]) * 0.18;
    lerpedPos.current[2] += (position[2] - lerpedPos.current[2]) * 0.18;
    meshRef.current.position.set(lerpedPos.current[0], lerpedPos.current[1], lerpedPos.current[2]);

    // Emissive lerp for selection glow
    const mats = Array.isArray(meshRef.current.material)
      ? meshRef.current.material
      : [meshRef.current.material];
    const targetEmissive = isSelected ? SELECTED_EMISSIVE : NEUTRAL_EMISSIVE;
    const targetIntensity = isSelected ? 0.35 : 0.0;
    mats.forEach((m) => {
      if ('emissive' in m && 'emissiveIntensity' in m) {
        (m as { emissive: Color; emissiveIntensity: number }).emissive.lerp(targetEmissive, 0.15);
        const cur = (m as { emissiveIntensity: number }).emissiveIntensity;
        (m as { emissiveIntensity: number }).emissiveIntensity += (targetIntensity - cur) * 0.15;
      }
    });
  });

  // Faces: +X, -X, +Y, -Y, +Z (front/face), -Z (back)
  const materials = useMemo(() => {
    return [
      { color: '#eeeeee' as const }, // +X edge
      { color: '#eeeeee' as const }, // -X edge
      { color: '#eeeeee' as const }, // +Y top
      { color: '#eeeeee' as const }, // -Y bottom
      { map: faceUp && hasFace ? faceTex : backTex }, // +Z face
      { map: backTex }, // -Z back
    ];
  }, [faceUp, hasFace, faceTex, backTex]);

  return (
    <mesh
      ref={meshRef}
      rotation={rotation}
      scale={scale}
      onClick={onClick}
      onPointerEnter={() => { if (onClick) document.body.style.cursor = 'grab'; }}
      onPointerLeave={() => { document.body.style.cursor = 'auto'; }}
      castShadow
    >
      <boxGeometry args={[CARD_W, CARD_H, CARD_D]} />
      {materials.map((mat, i) =>
        'map' in mat ? (
          <meshStandardMaterial key={i} attach={`material-${i}`} map={mat.map} />
        ) : (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={mat.color} />
        ),
      )}
    </mesh>
  );
}
