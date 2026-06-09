'use client';

import { useEffect, useState } from 'react';

/**
 * Single source of truth for whether the game tab is currently active/visible.
 *
 * Everything that costs CPU/GPU/network — the WebGL render loop, per-frame
 * presence, and voice — gates on this so a backgrounded tab consumes nothing.
 * Backed by the Page Visibility API, which fires on tab switch, window
 * minimize, and screen lock. (Switching to another *app* while this tab stays
 * the foreground tab does NOT hide it — that's intentional; "active tab" is the
 * contract, and tying it to window focus would pause the game every time the
 * user clicks devtools or the address bar.)
 *
 * SSR-safe: starts `true` and re-syncs on mount, so the server-rendered markup
 * (which has no `document`) matches the first client paint.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return visible;
}
