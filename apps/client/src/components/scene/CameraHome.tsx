'use client';

import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';

/** The slice of drei/three OrbitControls this controller actually touches. */
export interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

interface CameraHomeProps {
  controlsRef: React.RefObject<OrbitControlsLike | null>;
  /** Default seated camera pose to glide back to. */
  homePosition?: [number, number, number];
  homeTarget?: [number, number, number];
  /** Idle time after the last interaction before the glide begins (ms). */
  idleDelayMs?: number;
  /** When false (reduced motion), snap home instantly instead of gliding. */
  animate?: boolean;
}

/**
 * Lets players freely orbit, then smoothly returns the camera to their default
 * seated view once they stop touching it. Listens to the OrbitControls
 * start/end events; after an idle delay it damps the camera position and the
 * controls target back home each frame until both are within epsilon.
 */
export function CameraHome({
  controlsRef,
  homePosition = [0, 5, 7],
  homeTarget = [0, 0.3, 0],
  idleDelayMs = 2500,
  animate = true,
}: CameraHomeProps) {
  const { camera } = useThree();
  const interacting = useRef(false);
  const lastInteractAt = useRef(0);

  const homePos = useRef(new Vector3(...homePosition));
  const homeTgt = useRef(new Vector3(...homeTarget));

  // Attach start/end listeners to the controls once they exist.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const onStart = () => {
      interacting.current = true;
    };
    const onEnd = () => {
      interacting.current = false;
      lastInteractAt.current = performance.now();
      // Reduced motion: jump straight home when the user lets go.
      if (!animate) {
        camera.position.copy(homePos.current);
        controls.target.copy(homeTgt.current);
        controls.update();
      }
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    return () => {
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
    };
  }, [controlsRef, camera, animate]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls || !animate || interacting.current) return;
    if (performance.now() - lastInteractAt.current < idleDelayMs) return;

    const posDist = camera.position.distanceToSquared(homePos.current);
    const tgtDist = controls.target.distanceToSquared(homeTgt.current);
    if (posDist < 1e-5 && tgtDist < 1e-6) return; // already home — rest

    // Smooth, frame-rate-tolerant glide.
    camera.position.lerp(homePos.current, 0.05);
    controls.target.lerp(homeTgt.current, 0.05);
    controls.update();
  });

  return null;
}
