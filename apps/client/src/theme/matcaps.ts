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

/**
 * Ghostly **rim** matcap for the hands — dark core, bright seat-tinted edge.
 * Because the disc edge maps to glancing (silhouette) normals, a dark-center /
 * bright-rim matcap reads as a fresnel rim-glow: luminous at the edges, faint in
 * the middle. The "ghost" look, with no custom shader. Centred (not key-offset).
 */
export function getHandMatcap(seatColor: string): CanvasTexture {
  const key = `hand:${seatColor}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0a1014';
  ctx.fillRect(0, 0, s, s);

  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, mix(seatColor, '#0a1014', 0.78)); // faint dark core
  g.addColorStop(0.55, mix(seatColor, '#0a1014', 0.35));
  g.addColorStop(0.82, seatColor); // luminous rim
  g.addColorStop(1.0, mix(seatColor, '#ffffff', 0.55)); // hot edge
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();

  const tex = new CanvasTexture(c);
  cache.set(key, tex);
  return tex;
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

/**
 * Soft white radial glow for additive halo sprites — a no-dependency stand-in
 * for post-process bloom. Tint via the sprite material's `color`.
 */
export function getGlowTexture(): CanvasTexture {
  const key = 'glow:radial';
  const existing = cache.get(key);
  if (existing) return existing;

  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);

  const tex = new CanvasTexture(c);
  cache.set(key, tex);
  return tex;
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
