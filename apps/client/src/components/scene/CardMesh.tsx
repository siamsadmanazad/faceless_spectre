'use client';

import { useMemo, useRef } from 'react';
import { Mesh, CanvasTexture } from 'three';
import { useFrame } from '@react-three/fiber';

const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.008;

function makeBackTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a237e';
  ctx.fillRect(0, 0, 128, 180);
  ctx.strokeStyle = '#ffffff33';
  ctx.lineWidth = 2;
  for (let i = 8; i < 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 180);
    ctx.stroke();
  }
  for (let i = 8; i < 180; i += 16) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff88';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 112, 164);
  return new CanvasTexture(canvas);
}

function makeFaceTexture(rank: string, suit: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fff8f0';
  ctx.fillRect(0, 0, 128, 180);
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 120, 172);

  const isRed = suit === 'H' || suit === 'D';
  const color = isRed ? '#cc2222' : '#111111';
  const suitSymbol = { H: '♥', D: '♦', S: '♠', C: '♣' }[suit] ?? suit;

  ctx.fillStyle = color;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(rank, 10, 32);
  ctx.font = '18px sans-serif';
  ctx.fillText(suitSymbol, 10, 52);

  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(suitSymbol, 64, 108);

  ctx.save();
  ctx.translate(118, 148);
  ctx.rotate(Math.PI);
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(rank, 0, 0);
  ctx.restore();
  return new CanvasTexture(canvas);
}

interface CardMeshProps {
  rank?: string;
  suit?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  onClick?: () => void;
  highlighted?: boolean;
  faceUp?: boolean;
}

export function CardMesh({
  rank,
  suit,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  onClick,
  highlighted = false,
  faceUp = false,
}: CardMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const hasFace = !!(rank && suit);

  const backTex = useMemo(() => makeBackTexture(), []);
  const faceTex = useMemo(
    () => (hasFace ? makeFaceTexture(rank!, suit!) : backTex),
    [rank, suit, hasFace, backTex],
  );

  useFrame(() => {
    if (!meshRef.current) return;
    const target = highlighted ? 1.08 : 1.0;
    meshRef.current.scale.setScalar(
      meshRef.current.scale.x + (target - meshRef.current.scale.x) * 0.12,
    );
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
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={onClick}
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
