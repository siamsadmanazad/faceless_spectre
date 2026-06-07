import { createHash, randomBytes } from 'node:crypto';
import { DeckHistoryEntry, DeckTruth } from './DeckTruth';

/** Generate a cryptographically random hex seed. */
export function generateSeed(): string {
  return randomBytes(32).toString('hex');
}

/** Hash an ordered deck for audit log (SHA-256 of JSON-stringified order). */
export function hashOrder(order: string[]): string {
  return createHash('sha256').update(JSON.stringify(order)).digest('hex');
}

/**
 * Fisher-Yates shuffle seeded from Node's CSPRNG.
 * Never uses Math.random.
 *
 * NOTE: Style/intensity are currently cosmetic — every style runs this same
 * algorithm. Per-style statistical models (GSR riffle, overhand, casino) are
 * specified in docs/realistic-shuffles.md and will replace the dispatch in
 * shuffleDeck() during Phase 6.
 */
export function fisherYatesShuffle(arr: string[]): string[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    // Use 4 bytes → 32-bit uint → uniform in [0, i]
    const randomValue = randomBytes(4).readUInt32BE(0);
    const j = randomValue % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function shuffleDeck(deck: DeckTruth, actorId: string): string {
  const seed = generateSeed();
  const beforeHash = hashOrder(deck.order);
  deck.order = fisherYatesShuffle(deck.order);
  const afterHash = hashOrder(deck.order);
  deck.seed = seed;

  const entry: DeckHistoryEntry = {
    timestamp: Date.now(),
    actor: actorId,
    action: 'shuffle',
    seed,
    beforeHash,
    afterHash,
  };
  deck.history.push(entry);

  return seed;
}

export function cutDeck(deck: DeckTruth, actorId: string, cutAt: number): void {
  if (cutAt <= 0 || cutAt >= deck.order.length) return;
  const beforeHash = hashOrder(deck.order);
  deck.order = [...deck.order.slice(cutAt), ...deck.order.slice(0, cutAt)];
  const afterHash = hashOrder(deck.order);

  deck.history.push({
    timestamp: Date.now(),
    actor: actorId,
    action: 'cut',
    beforeHash,
    afterHash,
  });
}
