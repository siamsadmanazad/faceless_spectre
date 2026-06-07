export interface DeckHistoryEntry {
  timestamp: number;
  actor: string;
  action: 'create' | 'shuffle' | 'deal' | 'draw' | 'cut';
  seed?: string;
  beforeHash: string;
  afterHash: string;
}

/** Server-only deck state — never serialized or sent to any client. */
export class DeckTruth {
  /** Ordered list of card IDs. Index 0 is the top of the deck. */
  order: string[] = [];
  seed: string | null = null;
  history: DeckHistoryEntry[] = [];
}
