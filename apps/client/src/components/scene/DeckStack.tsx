'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D, Group } from 'three';
import { useFrame } from '@react-three/fiber';
import { AnimationType } from '@faceless-spectre/shared';
import { useRoomStore } from '../../store/roomStore';
import { getBackTexture } from './cardTextures';
import { palette, SEAT_COLORS } from '../../theme/palette';
import { seatAngle } from './seating';
import { prefersReducedMotion } from '../../lib/motion';
import {
  buildShufflePlan,
  buildSettlePlan,
  createCardPose,
  restPose,
  type ShufflePlan,
} from '../../lib/shuffle/choreography';
import { DealerHands } from './DealerHands';

const CARD_W = 0.7;
const CARD_H = 1.0;
const CARD_D = 0.008;
const MAX_VISIBLE = 52;

/**
 * The face-down draw pile. One InstancedMesh for all 52 backs; during a
 * shuffle, the per-card choreography (lib/shuffle) drives every instance
 * matrix so the deck reads as *handled* — split, riffled, washed — while
 * dealer hands perform the gesture. The mesh carries only the back texture,
 * so a shuffle physically cannot leak a face.
 */
export function DeckStack() {
  const deckSize = useRoomStore((s) => s.deckSize);
  const deckAnimation = useRoomStore((s) => s.deckAnimation);
  const clearDeckAnimation = useRoomStore((s) => s.clearDeckAnimation);
  const players = useRoomStore((s) => s.players);

  const groupRef = useRef<Group>(null);
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const pose = useMemo(() => createCardPose(), []);
  const backTex = getBackTexture();

  const visibleCount = Math.min(deckSize, MAX_VISIBLE);

  // Two material groups — 4 paper edges + 2 back faces — so the stack reads as
  // a pile of cards, not a textured brick. Still just 2 instanced draw calls.
  const geometry = useMemo(() => {
    const g = new BoxGeometry(CARD_W, CARD_H, CARD_D);
    g.groups.forEach((grp, face) => {
      grp.materialIndex = face < 4 ? 0 : 1;
    });
    return g;
  }, []);

  const materials = useMemo(
    () => [
      new MeshStandardMaterial({ color: palette.paperEdge, roughness: 0.85 }),
      new MeshStandardMaterial({ map: backTex }),
    ],
    [backTex],
  );

  const isShuffle = deckAnimation?.animation === AnimationType.Shuffle;

  // Build the choreography once per shuffle. The seed is the animation start
  // time — cosmetic variation only; it cannot encode the real order because
  // this client never has it.
  const plan: ShufflePlan | null = useMemo(() => {
    if (!isShuffle || !deckAnimation || visibleCount === 0) return null;
    const seed = deckAnimation.startedAt >>> 0;
    return prefersReducedMotion()
      ? buildSettlePlan(visibleCount, seed)
      : buildShufflePlan(deckAnimation.style, deckAnimation.intensity, visibleCount, seed);
  }, [isShuffle, deckAnimation, visibleCount]);

  // Stage the shuffle toward whoever asked for it: the deck group turns to the
  // actor's seat so the choreography plays from their side of the table.
  const actorSeat =
    (deckAnimation?.actorId ? players.get(deckAnimation.actorId)?.seat : undefined) ?? 0;
  const actorYaw = seatAngle(actorSeat);
  const actorColor = SEAT_COLORS[actorSeat % SEAT_COLORS.length];

  const writeRest = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < visibleCount; i++) {
      restPose(i, pose);
      dummy.position.set(pose.x, pose.y, pose.z);
      dummy.rotation.set(-Math.PI / 2, 0, pose.yaw);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [visibleCount, dummy, pose]);

  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.count = visibleCount;
    writeRest();
  }, [visibleCount, writeRest]);

  useFrame(() => {
    const g = groupRef.current;
    const mesh = meshRef.current;
    if (!g || !mesh) return;

    if (!deckAnimation) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      return;
    }

    if (plan && isShuffle) {
      const t = Math.min(1, (Date.now() - deckAnimation.startedAt) / plan.durationMs);
      g.rotation.y = actorYaw;
      for (let i = 0; i < visibleCount; i++) {
        plan.cardPose(i, t, pose);
        dummy.position.set(pose.x, pose.y, pose.z);
        // Compose onto the face-down base: tilt pitches an edge, bank rolls
        // sideways, yaw spins flat — never enough to show a face (clamped
        // in the plan, and the mesh has no face texture anyway).
        dummy.rotation.set(-Math.PI / 2 + pose.tilt, pose.bank, pose.yaw);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (t >= 1) {
        writeRest();
        g.rotation.set(0, 0, 0);
        clearDeckAnimation();
      }
      return;
    }

    const t = Math.min(1, (Date.now() - deckAnimation.startedAt) / deckAnimation.durationMs);
    if (deckAnimation.animation === AnimationType.Deal) {
      // Deck briefly compresses as cards leave
      g.scale.y = 1 - Math.sin(t * Math.PI) * 0.12;
    }
    if (t >= 1) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      g.scale.set(1, 1, 1);
      clearDeckAnimation();
    }
  });

  if (deckSize === 0) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, materials, MAX_VISIBLE]} castShadow />
      {/* Dealer hands perform inside the same actor-facing frame as the deck. */}
      {plan && deckAnimation && (
        <DealerHands plan={plan} startedAt={deckAnimation.startedAt} color={actorColor} />
      )}
    </group>
  );
}
