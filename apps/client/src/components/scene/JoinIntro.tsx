'use client';

import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';

interface JoinIntroProps {
  /** Final seated pose to arrive at (matches CameraHome's home). */
  homePosition?: [number, number, number];
  homeTarget?: [number, number, number];
  /** Where the descent begins — high and far, looking down at the table. */
  startPosition?: [number, number, number];
  durationMs?: number;
  /** Fired once the camera has settled into the home pose. */
  onDone: () => void;
}

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * The join cinematic's camera move: a smooth eased descent from high above the
 * table down into the seated view. Drives the camera directly each frame
 * (OrbitControls is disabled during the intro) and calls onDone when it lands.
 */
export function JoinIntro({
  homePosition = [0, 5, 7],
  homeTarget = [0, 0.3, 0],
  startPosition = [0, 10, 12],
  durationMs = 2800,
  onDone,
}: JoinIntroProps) {
  const { camera } = useThree();
  const start = useRef(new Vector3(...startPosition));
  const end = useRef(new Vector3(...homePosition));
  const target = useRef(new Vector3(...homeTarget));
  const t0 = useRef<number | null>(null);
  const done = useRef(false);

  useEffect(() => {
    camera.position.copy(start.current);
    camera.lookAt(target.current);
  }, [camera]);

  useFrame(() => {
    if (done.current) return;
    if (t0.current === null) t0.current = performance.now();
    const t = Math.min(1, (performance.now() - t0.current) / durationMs);
    const k = easeInOutCubic(t);
    camera.position.lerpVectors(start.current, end.current, k);
    camera.lookAt(target.current);
    if (t >= 1) {
      done.current = true;
      onDone();
    }
  });

  return null;
}
