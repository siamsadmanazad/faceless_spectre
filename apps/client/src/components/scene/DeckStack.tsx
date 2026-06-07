'use client';

import { useMemo, useRef, useEffect } from 'react';
import { InstancedMesh, Object3D, CanvasTexture } from 'three';
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

  if (deckSize === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_VISIBLE]} castShadow>
      <boxGeometry args={[CARD_W, CARD_H, CARD_D]} />
      <meshStandardMaterial map={backTex} />
    </instancedMesh>
  );
}
