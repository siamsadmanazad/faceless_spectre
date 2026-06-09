'use client';

import { Component, Suspense, type ReactNode } from 'react';
import { Environment } from '@react-three/drei';

/**
 * Renders nothing if its children throw — used to keep an optional, network-dependent
 * resource (the HDR environment map) from crashing the surrounding scene.
 */
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Image-based lighting from a drei preset. The preset HDR is fetched from a CDN,
 * so it must never block or crash the rest of the table when offline / unreachable.
 * It lives in its own Suspense + error boundary; the scene's explicit lights keep
 * cards visible whether or not this ever loads.
 */
export function SafeEnvironment() {
  return (
    <SilentBoundary>
      <Suspense fallback={null}>
        <Environment preset="apartment" />
      </Suspense>
    </SilentBoundary>
  );
}
