export type { DeckHistoryEntry } from '@faceless-spectre/shared';
import type { DeckHistoryEntry } from '@faceless-spectre/shared';

/** Server-only deck state — never serialized or sent to any client. */
export class DeckTruth {
  /** Ordered list of card IDs. Index 0 is the top of the deck. */
  order: string[] = [];
  seed: string | null = null;
  history: DeckHistoryEntry[] = [];
}
