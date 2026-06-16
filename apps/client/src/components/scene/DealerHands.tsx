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

// Overall hand size knob — applied as a uniform group scale, on top of the
// (also enlarged) local geometry below. Bigger hands need their per-phase
// keyframe offsets re-fit (see choreography.ts handPose) so they still frame
// the deck without clipping — that re-fit is a separate, dedicated pass.
const HAND_SCALE = 1.5;

// Fingers point toward -z (away from the wrist); the wrist boils into smoke
// toward +z. Lengths vary so the silhouette reads as a relaxed hand, not a comb.
const FINGERS: Array<{ x: number; len: number; curl: number; splay: number }> = [
  { x: -0.095, len: 0.094, curl: -1.78, splay: 0.34 }, // index
  { x: -0.035, len: 0.116, curl: -1.86, splay: 0.12 }, // middle (longest)
  { x: 0.035, len: 0.105, curl: -1.86, splay: -0.1 }, // ring
  { x: 0.095, len: 0.077, curl: -1.74, splay: -0.32 }, // pinky (shortest)
];

const WISP_COUNT = 11;

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
        const life = (clk * 0.36 + i / WISP_COUNT) % 1;
        const env = Math.sin(life * Math.PI); // 0 → 1 → 0 across the life
        sp.position.set(
          m * Math.sin(life * 4.6 + i * 1.7) * 0.095, // lateral curl
          0.02 + life * 0.34, // rises off the wrist
          0.08 + life * 0.6, // trails back into the column, past the forearm stub
        );
        sp.scale.setScalar(0.22 + life * 0.85); // expands as it climbs
        const mat = sp.material as SpriteMaterial;
        mat.opacity = pose.opacity * env * 0.55;
        mat.rotation = life * 1.8 + i; // slow turbulent spin
      }
    }
  });

  return (
    <group ref={groupRef} visible={false} scale={HAND_SCALE}>
      <group ref={solidsRef}>
        {/* Palm aura — the soft ghost glow, like GhostHand's halo. */}
        <sprite
          position={[0, 0.012, -0.045]}
          scale={[0.74, 0.74, 0.74]}
          userData={{ opacityScale: 0.56 }}
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

        {/* Palm — a flattened dome, not a brick. Slightly fuller (less flat)
            than before so it carries more presence at the larger scale. */}
        <mesh scale={[1.1, 0.46, 0.86]}>
          <sphereGeometry args={[0.15, 18, 14]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>

        {/* Palm taper — a narrower lobe toward the fingers so the palm reads
            as a contoured shape (wide at the wrist, narrowing forward)
            rather than a uniform dome. */}
        <mesh position={[0, 0.0, -0.1]} scale={[0.84, 0.4, 0.62]}>
          <sphereGeometry args={[0.15, 16, 12]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>

        {/* Wrist knuckle that melts back toward the smoke. */}
        <mesh position={[0, -0.006, 0.078]} scale={[0.98, 0.48, 1.03]}>
          <sphereGeometry args={[0.1, 14, 12]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>

        {/* Forearm stub — bridges the wrist into the smoke column, already
            more translucent than the solid hand to read as dissolving. */}
        <mesh
          position={[0, -0.004, 0.155]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0.78, 1, 0.78]}
          userData={{ opacityScale: 0.45 }}
        >
          <capsuleGeometry args={[0.082, 0.1, 4, 10]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>

        {/* Fingers — two-segment capsules (knuckle + tip joint) fanned and
            curled forward, so each finger reads with a real bend instead of
            a single rigid rod. Thicker radius than before so they read as
            fingers, not wires, at scale. */}
        {FINGERS.map((f, i) => {
          const proxLen = f.len * 0.56;
          const distLen = f.len * 0.44;
          return (
            <group key={i} position={[m * f.x, 0.0, -0.13]} rotation={[f.curl, m * f.splay, 0]}>
              {/* Proximal segment — knuckle to mid-joint. */}
              <mesh position={[0, -proxLen / 2, 0]}>
                <capsuleGeometry args={[0.027, proxLen, 4, 10]} />
                <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
              </mesh>
              {/* Distal segment — a subtle inward fold gives the fingertip a
                  real joint rather than a straight taper. */}
              <group position={[0, -proxLen, 0]} rotation={[-0.32, 0, 0]}>
                <mesh position={[0, -distLen / 2, 0]}>
                  <capsuleGeometry args={[0.0235, distLen, 4, 10]} />
                  <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
                </mesh>
              </group>
            </group>
          );
        })}

        {/* Thumb — a thicker capsule angled out from the side. */}
        <mesh position={[m * 0.155, -0.01, 0.0]} rotation={[-1.3, m * 0.4, m * 0.85]}>
          <capsuleGeometry args={[0.033, 0.058, 4, 10]} />
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
