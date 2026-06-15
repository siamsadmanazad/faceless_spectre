'use client';

// Cached once at module load — repeated calls during re-renders must not
// create new contexts because browsers cap active WebGL contexts at ~8-16.
let _webGLAvailable: boolean | null = null;

/** True if the browser can create a WebGL context (the 3D scene needs it). */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return true; // assume yes during SSR
  if (_webGLAvailable !== null) return _webGLAvailable;
  try {
    const canvas = document.createElement('canvas');
    const ctx =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    _webGLAvailable = !!(window.WebGLRenderingContext && ctx);
    // Immediately release the probe context so it doesn't count against the limit.
    ctx?.getExtension('WEBGL_lose_context')?.loseContext();
    return _webGLAvailable;
  } catch {
    _webGLAvailable = false;
    return false;
  }
}
