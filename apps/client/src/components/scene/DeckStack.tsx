'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
import {
  BoxGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Group,
  Sprite,
  SpriteMaterial,
  PerspectiveCamera,
  AdditiveBlending,
} from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { AnimationType, ShuffleStyle, type ShuffleIntensity } from '@faceless-spectre/shared';
import { useRoomStore } from '../../store/roomStore';
import { getBackTexture } from './cardTextures';
import { palette, SEAT_COLORS } from '../../theme/palette';
import { getGlowTexture, getSmokeTexture } from '../../theme/matcaps';
import { seatAngle } from './seating';
import { prefersReducedMotion } from '../../lib/motion';
import {
  buildShufflePlan,
  buildSettlePlan,
  createCardPose,
  restPose,
  type ShufflePlan,
} from '../../lib/shuffle/choreography';
import { getPhases, findPhase, phaseT } from '../../lib/shuffle/timings';
import { DealerHands } from './DealerHands';
import type { DeckAnimation } from '../../store/roomStore';

// The casino bridge finale's "dealer flex" gets two faint, budget-cheap
// flourishes — a sub-degree camera push-in (dolly via FOV, so it never
// fights OrbitControls' own position math) and a handful of glint/dust
// sprites riding the cascade. Both are gated off entirely under reduced
// motion, and both fully reset themselves once the bridge phase ends.
const FINALE_PUSH_FOV_DEG = 1.6;
const GLINT_COUNT = 5;
const DUST_COUNT = 3;

/** 0 outside the casino bridge window; rises and falls with the cascade inside it. */
function casinoBridgeEnvelope(deckAnimation: DeckAnimation, t: number): number {
  if (deckAnimation.style !== ShuffleStyle.Casino || prefersReducedMotion()) return 0;
  const bridge = findPhase(getPhases(ShuffleStyle.Casino, deckAnimation.intensity), 'bridge');
  if (!bridge || t < bridge.start || t >= bridge.end) return 0;
  return Math.sin(Math.PI * phaseT(bridge, t));
}

/** Nudges the camera's FOV by exactly the delta needed to reach `envelope`, and only then. */
function applyFinaleFov(
  camera: { fov?: number; updateProjectionMatrix?: () => void },
  appliedRef: { current: number },
  envelope: number,
): void {
  const offset = -envelope * FINALE_PUSH_FOV_DEG; // negative FOV = push in
  if (offset === appliedRef.current) return;
  const cam = camera as PerspectiveCamera;
  if (typeof cam.fov === 'number') {
    cam.fov += offset - appliedRef.current;
    cam.updateProjectionMatrix();
  }
  appliedRef.current = offset;
}

/**
 * A handful of faint glint/dust sprites riding the casino bridge cascade —
 * the deferred §9.7 accent. Visible only during the bridge phase; reuses the
 * existing glow/smoke textures (no new assets), so the cost is a few extra
 * sprites for a few hundred milliseconds per casino shuffle.
 */
function CasinoFinaleFX({
  plan,
  startedAt,
  intensity,
  color,
}: {
  plan: ShufflePlan;
  startedAt: number;
  intensity: ShuffleIntensity;
  color: string;
}) {
  const glintRef = useRef<Group>(null);
  const dustRef = useRef<Group>(null);
  const glow = useMemo(() => getGlowTexture(), []);
  const smoke = useMemo(() => getSmokeTexture(), []);
  const bridge = useMemo(
    () => findPhase(getPhases(ShuffleStyle.Casino, intensity), 'bridge'),
    [intensity],
  );

  useFrame((state) => {
    const gGlint = glintRef.current;
    const gDust = dustRef.current;
    if (!gGlint || !gDust) return;
    const t = (Date.now() - startedAt) / plan.durationMs;
    const inside = !!bridge && t >= bridge.start && t < bridge.end;
    const env = inside && bridge ? Math.sin(Math.PI * phaseT(bridge, t)) : 0;
    gGlint.visible = env > 0.01;
    gDust.visible = env > 0.01;
    if (!gGlint.visible) return;
    const clk = state.clock.elapsedTime;
    for (let i = 0; i < gGlint.children.length; i++) {
      const sp = gGlint.children[i] as Sprite;
      const twinkle = 0.5 + 0.5 * Math.sin(clk * 9 + i * 2.1);
      (sp.material as SpriteMaterial).opacity = env * twinkle * 0.4;
      sp.scale.setScalar(0.05 + twinkle * 0.025);
    }
    for (let i = 0; i < gDust.children.length; i++) {
      const sp = gDust.children[i] as Sprite;
      (sp.material as SpriteMaterial).opacity = env * 0.12;
      sp.scale.setScalar(0.35 + env * 0.15 + i * 0.05);
    }
  });

  return (
    <>
      <group ref={glintRef} visible={false}>
        {Array.from({ length: GLINT_COUNT }).map((_, i) => {
          const a = (i / (GLINT_COUNT - 1)) * Math.PI - Math.PI / 2;
          return (
            <sprite
              key={i}
              position={[Math.sin(a) * 0.5, 0.45 + Math.cos(a) * 0.12, Math.cos(a) * 0.1]}
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
          );
        })}
      </group>
      <group ref={dustRef} visible={false}>
        {Array.from({ length: DUST_COUNT }).map((_, i) => (
          <sprite key={i} position={[(i - (DUST_COUNT - 1) / 2) * 0.3, 0.4, 0.02]}>
            <spriteMaterial
              map={smoke}
              color={palette.hearth}
              transparent
              opacity={0}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        ))}
      </group>
    </>
  );
}

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
  const { camera } = useThree();
  const appliedFovOffsetRef = useRef(0);

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
      applyFinaleFov(camera, appliedFovOffsetRef, 0);
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

      // The deferred camera push-in (§9.7): a sub-degree FOV dolly during the
      // casino bridge finale only, eased in and back out with the cascade.
      applyFinaleFov(camera, appliedFovOffsetRef, casinoBridgeEnvelope(deckAnimation, t));

      if (t >= 1) {
        writeRest();
        g.rotation.set(0, 0, 0);
        clearDeckAnimation();
      }
      return;
    }

    applyFinaleFov(camera, appliedFovOffsetRef, 0);

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
      {/* Bridge-finale glint/dust accent — casino only, skipped under reduced motion. */}
      {plan && deckAnimation && isShuffle && deckAnimation.style === ShuffleStyle.Casino && !prefersReducedMotion() && (
        <CasinoFinaleFX
          plan={plan}
          startedAt={deckAnimation.startedAt}
          intensity={deckAnimation.intensity}
          color={actorColor}
        />
      )}
    </group>
  );
}
