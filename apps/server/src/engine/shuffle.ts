import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
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
 * Never uses Math.random. Kept for backward-compatibility with CSPRNG tests.
 */
export function fisherYatesShuffle(arr: string[]): string[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const randomValue = randomBytes(4).readUInt32BE(0);
    const j = randomValue % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deterministic Fisher-Yates using SHA-256 in counter mode as the PRNG.
 * Given the same seed and input array, always produces the same output —
 * making every shuffle in the audit log fully replayable.
 * Never uses Math.random or crypto.randomBytes.
 */
export function seededFisherYates(arr: string[], seed: string): string[] {
  const result = [...arr];
  const keyBytes = Buffer.from(seed, 'hex');
  let counter = 0;
  const byteBuffer: number[] = [];

  function nextUint32(): number {
    while (byteBuffer.length < 4) {
      const h = createHash('sha256');
      h.update(keyBytes);
      h.update(Buffer.from([counter >> 24, (counter >> 16) & 0xff, (counter >> 8) & 0xff, counter & 0xff]));
      byteBuffer.push(...h.digest());
      counter++;
    }
    const b = byteBuffer.splice(0, 4);
    return ((b[0] * 0x1000000) + (b[1] << 16) + (b[2] << 8) + b[3]) >>> 0;
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = nextUint32() % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function shuffleDeck(deck: DeckTruth, actorId: string): string {
  const seed = generateSeed();
  const beforeHash = hashOrder(deck.order);
  deck.order = seededFisherYates(deck.order, seed);
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
    cutAt,
    beforeHash,
    afterHash,
  });
}
