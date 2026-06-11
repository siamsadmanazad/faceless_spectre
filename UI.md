# Faceless Spectre — UI & 3D Design Guide

> The canonical design document for the look, feel, and motion of Faceless Spectre.
> This is the source of truth for all visual/UX work. When in doubt, follow this file.

---

## 1. Vision

Faceless Spectre should feel like **a living illustrated fable that you step inside** — a warm, hearth-lit storybook table rendered with the polish of a high-end 3D website. It is played in the browser, so the *whole web experience* (landing → lobby → table) must feel three-dimensional, alive, and intentional — not a flat form bolted onto a game canvas.

Two reference poles, deliberately blended:

- **Claude / fable** — warmth, paper, candlelight, humanist illustration, calm. The *soul*.
- **Riot's Arcane (Fortiche)** — painterly surfaces, volumetric light, restrained luminous "magic" accents, choreographed motion. The *drama*.

**North star:** *lead with warmth, accent with glow.* A warm base most of the time; saturation and light reserved for the few things that should feel magical (a reveal, a held card, a player's presence).

The benchmark for production quality is the tier of 3D sites on **Awwwards / Godly / Codrops** — Lusion, Active Theory, Bruno Simon, pmndrs showcases. Pleasing, intuitive, performant, and *memorable in the first three seconds.*

---

## 2. Design Principles (the rules we hold)

1. **Warmth first, glow second.** Most of the frame is warm and soft. Glow is a spice, not a sauce.
2. **Motion has meaning.** Nothing moves for decoration alone. Every animation communicates state, draws focus, or rewards an action.
3. **Performance is a feature.** Beauty that drops frames is a bug. Every effect carries a budget (Section 11). This is core to the project's identity.
4. **Procedural & lightweight by default.** Generate richness (matcaps, gradients, noise) before shipping heavy assets. Reach for a texture/HDRI only when procedural can't get there.
5. **Restraint reads as luxury.** Empty space, few fonts, a tight palette, slow easing. Amateur work is busy; professional work is edited.
6. **The first three seconds sell it.** The landing and the join cinematic are the hero moments. Invest there.
7. **Graceful everywhere.** It must look intentional on a mid-range laptop and degrade cleanly on weak/no-WebGL devices and for reduced-motion users.
8. **One source of truth.** Colors, type, motion constants, and spacing live in the theme layer; 2D and 3D both read from it.

---

## 3. What "professional 3D web" means here

The sites we admire share a recipe. We adopt all of it:

- **A 3D hero, not a flat page.** The landing/lobby is itself a small 3D scene (a slowly rotating mask motif, floating cards, a single ghost hand) with the UI as glass panels floating over it.
- **A branded preloader.** Assets/scene warm up behind a designed loading state with real progress — never a white flash.
- **Cinematic transitions.** Moving between states (lobby → table) is a *scene*, not a cut. This is where "premium" is felt.
- **Continuous, subtle life.** Idle parallax, drifting motes, a breathing hearth, gentle float. The scene is never frozen.
- **Tactile micro-interactions.** Buttons respond (magnetic hover, soft press, glow), cards lift and settle with physics, sounds confirm actions.
- **Cohesive art direction.** One palette, one type system, one motion language, applied everywhere with discipline.
- **Invisible performance.** 60fps, fast load, no jank — the craft you don't notice.

---

## 4. Design System / Foundations

### 4.1 Palette — ✅ built
Defined in `apps/client/src/theme/palette.ts` (warm fable base + cool accent + harmonized seat colors). This is the single source of truth; never hard-code colors in components. Tune values here.

### 4.2 Typography — ⬜ to add (current gap: everything is default sans-serif)
Three roles, all free and self-hosted via `next/font` (zero layout shift, no external request):

- **Display / logo / titles → `Fraunces`** (variable serif). Warm, characterful, slightly "wonky" old-style — reads as fable + modern. Used large and sparingly (the logo, the join title card, section headers).
- **UI / body → `Inter`** (or `Geist`). Clean humanist sans for legibility in the HUD, lobby, buttons, labels.
- **Mono → `JetBrains Mono`** (or `Geist Mono`). For room codes, deck counts, anything systemic.

Rules: one display + one UI + one mono, no more. Generous line-height in body, tight tracking on the display. Numbers in the HUD use tabular/mono so they don't jitter.

### 4.3 2D chrome material language
The HUD/lobby panels are **warm frosted glass**, not cold black:
- Background: warm amber-tinted translucency (`palette.glass`), `backdrop-filter: blur`.
- Border: a hair-thin hearth-tinted line (`palette.glassBorder`) — the "edge light."
- Depth: soft, warm, low-opacity drop shadows; subtle inner highlight on top edge.
- Corners: consistent radius scale (e.g., 8 / 12 / 16).
- Text: `palette.textPrimary/Dim/Faint` only.

### 4.4 Iconography — ⬜ to add (current gap: emoji 👁 🔇 👑)
Replace emoji with a real icon set: **Lucide** (`lucide-react`) — clean, consistent, tree-shakeable. (Phosphor is a fine alternative with duotone.) Icons inherit `currentColor` so they pick up the palette.

### 4.5 Motion language (define once, reuse everywhere)
Codify these as constants in the theme layer so motion feels like one hand authored it:
- **Durations:** micro (120–180ms hover/press), standard (250–400ms UI transitions), cinematic (1.5–3s scene moves).
- **Easing:** a warm, soft default — gentle ease-out for entrances (`cubic-bezier(0.22, 1, 0.36, 1)`-ish), spring for physical objects (cards/hands), slow ease-in-out for ambient drift. Avoid linear and avoid bouncy defaults.
- **Springs (3D objects):** medium stiffness, high-ish damping → settles, doesn't wobble. One "card spring" and one "hand spring" preset, reused.
- **Stagger:** grouped things animate in sequence, not together (dealing = a ripple; list items = cascade).
- **Always:** anticipation → action → settle (overshoot then ease back) for anything physical.

### 4.6 Sound (optional but high-leverage dimension — currently absent)
Game feel doubles with audio. Recommended later: a soft hearth ambient loop, a card-slide on draw, a riffle on shuffle, a soft chime on reveal, a UI tick on hover/press. Library: **Howler.js**. Sources: Freesound / Pixabay (CC0). Always behind a mute and a first-interaction gate (browsers block autoplay).

---

## 5. Experience Map (screen by screen)

The journey, each with its 3D treatment:

1. **Preloader** — branded warm loading state with real progress (`useProgress`); the logo glows in as assets warm. Never a blank flash.
2. **Landing / Lobby** — a 3D hero scene: a slowly rotating masked-ghost motif or a few floating, fanning cards over the warm atmosphere, with the name/Quick-Play/Create/Join panels as floating glass over it. Idle parallax follows the cursor. Buttons are magnetic and glow on hover.
3. **Join Intro Cinematic** (Section 8) — the signature transition from lobby into the seated table view. Masks the connection/sync time.
4. **The Table (in-game)** — the warm hearth scene; cards, hands, masks, HUD. Continuous subtle life. The bulk of play.
5. **Exit / reconnect** — leaving fades back to the lobby; a dropped connection shows a calm, on-theme "reconnecting" state (not a raw error), reusing the seat-reclaim system.

---

## 6. The 3D Scene Direction

### Atmosphere — 🟡 scaffolded
`Atmosphere.tsx` (gradient backdrop, pulsing hearth glow, drifting `Sparkles` motes) and `SceneLighting.tsx` (warm key + cool rim + soft `ContactShadows`) are written and wire into `TableScene`. `SafeEnvironment` now builds a tiny **procedural warm environment** instead of fetching the CDN HDR.

### Lighting language
Warm key from above-front (the hanging hearth), a cool low rim for painterly depth, soft grounded contact shadow. No harsh realtime shadow maps. The mood is candlelit, not fluorescent.

### Camera language
- Constrained orbit (already in place) so the table is always readable.
- **Idle parallax:** the camera drifts a few degrees toward the cursor — alive, not nauseating.
- Optional slow "breathing" dolly at rest.
- The join cinematic owns the camera briefly, then hands control back.

### Elements
- **Felt:** painterly deep pine-teal with a subtle noise-modulated gradient and soft sheen — not flat poster-green.
- **Deck:** instanced card stack (already `InstancedMesh`); a warm filigree back.
- **Cards:** warm cream paper, terracotta/warm-black suits, a soft matcap sheen on the body, a thin luminous edge when held or revealed.
- **Ghost hands (signature):** matcap + **fresnel rim-glow** so they read as luminous and ghostly; per-seat jewel color; gentle `Float`.
- **Masks:** warm porcelain matcap, a faint glow; candidate hero element for future detailing.

### VFX & glow — ⬜ decision point
For the full "professional 3D web" luminosity, **selective bloom** on emissive elements (held-card edge, hand rim, hearth, reveal flash) is essentially required. This means adding `@react-three/postprocessing`. It's a screen-space pass with a real cost, so: **one** post-processing stack, selective bloom on emissives only, plus optional subtle vignette + film grain (painterly). Keep passes minimal; profile after adding. (The atmosphere pass deliberately fakes glow with fresnel + additive halos first; bloom is the considered upgrade for the hero look.)

---

## 7. Motion & Micro-interactions

### Card choreography (the heart of game feel — next major phase)
Each action is a small authored animation, not a position snap:
- **Shuffle:** the chosen style is theatre (riffle/wash/etc.); cards arc and interleave, then settle square. (Outcome is already server-decided.)
- **Draw:** a card lifts off the deck, arcs toward the hand on a curved path, with a slight overshoot and settle; the deck recoils a touch.
- **Deal:** a *ripple* — cards fly to seats in sequence with stagger, not all at once.
- **Reveal:** a flip with anticipation; the face catches a luminous edge as it turns up; a soft chime + bloom pulse.
- **Collect:** cards sweep together and stack with a satisfying settle.
- **Hold/select:** lift, glow edge, subtle float.

### Presence (ghost hands)
Smoothly interpolated (already 20Hz + damping); state changes (grab/reveal) shift the hand's glow and scale. Keep it readable, never frantic.

### UI micro-interactions
Magnetic buttons, soft press-down, hover glow, ripple on click, animated panel enter/exit (Framer Motion), copy-link confirmation, animated tallies (deck count rolls, not jumps).

---

## 8. The Join Intro Animation (the hero moment)

A short (~2–3s, skippable) cinematic that plays when a player enters a room — and **doubles as the loader**, masking the WebSocket connect + state sync so it never feels like dead time. Completion gates on `connected && state-synced` (or a max timeout).

**Beat sheet:**
1. **Lobby lifts away** — the glass panels exit (fade + slight rise), the hero scene dims toward warm black.
2. **The hearth ignites** — from darkness, the warm glow blooms up, as if a candle is lit at the table's center.
3. **Camera descent** — starts high and far, looking down at the table from above; sweeps down and forward on an eased path, settling into the seated near-edge POV.
4. **The table assembles** — felt fades in, the deck drops and settles onto the felt with a soft bounce; drifting motes appear; present players' ghost hands fade in with a shimmer at their seats.
5. **Title beat** — "Faceless Spectre" resolves (3D `Text` or a 2D overlay in `Fraunces`), holds briefly, dissolves.
6. **HUD arrives last** — controls and panels fade/scale in once the player is "seated."

**Rules:** click/key to skip (jump to settled state). Honor `prefers-reduced-motion` → near-instant settle. Same cinematic language (camera + hearth) used in reverse, briefly, on leave.

A simpler v1 (no full camera choreography) is still strong: hearth-ignite + table-assemble + title, with a static settled camera. Upgrade to the full camera move once the rest lands.

---

## 9. Implementation Plan (phased, step-by-step)

Each phase is shippable on its own, verified, and committed. Phases 0–2 are partly underway from the atmosphere work.

**Phase 0 — Foundations** ✅ (done)
- Theme palette and procedural matcaps modules exist and are the single source of truth.

**Phase 1 — Atmosphere & lighting** 🟡 (scaffolded, finish + commit)
- Wire `SceneLighting` + `Atmosphere` into the table scene; drop the CDN HDR for the procedural environment; warm the background. Verify FPS and that the HDR fetch is gone. *Biggest instant transformation.*

**Phase 2 — Materials**
- Painterly felt; fresnel + matcap ghost hands with float; porcelain masks; warmed cards with a held/reveal luminous edge; warm deck back. Keep the texture cache and at-rest render early-out.

**Phase 3 — Typography & iconography**
- Add `Fraunces` + `Inter` + `JetBrains Mono` via `next/font`; replace emoji with Lucide icons; apply the type scale across HUD and lobby.

**Phase 4 — 2D chrome retune**
- HUD, shuffle selector, and lobby read warm-glass + type tokens from the theme; consistent radii, depth, spacing.

**Phase 5 — Landing/lobby as a 3D hero**
- Turn the flat lobby into a 3D hero scene (rotating mask motif / floating cards) with glass UI over it, idle parallax, magnetic buttons, Framer Motion panel transitions.

**Phase 6 — Preloader + Join intro cinematic**
- Branded loader (`useProgress`); the join cinematic (Section 8), starting with the simpler v1 and upgrading to the camera move. Gate completion on connection+sync; add skip + reduced-motion paths.

**Phase 7 — Glow & post** 🟡 *(no-dep version shipped; bloom deferred)*
- Shipped a no-dependency glow: additive `Halo` sprites on the ghost hands, masks, and held cards (`components/scene/Halo.tsx` + `getGlowTexture`). Reads as bloom at one quad each.
- **Deferred (registry was unreachable):** `@react-three/postprocessing` for true selective bloom on emissives + vignette/grain. Drop-in upgrade once `pnpm add @react-three/postprocessing` succeeds; the halos can stay or be removed.

**Phase 8 — Motion choreography**
- Re-author card animations (shuffle/draw/deal/reveal/collect) with springs + stagger + anticipation/settle. The biggest "game feel" leap.

**Phase 9 — Sound (optional)**
- Hearth ambient + card/UI SFX via Howler, behind a mute + first-interaction gate.

**Phase 10 — Polish & QA**
- Micro-interactions, reduced-motion + low-power + no-WebGL fallbacks, responsive checks, performance pass, cross-browser.

---

## 10. Components & Resources (the toolbox)

**Core 3D (have):** `three`, `@react-three/fiber`, `@react-three/drei`.
- From **drei**, lean on: `Float`, `ContactShadows`, `Environment`, `Sparkles`, `Text` / `Text3D`, `useTexture`, `useProgress`/`Loader`, `MeshTransmissionMaterial` (glassy cards/panels), `Lightformer` (studio glints), `shaderMaterial` (custom fresnel/painterly), `Backdrop`.

**3D glow/post (add at Phase 7):** `@react-three/postprocessing` (selective Bloom, Vignette, Noise/grain, subtle DepthOfField).

**Animation:**
- **Framer Motion** (`framer-motion`) — all 2D/DOM transitions, page/panel enter-exit, layout, micro-interactions. *Primary UI animation tool.*
- **`@react-spring/three`** or **`maath`** (damping/easing helpers from pmndrs) — physics for 3D game objects (cards, hands). `maath` is tiny; great for damped motion.
- **GSAP** (`gsap`) — timeline choreography for the join cinematic (now fully free). Best tool for sequenced beats. Optional: **Theatre.js** for visually authoring the cinematic (advanced).
- Keep it to ~2–3 of these to avoid bloat: **Framer Motion + maath (or react-spring) + GSAP for the intro.**

**Typography:** `Fraunces`, `Inter`, `JetBrains Mono` — all via `next/font/google` (self-hosted, no CLS). (Geist / Mona Sans are good alternatives.)

**Icons:** `lucide-react` (or `@phosphor-icons/react`).

**Sound (Phase 9):** `howler` + CC0 SFX from Freesound / Pixabay.

**Texture / matcap / HDRI resources (procedural-first; these are fallbacks):**
- Matcaps: github.com/nidorx/matcaps (free library) — we generate ours, so optional.
- **Poly Haven** (polyhaven.com) — CC0 HDRIs, textures, models.
- **ambientCG** (ambientcg.com) — CC0 PBR textures (felt, wood, paper grain).

**Inspiration / learning (study these):**
- **Awwwards** (WebGL/3D), **Godly.website**, **Codrops** (tutorials + source), **pmndrs** examples (drei/r3f), **Three.js Journey** showcase, and portfolios: **Bruno Simon**, **Lusion**, **Active Theory**, **Resn**.

---

## 11. Performance Budget & Guardrails (non-negotiable)

- **Frame rate:** ~60 FPS with 4 players in scene on a mid-range laptop.
- **Memory:** < 100 MB in-scene; texture count bounded (procedural caches).
- **Network:** no multi-MB asset fetches on load (HDR dropped); self-hosted fonts; lazy/streamed where possible. Game-state bandwidth unchanged (< 40 KB/s/player).
- **Render loop:** keep the tab-hidden pause (already in place); prefer GPU-driven effects (Sparkles, shaders) over per-frame CPU loops; reuse the at-rest early-out for idle objects.
- **Post-processing:** at most one stack, selective bloom on emissives only; profile before/after.
- **Draw calls:** instance repeated geometry (deck, opponent backs); atlas where sensible.
- **Rule:** every new effect ships with a before/after FPS check in dev `Stats`.

---

## 12. Accessibility & Fallbacks

- **`prefers-reduced-motion`:** dampen ambient drift, skip the cinematic to its settled state, disable parallax. Build this into the motion layer from the start.
- **Low-power / weak GPU:** a quality tier that drops post-processing, motes, and shadow softness (detect via FPS or device hints).
- **No WebGL:** a graceful on-theme message + the 2D lobby still functioning (game requires WebGL, but don't crash).
- **Contrast & legibility:** HUD text meets contrast over the (sometimes bright) 3D background — use the glass panels to guarantee a readable backing.
- **Input:** keyboard paths preserved; focus states on all interactive UI.
- **Responsive:** define behavior for small screens early (the 3D table on mobile is a real design question — likely a simplified camera + larger touch targets).

---

## 13. Status — what's been built

**All phases implemented.** (Awaiting visual eyeball + fine-tuning.)

- ✅ **Phase 0 — Foundations:** `theme/palette.ts`, `theme/matcaps.ts`, `usePrefersReducedMotion`, `lib/motion.ts`.
- ✅ **Phase 1 — Atmosphere & lighting:** `SceneLighting`, `Atmosphere` (gradient backdrop, pulsing hearth, drifting motes), procedural warm `SafeEnvironment` (CDN HDR dropped).
- ✅ **Phase 2 — Materials:** rim-matcap ghost hands + porcelain masks; illustrated card back + warm faces + arcane held-glow; painterly felt + walnut rim.
- ✅ **Phase 3 — Typography & icons:** Fraunces/Inter/JetBrains Mono via `next/font`; local inline-SVG icon set (`components/ui/Icon.tsx`) — no dependency, all emoji replaced.
- ✅ **Phase 4 — Chrome retune:** lobby, HUD, shuffle selector, scene overlays on warm-glass palette tokens.
- ✅ **Phase 5 — 3D hero lobby:** `LobbyScene` — floating masked ghost-hand motif + drifting cards behind the glass form, idle cursor parallax.
- ✅ **Phase 6 — Join cinematic:** `JoinIntro` camera descent + connection veil + title (hand-rolled, no GSAP); skippable, reduced-motion aware, masks the connect.
- 🟡 **Phase 7 — Glow:** no-dep additive `Halo` sprites on hands/masks/held cards. *True post-process bloom (`@react-three/postprocessing`) deferred — registry was unreachable; drop-in later.*
- ✅ **Phase 8 — Motion choreography:** card travel arc (draw/deal) + reveal/deal-in flip flourish with scale pop, in `CardMesh`.
- ✅ **Phase 9 — Sound:** native Web Audio synth engine (`lib/audio.ts`) — draw/deal/shuffle/reveal/place SFX wired to server animation commands, HUD toggle, autoplay-gated.
- ✅ **Phase 10 — Polish & fallbacks:** no-WebGL fallback, DPR cap, reduced-motion sweep, responsive lobby.
- ➕ **Camera auto-recenter** (`CameraHome`): free orbit, then smooth glide back to the seated home view.

> **Resume point:** eyeball the running app, fine-tune values (palette, light intensities, motion timings, SFX levels), then optionally add real post-process bloom once the npm registry is reachable.

### Deferred / future
- **True selective bloom** via `@react-three/postprocessing` (Phase 7 upgrade).
- **Deal stagger** (per-card sequenced arrival) and a literal front/back reveal flip.
- **Ambient hearth sound bed**; sourced SFX if richer than the synth set is wanted.
