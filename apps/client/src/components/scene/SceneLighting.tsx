'use client';

import { ContactShadows } from '@react-three/drei';
import { palette } from '../../theme/palette';

/**
 * Centralized light rig for the "living illustrated fable" look.
 *
 * A warm amber KEY from above-front (the hanging lamp / hearth), a cool low
 * RIM/fill for painterly depth, and a soft contact shadow under the table
 * instead of a harsh realtime point-light shadow. Warm-led, cool-accented.
 */
export function SceneLighting() {
  return (
    <>
      {/* Soft warm ambient so nothing reads pure black. */}
      <ambientLight intensity={0.35} color={palette.hearth} />

      {/* Warm key — the hearth above the table. */}
      <pointLight position={[0.5, 6, 2.5]} intensity={1.15} color={palette.hearthSoft} distance={22} decay={1.4} />

      {/* Cool rim/fill from low and behind for depth and a touch of magic. */}
      <pointLight position={[-4, 2, -4]} intensity={0.45} color={palette.arcane} distance={18} decay={1.6} />

      {/* Warm bounce from the felt. */}
      <hemisphereLight args={[palette.hearth, palette.feltDeep, 0.25]} />

      {/* Soft grounded shadow — cheaper and softer than a realtime shadow map. */}
      <ContactShadows
        position={[0, 0.01, 0]}
        scale={16}
        far={6}
        blur={2.6}
        opacity={0.5}
        color="#000000"
        resolution={512}
        frames={1}
      />
    </>
  );
}
