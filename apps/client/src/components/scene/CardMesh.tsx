'use client';

import { useMemo, useRef } from 'react';
import { Mesh, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import { getBackTexture, getFaceTexture } from './cardTextures';
import { palette } from '../../theme/palette';

const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.008;
const CARD_EDGE = palette.paperEdge;

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

const SELECTED_EMISSIVE = new Color(palette.arcane);
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
  // Tracked emissive intensity, mirrored here so the rest state can be detected
  // without reading back off the materials each frame.
  const emissive = useRef(0);

  // Shared, cached textures — never per-instance, never disposed here (owned by
  // the module-level cache and reused across every card for the whole session).
  const backTex = getBackTexture();
  const faceTex = hasFace ? getFaceTexture(rank!, suit!) : backTex;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const lp = lerpedPos.current;
    const targetScale = highlighted ? 1.08 : 1.0;
    const targetIntensity = isSelected ? 0.35 : 0.0;

    const dx = position[0] - lp[0];
    const dy = position[1] - lp[1];
    const dz = position[2] - lp[2];
    const dScale = targetScale - mesh.scale.x;
    const dEmissive = targetIntensity - emissive.current;

    // At-rest fast path: a settled card does nothing per frame. With dozens of
    // mostly-stationary cards this skips the bulk of the per-frame work (the
    // material-array walk and Object3D writes) for everything not in motion.
    if (
      dx * dx + dy * dy + dz * dz < 1e-8 &&
      Math.abs(dScale) < 1e-3 &&
      Math.abs(dEmissive) < 1e-3
    ) {
      return;
    }

    // Scale lerp for hover/selected highlight
    mesh.scale.setScalar(mesh.scale.x + dScale * 0.12);

    // Position lerp for smooth card movement
    lp[0] += dx * 0.18;
    lp[1] += dy * 0.18;
    lp[2] += dz * 0.18;
    mesh.position.set(lp[0], lp[1], lp[2]);

    // Emissive lerp for selection glow
    emissive.current += dEmissive * 0.15;
    const targetEmissive = isSelected ? SELECTED_EMISSIVE : NEUTRAL_EMISSIVE;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if ('emissive' in m && 'emissiveIntensity' in m) {
        (m as { emissive: Color; emissiveIntensity: number }).emissive.lerp(targetEmissive, 0.15);
        (m as { emissiveIntensity: number }).emissiveIntensity = emissive.current;
      }
    });
  });

  // Faces: +X, -X, +Y, -Y, +Z (front/face), -Z (back)
  const materials = useMemo(() => {
    return [
      { color: CARD_EDGE }, // +X edge
      { color: CARD_EDGE }, // -X edge
      { color: CARD_EDGE }, // +Y top
      { color: CARD_EDGE }, // -Y bottom
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
