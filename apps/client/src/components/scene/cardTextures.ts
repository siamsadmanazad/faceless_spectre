'use client';

import { CanvasTexture } from 'three';
import { palette } from '../../theme/palette';

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

  // Warm muted-indigo field with a soft radial vignette toward the center.
  ctx.fillStyle = palette.cardBack;
  ctx.fillRect(0, 0, 128, 180);
  const vg = ctx.createRadialGradient(64, 90, 8, 64, 90, 110);
  vg.addColorStop(0, 'rgba(240,177,90,0.10)'); // faint hearth bloom
  vg.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 128, 180);

  // Gold diamond lattice (illustrated filigree).
  ctx.strokeStyle = 'rgba(240,177,90,0.28)';
  ctx.lineWidth = 1.5;
  const step = 22;
  for (let x = -180; x < 128 + 180; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 180, 180);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 180, 0);
    ctx.lineTo(x, 180);
    ctx.stroke();
  }

  // Gold double border.
  ctx.strokeStyle = palette.cardBackInk;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 112, 164);
  ctx.lineWidth = 1;
  ctx.strokeRect(13, 13, 102, 154);

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

  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, 128, 180);
  ctx.strokeStyle = palette.paperEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 120, 172);

  const isRed = suit === 'H' || suit === 'D';
  const color = isRed ? palette.suitRed : palette.suitBlack;
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
