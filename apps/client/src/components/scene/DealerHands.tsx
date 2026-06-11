'use client';

import { useMemo, useRef } from 'react';
import { Group, Mesh, Material, Sprite, SpriteMaterial, AdditiveBlending } from 'three';
import { useFrame } from '@react-three/fiber';
import { getHandMatcap, getGlowTexture, getSmokeTexture } from '../../theme/matcaps';
import {
  createHandPose,
  type ShufflePlan,
  type HandRole,
} from '../../lib/shuffle/choreography';

interface DealerHandsProps {
  /** The active shuffle plan — hand keyframes come from the same data as the cards. */
  plan: ShufflePlan;
  /** Animation epoch (ms) — shared with the deck so hands and cards stay in sync. */
  startedAt: number;
  /** Seat color of the shuffling player, so it's clear whose hands these are. */
  color: string;
}

/**
 * Scripted "dealer hands" that perform the shuffle at the actor's seat.
 *
 * These are *ghost* hands, not Lego bricks: soft rounded forms (a domed palm,
 * tapering capsule fingers) with a luminous seat-tinted rim matcap, and a live
 * smoke plume that boils off the wrist — each wisp rises, billows, swirls, and
 * dissolves on a continuous loop so the hand condenses out of vapour rather than
 * ending at a hard cut. Reuses the GhostHand palette/matcap (no mask — these read
 * as working hands). Rendered inside DeckStack's actor-facing group, so the plan's
 * hand poses (+z toward the shuffler) apply directly. Purely cosmetic and
 * presence-independent: every client sees the same script.
 */
export function DealerHands({ plan, startedAt, color }: DealerHandsProps) {
  return (
    <>
      <DealerHand plan={plan} startedAt={startedAt} role="left" color={color} mirror />
      <DealerHand plan={plan} startedAt={startedAt} role="right" color={color} />
    </>
  );
}

interface DealerHandProps {
  plan: ShufflePlan;
  startedAt: number;
  role: HandRole;
  color: string;
  /** Mirror across X for the left hand (thumb on the other side). */
  mirror?: boolean;
}

// Fingers point toward -z (away from the wrist); the wrist boils into smoke
// toward +z. Lengths vary so the silhouette reads as a relaxed hand, not a comb.
const FINGERS: Array<{ x: number; len: number; curl: number; splay: number }> = [
  { x: -0.085, len: 0.085, curl: -1.78, splay: 0.34 }, // index
  { x: -0.03, len: 0.105, curl: -1.86, splay: 0.12 }, // middle (longest)
  { x: 0.03, len: 0.095, curl: -1.86, splay: -0.1 }, // ring
  { x: 0.085, len: 0.07, curl: -1.74, splay: -0.32 }, // pinky (shortest)
];

const WISP_COUNT = 7;

function DealerHand({ plan, startedAt, role, color, mirror = false }: DealerHandProps) {
  const groupRef = useRef<Group>(null);
  const solidsRef = useRef<Group>(null);
  const smokeRef = useRef<Group>(null);
  const pose = useMemo(() => createHandPose(), []);
  const handMatcap = useMemo(() => getHandMatcap(color), [color]);
  const glow = useMemo(() => getGlowTexture(), []);
  const smokeTex = useMemo(() => getSmokeTexture(), []);
  const m = mirror ? -1 : 1;

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;

    const t = (Date.now() - startedAt) / plan.durationMs;
    plan.handPose(role, t, pose);

    // Off-stage: hide the whole rig (smoke included) when the hand has faded.
    if (pose.opacity <= 0.001 || t < 0 || t > 1) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.set(pose.pitch, pose.yaw, pose.roll);

    // Solid parts + palm aura fade uniformly (per-part opacityScale on userData).
    solidsRef.current?.traverse((obj) => {
      const mat = (obj as Mesh).material as (Material & { opacity?: number }) | undefined;
      if (mat && 'opacity' in mat) {
        const scale = (obj.userData?.opacityScale as number | undefined) ?? 1;
        mat.opacity = pose.opacity * scale;
      }
    });

    // Live smoke plume — each wisp runs a staggered rise/billow/swirl/dissipate
    // loop. Phase offset by index keeps the column continuous; the per-wisp
    // envelope (sin over its life) fades it in at birth and out as it climbs.
    const sm = smokeRef.current;
    if (sm) {
      const clk = state.clock.elapsedTime;
      const kids = sm.children;
      for (let i = 0; i < kids.length; i++) {
        const sp = kids[i] as Sprite;
        const life = (clk * 0.4 + i / WISP_COUNT) % 1;
        const env = Math.sin(life * Math.PI); // 0 → 1 → 0 across the life
        sp.position.set(
          m * Math.sin(life * 4.2 + i * 1.7) * 0.07, // lateral curl
          0.02 + life * 0.26, // rises off the wrist
          0.05 + life * 0.52, // trails back into the column
        );
        sp.scale.setScalar(0.2 + life * 0.7); // expands as it climbs
        const mat = sp.material as SpriteMaterial;
        mat.opacity = pose.opacity * env * 0.5;
        mat.rotation = life * 1.5 + i; // slow turbulent spin
      }
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <group ref={solidsRef}>
        {/* Palm aura — the soft ghost glow, like GhostHand's halo. */}
        <sprite
          position={[0, 0.01, -0.04]}
          scale={[0.6, 0.6, 0.6]}
          userData={{ opacityScale: 0.5 }}
        >
          <spriteMaterial
            map={glow}
            color={color}
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>

        {/* Palm — a flattened dome, not a brick. */}
        <mesh scale={[1.05, 0.42, 0.82]}>
          <sphereGeometry args={[0.15, 18, 14]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>

        {/* Wrist knuckle that melts back toward the smoke. */}
        <mesh position={[0, -0.005, 0.07]} scale={[0.95, 0.45, 1.0]}>
          <sphereGeometry args={[0.1, 14, 12]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>

        {/* Fingers — tapering capsules, fanned and curled forward. */}
        {FINGERS.map((f, i) => (
          <mesh key={i} position={[m * f.x, 0.0, -0.16]} rotation={[f.curl, m * f.splay, 0]}>
            <capsuleGeometry args={[0.022, f.len, 4, 10]} />
            <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
          </mesh>
        ))}

        {/* Thumb — a thicker capsule angled out from the side. */}
        <mesh position={[m * 0.14, -0.01, 0.0]} rotation={[-1.3, m * 0.4, m * 0.85]}>
          <capsuleGeometry args={[0.027, 0.05, 4, 10]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>
      </group>

      {/* Smoke plume — animated each frame in useFrame above. */}
      <group ref={smokeRef}>
        {Array.from({ length: WISP_COUNT }).map((_, i) => (
          <sprite key={i}>
            <spriteMaterial
              map={smokeTex}
              color={color}
              transparent
              opacity={0}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
}
