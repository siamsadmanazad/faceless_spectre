'use client';

/**
 * Module-level `prefers-reduced-motion` read with a single shared listener —
 * for hot paths (e.g. per-card animation) where a React hook per instance would
 * mean hundreds of media-query listeners. Components that re-render on change
 * should still use the `usePrefersReducedMotion` hook.
 */
let reduced = false;

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = mq.matches;
  mq.addEventListener('change', (e) => {
    reduced = e.matches;
  });
}

export function prefersReducedMotion(): boolean {
  return reduced;
}
