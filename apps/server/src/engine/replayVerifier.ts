import type { DeckHistoryEntry } from '@faceless-spectre/shared';
import { hashOrder, seededFisherYates } from './shuffle';

export interface ReplayResult {
  valid: boolean;
  failedAt: number | null;
  reason?: string;
}

/**
 * Verifies that a DeckHistoryEntry log is internally consistent:
 * every operation is re-applied deterministically and the resulting
 * hash is compared to the recorded afterHash. Any mismatch indicates
 * the log was tampered with or was recorded incorrectly.
 *
 * The log must start with a 'create' entry containing initialOrder.
 * Shuffles must include a seed. Cuts must include cutAt.
 * Draws and deals must include cardIds.
 */
export function verifyReplay(history: DeckHistoryEntry[]): ReplayResult {
  if (history.length === 0) return { valid: true, failedAt: null };

  const createEntry = history[0];
  if (createEntry.action !== 'create' || !createEntry.initialOrder) {
    return { valid: false, failedAt: 0, reason: 'first entry must be "create" with initialOrder' };
  }

  let current = [...createEntry.initialOrder];

  if (hashOrder(current) !== createEntry.afterHash) {
    return { valid: false, failedAt: 0, reason: 'create entry afterHash mismatch' };
  }

  for (let i = 1; i < history.length; i++) {
    const entry = history[i];

    // Verify beforeHash continuity (empty string is allowed — legacy or create entry)
    if (entry.beforeHash && entry.beforeHash !== hashOrder(current)) {
      return {
        valid: false,
        failedAt: i,
        reason: `beforeHash mismatch at entry ${i} (${entry.action})`,
      };
    }

    switch (entry.action) {
      case 'shuffle': {
        if (!entry.seed) return { valid: false, failedAt: i, reason: `entry ${i}: shuffle missing seed` };
        current = seededFisherYates([...current], entry.seed);
        break;
      }
      case 'cut': {
        if (entry.cutAt === undefined) return { valid: false, failedAt: i, reason: `entry ${i}: cut missing cutAt` };
        if (entry.cutAt <= 0 || entry.cutAt >= current.length) break; // no-op (matches cutDeck guard)
        current = [...current.slice(entry.cutAt), ...current.slice(0, entry.cutAt)];
        break;
      }
      case 'draw':
      case 'deal': {
        if (!entry.cardIds) return { valid: false, failedAt: i, reason: `entry ${i}: ${entry.action} missing cardIds` };
        const removed = new Set(entry.cardIds);
        current = current.filter((id) => !removed.has(id));
        break;
      }
      case 'create':
        // A second 'create' entry would be unusual but not invalid to skip
        break;
    }

    if (hashOrder(current) !== entry.afterHash) {
      return {
        valid: false,
        failedAt: i,
        reason: `afterHash mismatch at entry ${i} (${entry.action})`,
      };
    }
  }

  return { valid: true, failedAt: null };
}
