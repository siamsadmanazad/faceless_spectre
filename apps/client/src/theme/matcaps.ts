'use client';

import { CanvasTexture } from 'three';

/**
 * Procedural matcaps — zero external assets.
 *
 * A matcap (material capture) is a sphere-shaped image sampled by view-space
 * normal; it bakes lighting + material into one texture, giving a fully "lit",
 * stylized look with NO scene lights and almost no GPU cost. Perfect for the
 * lightweight, painterly fable target.
 *
 * Each matcap is a small radial gradient drawn once to a <canvas> and cached at
 * module scope (lazy, so it never runs during SSR). Same pattern as
 * components/scene/cardTextures.ts — bounded texture count for the whole session.
 */

const cache = new Map<string, CanvasTexture>();

interface MatcapStops {
  /** Center (facing camera) → rim, as [offset 0..1, css color]. */
  stops: Array<[number, string]>;
  /** Background fill behind the sphere disc (usually the darkest rim tone). */
  bg: string;
}

function build(key: string, { stops, bg }: MatcapStops): CanvasTexture {
  const existing = cache.get(key);
  if (existing) return existing;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Offset the highlight slightly up-left for a soft key-light feel.
  const cx = size * 0.42;
  const cy = size * 0.38;
  const grad = ctx.createRadialGradient(cx, cy, size * 0.02, size * 0.5, size * 0.5, size * 0.55);
  for (const [offset, color] of stops) grad.addColorStop(offset, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new CanvasTexture(canvas);
  cache.set(key, tex);
  return tex;
}

/** Soft pearlescent matcap for ghost hands — tinted toward the seat colour. */
export function getHandMatcap(seatColor: string): CanvasTexture {
  return build(`hand:${seatColor}`, {
    bg: '#0d1418',
    stops: [
      [0.0, '#ffffff'],
      [0.35, seatColor],
      [0.75, mix(seatColor, '#0d1418', 0.55)],
      [1.0, '#0a1014'],
    ],
  });
}

/** Warm porcelain matcap for the floating masks. */
export function getMaskMatcap(): CanvasTexture {
  return build('mask:porcelain', {
    bg: '#1a120c',
    stops: [
      [0.0, '#fff6ec'],
      [0.4, '#f3dcc0'],
      [0.78, '#9c7a5c'],
      [1.0, '#2a1c12'],
    ],
  });
}

/** Warm low-sheen matcap for the card body sides. */
export function getCardMatcap(): CanvasTexture {
  return build('card:warm', {
    bg: '#1c160f',
    stops: [
      [0.0, '#fffaf0'],
      [0.5, '#efe3cf'],
      [0.85, '#b6a589'],
      [1.0, '#3a2e20'],
    ],
  });
}

/** Linear blend of two #rrggbb colours; amount=0 → a, 1 → b. */
function mix(a: string, b: string, amount: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const c = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * amount);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
