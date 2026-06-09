'use client';

import { useMemo } from 'react';
import { Raycaster } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { HandState, type HandPresence } from '@faceless-spectre/shared';

interface LocalPresenceSenderProps {
  sendPresence: (hand: HandPresence, maskId: string) => void;
  maskId: string;
  selectedCardId: string | null;
}

/**
 * Invisible R3F component that lives inside <Canvas>.
 * Each frame it raycasts the pointer against the table plane (y=0.1),
 * computes the 3D hand position, and calls sendPresence (which is
 * internally throttled to PRESENCE_THROTTLE_MS = 50ms).
 */
export function LocalPresenceSender({
  sendPresence,
  maskId,
  selectedCardId,
}: LocalPresenceSenderProps) {
  const { camera, pointer } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  useFrame(() => {
    raycaster.setFromCamera(pointer, camera);
    const { origin, direction } = raycaster.ray;
    const tableY = 0.1;

    // Avoid division by nearly-zero when pointer is parallel to the table plane
    if (Math.abs(direction.y) < 0.0001) return;
    const t = (tableY - origin.y) / direction.y;
    if (t < 0) return; // pointer is aimed behind the camera

    const pos: [number, number, number] = [
      origin.x + direction.x * t,
      tableY,
      origin.z + direction.z * t,
    ];

    const handState = selectedCardId ? HandState.Grab : HandState.Idle;
    sendPresence({ position: pos, orientation: [0, 0, 0, 1], handState }, maskId);
  });

  return null;
}
