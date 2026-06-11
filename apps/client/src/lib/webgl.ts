'use client';

/** True if the browser can create a WebGL context (the 3D scene needs it). */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return true; // assume yes during SSR
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}
