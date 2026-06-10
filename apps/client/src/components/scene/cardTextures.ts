'use client';

import { CanvasTexture } from 'three';

/**
 * Shared card textures.
 *
 * Every card back is identical, and there are only ever 52 distinct faces, so
 * textures are created once and reused across all card meshes instead of being
 * regenerated per component instance. This keeps the GPU texture count bounded
 * at ≤53 for the whole session regardless of how many cards are drawn, shuffled,
 * or revealed. Lazily created so they're never built during SSR (no `document`).
 */

let backTexture: CanvasTexture | null = null;
const faceCache = new Map<string, CanvasTexture>();

/** The single shared card-back texture, created on first use. */
export function getBackTexture(): CanvasTexture {
  if (backTexture) return backTexture;

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

  backTexture = new CanvasTexture(canvas);
  return backTexture;
}

/** A shared face texture for the given rank/suit, memoized (≤52 distinct ever). */
export function getFaceTexture(rank: string, suit: string): CanvasTexture {
  const key = `${rank}${suit}`;
  const existing = faceCache.get(key);
  if (existing) return existing;

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

  const tex = new CanvasTexture(canvas);
  faceCache.set(key, tex);
  return tex;
}
