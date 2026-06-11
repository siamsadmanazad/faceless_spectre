'use client';

import { useMemo, useRef } from 'react';
import { Group, Mesh, Material } from 'three';
import { useFrame } from '@react-three/fiber';
import { getHandMatcap } from '../../theme/matcaps';
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
 * Reuses the GhostHand look (matcap palm + finger stubs, no mask — these read
 * as working hands, not presence). Rendered inside DeckStack's actor-facing
 * group, so the plan's hand poses (+z toward the shuffler) apply directly.
 * Purely cosmetic and presence-independent: every client sees the same script.
 */
export function DealerHands({ plan, startedAt, color }: DealerHandsProps) {
  const leftRef = useRef<Group>(null);
  const rightRef = useRef<Group>(null);
  const pose = useMemo(() => createHandPose(), []);

  useFrame(() => {
    const t = (Date.now() - startedAt) / plan.durationMs;
    const rigs: Array<[HandRole, Group | null]> = [
      ['left', leftRef.current],
      ['right', rightRef.current],
    ];
    for (const [role, g] of rigs) {
      if (!g) continue;
      plan.handPose(role, t, pose);
      if (pose.opacity <= 0.001 || t < 0 || t > 1) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(pose.x, pose.y, pose.z);
      g.rotation.set(pose.pitch, pose.yaw, pose.roll);
      g.traverse((obj) => {
        const mesh = obj as Mesh;
        const mat = mesh.material as Material | undefined;
        if (mat && 'opacity' in mat) mat.opacity = pose.opacity;
      });
    }
  });

  return (
    <>
      <DealerHand groupRef={leftRef} color={color} mirror />
      <DealerHand groupRef={rightRef} color={color} />
    </>
  );
}

interface DealerHandProps {
  groupRef: React.RefObject<Group>;
  color: string;
  /** Mirror across X for the left hand (thumb on the other side). */
  mirror?: boolean;
}

function DealerHand({ groupRef, color, mirror = false }: DealerHandProps) {
  const handMatcap = useMemo(() => getHandMatcap(color), [color]);
  const m = mirror ? -1 : 1;

  return (
    <group ref={groupRef} visible={false}>
      {/* Palm */}
      <mesh>
        <boxGeometry args={[0.3, 0.08, 0.22]} />
        <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
      </mesh>

      {/* Finger stubs */}
      {[-0.1, -0.033, 0.033, 0.1].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.02, -0.14]}>
          <boxGeometry args={[0.055, 0.06, 0.1]} />
          <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
        </mesh>
      ))}

      {/* Thumb */}
      <mesh position={[m * 0.17, 0.02, 0.02]} rotation={[0, 0, (m * Math.PI) / 4]}>
        <boxGeometry args={[0.055, 0.09, 0.06]} />
        <meshMatcapMaterial matcap={handMatcap} transparent opacity={0} />
      </mesh>
    </group>
  );
}
