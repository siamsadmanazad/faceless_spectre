'use client';

import { useMemo } from 'react';
import { AdditiveBlending } from 'three';
import { getGlowTexture } from '../../theme/matcaps';

interface HaloProps {
  /** Tint (multiplies the white glow). */
  color: string;
  /** Diameter in world units. */
  size?: number;
  opacity?: number;
  position?: [number, number, number];
}

/**
 * A soft, camera-facing additive glow — a no-dependency stand-in for selective
 * post-process bloom. Uses a Sprite so it always faces the camera; additive +
 * depthWrite:false so it reads as light, not geometry. Cheap (one quad).
 *
 * (When `@react-three/postprocessing` is available, true selective bloom on the
 * emissive elements is the drop-in upgrade — these halos can stay or be removed.)
 */
export function Halo({ color, size = 1, opacity = 0.6, position = [0, 0, 0] }: HaloProps) {
  const tex = useMemo(() => getGlowTexture(), []);
  return (
    <sprite position={position} scale={[size, size, size]}>
      <spriteMaterial
        map={tex}
        color={color}
        transparent
        opacity={opacity}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}
