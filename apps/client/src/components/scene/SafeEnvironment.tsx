'use client';

import { Environment } from '@react-three/drei';
import { palette } from '../../theme/palette';

/**
 * Image-based lighting — a tiny PROCEDURAL warm environment instead of a CDN HDR.
 *
 * The old `preset="apartment"` fetched a multi-MB cool HDR from a CDN on every
 * load (a perf cost and the source of the scene's cold cast). This builds a warm
 * gradient environment in-process from a couple of emissive panels: it gives
 * cards and masks a soft warm reflection at near-zero cost and never touches the
 * network. The crafted light rig (SceneLighting) does the real lighting.
 */
export function SafeEnvironment() {
  return (
    <Environment resolution={64} frames={1}>
      {/* Warm "ceiling" glow above. */}
      <mesh position={[0, 6, 0]} scale={[14, 14, 1]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry />
        <meshBasicMaterial color={palette.hearthSoft} />
      </mesh>
      {/* Cool fill from one side for painterly contrast. */}
      <mesh position={[-7, 1, -5]} scale={[8, 8, 1]} rotation={[0, Math.PI / 3, 0]}>
        <planeGeometry />
        <meshBasicMaterial color={palette.arcane} />
      </mesh>
      {/* Warm ground bounce. */}
      <mesh position={[0, -3, 0]} scale={[16, 16, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry />
        <meshBasicMaterial color={palette.bgEmber} />
      </mesh>
    </Environment>
  );
}
