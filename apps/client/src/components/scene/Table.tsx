'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useRoomStore } from '../../store/roomStore';
import { palette } from '../../theme/palette';

/**
 * Painterly radial sheen for the felt: a soft pool of hearth-lit highlight at
 * center fading to a vignetted edge. Baked as a color map; ShapeGeometry UVs
 * are the shape's world x/y, so repeat/offset remap world space → [0,1].
 * Radial, so it suits every table shape (all are centered on the origin).
 */
const FELT_SHEEN_SPAN = 11; // world units mapped across the texture

function makeFeltSheen(): THREE.CanvasTexture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.04, s / 2, s / 2, s * 0.52);
  g.addColorStop(0, palette.feltHi);
  g.addColorStop(0.38, palette.feltDeep);
  g.addColorStop(1, '#152f28'); // vignetted edge, a step darker than feltDeep
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.repeat.set(1 / FELT_SHEEN_SPAN, 1 / FELT_SHEEN_SPAN);
  tex.offset.set(0.5, 0.5);
  return tex;
}

/** Tiling micro-noise for a painterly felt surface (varies roughness subtly). */
function makeFeltGrain(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s, s);
  const img = ctx.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 128 + (Math.random() - 0.5) * 90;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

// ── Shape generators ──────────────────────────────────────────────────────────

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  s.closePath();
  return s;
}

function roundedPolygon(sides: number, radius: number, cornerRadius: number): THREE.Shape {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }

  const s = new THREE.Shape();
  let first = true;

  for (let i = 0; i < sides; i++) {
    const curr = pts[i];
    const prev = pts[(i - 1 + sides) % sides];
    const next = pts[(i + 1) % sides];

    const dpx = prev[0] - curr[0], dpy = prev[1] - curr[1];
    const dpLen = Math.sqrt(dpx * dpx + dpy * dpy);
    const dnx = next[0] - curr[0], dny = next[1] - curr[1];
    const dnLen = Math.sqrt(dnx * dnx + dny * dny);

    const cr = Math.min(cornerRadius, dpLen * 0.45, dnLen * 0.45);
    const arcStart: [number, number] = [curr[0] + (dpx / dpLen) * cr, curr[1] + (dpy / dpLen) * cr];
    const arcEnd: [number, number]   = [curr[0] + (dnx / dnLen) * cr, curr[1] + (dny / dnLen) * cr];

    if (first) { s.moveTo(arcStart[0], arcStart[1]); first = false; }
    else { s.lineTo(arcStart[0], arcStart[1]); }

    s.quadraticCurveTo(curr[0], curr[1], arcEnd[0], arcEnd[1]);
  }

  s.closePath();
  return s;
}

// ── Shape catalogue ───────────────────────────────────────────────────────────
//
// 2 → narrow rounded rectangle  (casino two-player strip)
// 3 → rounded triangle          (three-handed)
// 4 → rounded square            (classic four-player)
// 5 → rounded pentagon          (five-player)
// 6 → rounded hexagon           (poker table)

function feltShape(n: number): THREE.Shape {
  switch (n) {
    case 2: return roundedRect(8.0, 4.0, 0.80);
    case 3: return roundedPolygon(3, 4.0, 0.55);
    case 4: return roundedRect(5.8, 5.8, 0.55);
    case 5: return roundedPolygon(5, 4.1, 0.40);
    case 6:
    default: return roundedPolygon(6, 4.5, 0.35);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Table() {
  const maxPlayers = useRoomStore((s) => s.maxPlayers);

  // ShapeGeometry lives in useMemo so it isn't recreated every frame
  const felt = useMemo(() => feltShape(maxPlayers), [maxPlayers]);
  const grain = useMemo(() => makeFeltGrain(), []);
  const sheen = useMemo(() => makeFeltSheen(), []);

  return (
    <group>
      {/* Painterly warm felt — a baked radial sheen pools the hearth light at
          center and vignettes the edge; micro-noise varies roughness.
          Grounding comes from <ContactShadows> in SceneLighting. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[felt, 32]} />
        <meshStandardMaterial
          color="#ffffff"
          map={sheen}
          roughness={0.92}
          metalness={0.04}
          roughnessMap={grain}
        />
      </mesh>

      {/* Warm walnut rim — same shape, 7 % larger, 2 cm below the felt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} scale={[1.07, 1.07, 1]}>
        <shapeGeometry args={[felt, 32]} />
        <meshStandardMaterial color={palette.wood} roughness={0.6} metalness={0.15} />
      </mesh>
    </group>
  );
}
