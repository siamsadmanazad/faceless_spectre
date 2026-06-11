/**
 * Faceless Spectre — visual palette (single source of truth).
 *
 * Theme: "living illustrated fable" — a warm, hearth-lit storybook base with
 * restrained luminous accents. Lead with warmth (hearth/amber); accent with a
 * cool glow (arcane/teal), kept mostly desaturated so saturation reads as magic.
 *
 * Both the 3D scene and the 2D inline-styled chrome import from here so the look
 * stays consistent and re-tunable from one place.
 */

export const palette = {
  // ── Atmosphere ───────────────────────────────────────────────────────────
  bgDeep: '#1a1410', // warm near-black (plum-brown) — scene/vignette base
  bgDusk: '#2b1d2a', // warm aubergine — mid gradient
  bgEmber: '#3a2630', // warm ember — lobby gradient upper

  // ── Accents ──────────────────────────────────────────────────────────────
  hearth: '#f0b15a', // primary — candle/amber glow that "breathes"
  hearthSoft: '#e89a4a', // deeper amber for keylight
  arcane: '#5fd6c4', // secondary — cool teal, used sparingly (reveal/select/host)

  // ── Surfaces ─────────────────────────────────────────────────────────────
  feltDeep: '#1f463c', // painterly deep warm pine-teal felt
  feltHi: '#2c5e50', // felt sheen highlight
  wood: '#3a2418', // warm walnut rim
  woodHi: '#5c3d1e', // rim highlight

  // ── Cards ────────────────────────────────────────────────────────────────
  paper: '#f7efe1', // warm cream card face
  paperEdge: '#e7d8c0', // card edge / border
  ink: '#2a2018', // warm near-black text
  suitRed: '#b23a2e', // terracotta red (warm)
  suitBlack: '#2a2018', // warm black suit
  cardBack: '#243a52', // muted indigo card back base
  cardBackInk: '#f0b15a', // card back filigree (hearth)

  // ── UI chrome ────────────────────────────────────────────────────────────
  glass: 'rgba(28, 20, 14, 0.62)', // warm amber-tinted dark glass
  glassBorder: 'rgba(240, 177, 90, 0.28)', // thin hearth border
  textPrimary: '#f7efe1', // paper
  textDim: 'rgba(247, 239, 225, 0.55)',
  textFaint: 'rgba(247, 239, 225, 0.35)',
  danger: '#d8745f', // warm terracotta for kick/errors
} as const;

/**
 * Per-seat ghost-hand colours — a harmonized jewel set (warmer and more
 * painterly than primary RGB). Index = seat number.
 */
export const SEAT_COLORS: readonly string[] = [
  '#f0b15a', // 0 — hearth gold
  '#5fd6c4', // 1 — arcane teal
  '#e07a8a', // 2 — dusk rose
  '#a9d46e', // 3 — sage green
  '#b79cea', // 4 — soft violet
  '#7fb2e6', // 5 — faded sky
];

/** Lobby background gradient (warm dusk). */
export const lobbyGradient = `linear-gradient(135deg, ${palette.bgDeep}, ${palette.bgDusk}, ${palette.bgEmber})`;

/**
 * Font-family tokens. Backed by the CSS variables set in layout.tsx via
 * next/font, with safe fallbacks. `display` is the fable serif (Fraunces),
 * `ui` the humanist sans (Inter), `mono` for codes/counts (JetBrains Mono).
 */
export const font = {
  display: 'var(--font-display), Georgia, serif',
  ui: 'var(--font-ui), system-ui, sans-serif',
  mono: 'var(--font-mono), ui-monospace, monospace',
} as const;
