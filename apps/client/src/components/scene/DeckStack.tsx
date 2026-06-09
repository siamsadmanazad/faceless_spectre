'use client';

import { useMemo, useRef, useEffect } from 'react';
import { InstancedMesh, Object3D, CanvasTexture, Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { AnimationType, ShuffleStyle } from '@faceless-spectre/shared';
import { useRoomStore } from '../../store/roomStore';

const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.008;
const MAX_VISIBLE = 52;

function makeBackTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 90;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(0, 0, 64, 90);
  ctx.strokeStyle = '#ffffff88';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 56, 82);
  return new CanvasTexture(canvas);
}

export function DeckStack() {
  const deckSize = useRoomStore((s) => s.deckSize);
  const deckAnimation = useRoomStore((s) => s.deckAnimation);
  const clearDeckAnimation = useRoomStore((s) => s.clearDeckAnimation);

  const groupRef = useRef<Group>(null);
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const backTex = useMemo(() => makeBackTexture(), []);

  const visibleCount = Math.min(deckSize, MAX_VISIBLE);

  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.count = visibleCount;
    for (let i = 0; i < visibleCount; i++) {
      dummy.position.set(0, i * CARD_D * 1.1, 0);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [visibleCount, dummy]);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    if (!deckAnimation) {
      // Snap back to identity when no animation is active
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      return;
    }

    const t = Math.min(1, (Date.now() - deckAnimation.startedAt) / deckAnimation.durationMs);

    if (deckAnimation.animation === AnimationType.Shuffle) {
      switch (deckAnimation.style) {
        case ShuffleStyle.Riffle:
          // Tilt left and back — deck arcs like two halves interleaving
          g.rotation.z = Math.sin(t * Math.PI) * 0.3;
          g.rotation.x = Math.sin(t * Math.PI * 2) * 0.08;
          break;
        case ShuffleStyle.Overhand:
          // Rapid vertical stutter — top cards cycling over
          g.position.y = Math.sin(t * Math.PI * 5) * 0.07;
          g.rotation.x = Math.sin(t * Math.PI * 3) * 0.12;
          break;
        case ShuffleStyle.Wash:
          // Deck sweeps sideways and returns — cards spread on felt
          g.position.x = Math.sin(t * Math.PI) * 0.4;
          g.rotation.z = Math.sin(t * Math.PI) * 0.15;
          break;
        case ShuffleStyle.Split:
          // Y-axis rotation — deck pivots like splitting in two
          g.rotation.y = Math.sin(t * Math.PI) * 0.5;
          g.position.y = Math.sin(t * Math.PI) * 0.04;
          break;
        case ShuffleStyle.Casino:
          // Full spin — casino-style flourish
          g.rotation.y = t * Math.PI * 3;
          g.position.y = Math.sin(t * Math.PI) * 0.06;
          break;
      }
    } else if (deckAnimation.animation === AnimationType.Deal) {
      // Deck briefly compresses as cards leave
      g.scale.y = 1 - Math.sin(t * Math.PI) * 0.12;
    }

    if (t >= 1) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      clearDeckAnimation();
    }
  });

  if (deckSize === 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_VISIBLE]} castShadow>
        <boxGeometry args={[CARD_W, CARD_H, CARD_D]} />
        <meshStandardMaterial map={backTex} />
      </instancedMesh>
    </group>
  );
}
