'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Mesh, Color } from 'three';
import { useFrame } from '@react-three/fiber';
import { getBackTexture, getFaceTexture } from './cardTextures';
import { palette } from '../../theme/palette';
import { Halo } from './Halo';

const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.008;
const CARD_EDGE = palette.paperEdge;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

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
  // Flip flourish progress: 1 = settled, <1 = mid reveal/deal-in flip.
  const flipT = useRef(1);

  // Trigger a flip flourish whenever the card turns face-up (reveal, or dealt
  // into your own hand on first appearance).
  useEffect(() => {
    if (faceUp) flipT.current = 0;
  }, [faceUp]);

  // Shared, cached textures — never per-instance, never disposed here (owned by
  // the module-level cache and reused across every card for the whole session).
  const backTex = getBackTexture();
  const faceTex = hasFace ? getFaceTexture(rank!, suit!) : backTex;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const lp = lerpedPos.current;
    const flipping = flipT.current < 1;
    // A flourish "pop" makes the card swell slightly as it flips/reveals.
    const flipPop = flipping ? Math.sin(easeOutCubic(flipT.current) * Math.PI) * 0.07 : 0;
    const targetScale = (highlighted ? 1.08 : 1.0) + flipPop;
    const targetIntensity = isSelected ? 0.35 : 0.0;

    const dx = position[0] - lp[0];
    const dy = position[1] - lp[1];
    const dz = position[2] - lp[2];
    const dScale = targetScale - mesh.scale.x;
    const dEmissive = targetIntensity - emissive.current;

    // At-rest fast path: a settled card does nothing per frame. With dozens of
    // mostly-stationary cards this skips the bulk of the per-frame work for
    // everything not in motion. A flip in progress keeps it animating.
    if (
      !flipping &&
      dx * dx + dy * dy + dz * dz < 1e-8 &&
      Math.abs(dScale) < 1e-3 &&
      Math.abs(dEmissive) < 1e-3
    ) {
      return;
    }

    // Scale lerp for hover/selected highlight (+ flip pop)
    mesh.scale.setScalar(mesh.scale.x + dScale * 0.16);

    // Position lerp + travel arc: the card lifts off the felt while it has
    // distance to cover (draw/deal), settling flat as it arrives.
    lp[0] += dx * 0.2;
    lp[1] += dy * 0.2;
    lp[2] += dz * 0.2;
    const arc = Math.min(Math.hypot(dx, dz), 1.6) * 0.45;
    mesh.position.set(lp[0], lp[1] + arc, lp[2]);

    // Reveal/deal-in flip: a half-turn that eases into the resting rotation.
    if (flipping) {
      flipT.current = Math.min(1, flipT.current + 0.05);
      const flipAngle = (1 - easeOutCubic(flipT.current)) * Math.PI;
      mesh.rotation.set(rotation[0] + flipAngle, rotation[1], rotation[2]);
    }

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
      {/* Arcane aura while held — luminous lift (no-dep glow). */}
      {isSelected && <Halo color={palette.arcane} size={1.4} opacity={0.5} position={[0, 0, 0.04]} />}
    </mesh>
  );
}
