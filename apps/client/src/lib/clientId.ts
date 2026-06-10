/**
 * Stable per-device identity used to reclaim a held seat after a drop.
 *
 * Generated once and persisted in localStorage. This is NOT a profile or an
 * account — it's an invisible reconnection anchor so a player who reopens the
 * invite link (or refreshes after a long drop) gets their seat and cards back.
 */
const KEY = 'fs_client_id';

export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
