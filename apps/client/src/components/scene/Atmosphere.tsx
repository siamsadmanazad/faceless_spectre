'use client';

import { useMemo, useRef } from 'react';
import { BackSide, CanvasTexture, AdditiveBlending, type Mesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { palette } from '../../theme/palette';

/** Vertical gradient backdrop (warm dusk), drawn once to a canvas. */
function useBackdropTexture(): CanvasTexture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, palette.bgDeep); // top — deep warm dark
    g.addColorStop(0.55, palette.bgDusk); // mid — aubergine
    g.addColorStop(0.85, palette.bgEmber); // low — warm ember
    g.addColorStop(1.0, '#4a2e2a'); // horizon warmth
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    return new CanvasTexture(c);
  }, []);
}

/** Soft radial glow (the hearth), drawn once to a canvas, additively blended. */
function useGlowTexture(): CanvasTexture {
  return useMemo(() => {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = s;
    c.height = s;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0.0, 'rgba(240, 177, 90, 0.55)');
    g.addColorStop(0.4, 'rgba(232, 154, 74, 0.22)');
    g.addColorStop(1.0, 'rgba(232, 154, 74, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new CanvasTexture(c);
  }, []);
}

interface AtmosphereProps {
  /** When false, the hearth holds steady (honours prefers-reduced-motion). */
  animate?: boolean;
}

export function Atmosphere({ animate = true }: AtmosphereProps) {
  const backdrop = useBackdropTexture();
  const glow = useGlowTexture();
  const glowRef = useRef<Mesh>(null);

  // Slow hearth "breathing" — opacity + scale drift. Cheap (one material write).
  useFrame(({ clock }) => {
    if (!animate || !glowRef.current) return;
    const t = clock.elapsedTime;
    const pulse = 0.82 + Math.sin(t * 0.6) * 0.12;
    const mat = glowRef.current.material as { opacity: number };
    mat.opacity = pulse;
    const s = 12 + Math.sin(t * 0.6) * 0.5;
    glowRef.current.scale.set(s, s, 1);
  });

  return (
    <group>
      {/* Gradient backdrop — single inside-out sphere, unlit, one draw call. */}
      <mesh scale={40}>
        <sphereGeometry args={[1, 24, 16]} />
        <meshBasicMaterial map={backdrop} side={BackSide} depthWrite={false} fog={false} />
      </mesh>

      {/* Hearth glow — additive plane low and behind the table. */}
      <mesh ref={glowRef} position={[0, 1.2, -3.5]} scale={12}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.82}
          blending={AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      {/* Drifting warm motes — GPU points, a single cheap draw call. */}
      <Sparkles
        count={28}
        scale={[12, 4, 12]}
        position={[0, 2, 0]}
        size={3}
        speed={animate ? 0.25 : 0}
        opacity={0.5}
        color={palette.hearth}
      />
    </group>
  );
}
