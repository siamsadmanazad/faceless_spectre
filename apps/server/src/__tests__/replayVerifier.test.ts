import { describe, it, expect } from 'vitest';
import type { DeckHistoryEntry } from '@faceless-spectre/shared';
import { STANDARD_DECK } from '@faceless-spectre/shared';
import { hashOrder, seededFisherYates, shuffleDeck, generateSeed } from '../engine/shuffle';
import { verifyReplay } from '../engine/replayVerifier';
import { DeckTruth } from '../engine/DeckTruth';

const CARD_IDS = STANDARD_DECK.map(({ rank, suit }) => `${rank}${suit}`);

// ── seededFisherYates ─────────────────────────────────────────────────────────

describe('seededFisherYates', () => {
  it('is deterministic — same seed + input always produces same output', () => {
    const seed = generateSeed();
    const a = seededFisherYates([...CARD_IDS], seed);
    const b = seededFisherYates([...CARD_IDS], seed);
    expect(a).toEqual(b);
  });

  it('different seeds produce different results', () => {
    const a = seededFisherYates([...CARD_IDS], generateSeed());
    const b = seededFisherYates([...CARD_IDS], generateSeed());
    expect(a.join(',')).not.toBe(b.join(','));
  });

  it('output is a valid permutation — same cards, same count', () => {
    const result = seededFisherYates([...CARD_IDS], generateSeed());
    expect(result.length).toBe(52);
    expect(new Set(result).size).toBe(52);
    expect(result.sort()).toEqual([...CARD_IDS].sort());
  });

  it('never calls Math.random', () => {
    const original = Math.random;
    let called = false;
    Math.random = () => { called = true; return original(); };
    try {
      seededFisherYates([...CARD_IDS], generateSeed());
    } finally {
      Math.random = original;
    }
    expect(called).toBe(false);
  });
});

// ── shuffleDeck determinism ───────────────────────────────────────────────────

describe('shuffleDeck seeded determinism', () => {
  it('the logged seed reproduces the exact shuffle result', () => {
    const deck = new DeckTruth();
    const originalOrder = [...CARD_IDS];
    deck.order = [...originalOrder];
    shuffleDeck(deck, 'test-actor');

    const entry = deck.history[0];
    expect(entry.action).toBe('shuffle');
    expect(entry.seed).toBeDefined();

    const replayed = seededFisherYates([...originalOrder], entry.seed!);
    expect(replayed).toEqual(deck.order);
  });
});

// ── verifyReplay ──────────────────────────────────────────────────────────────

function makeValidHistory(): DeckHistoryEntry[] {
  const initial = [...CARD_IDS];
  const seed = generateSeed();
  const afterShuffle = seededFisherYates([...initial], seed);
  const drawn = [afterShuffle[0], afterShuffle[1]];
  const afterDraw = afterShuffle.slice(2);
  const cutAt = 10;
  const afterCut = [...afterDraw.slice(cutAt), ...afterDraw.slice(0, cutAt)];
  const dealt = [afterCut[0], afterCut[1], afterCut[2]];
  const afterDeal = afterCut.slice(3);

  return [
    {
      timestamp: 1000,
      actor: 'system',
      action: 'create',
      initialOrder: initial,
      beforeHash: '',
      afterHash: hashOrder(initial),
    },
    {
      timestamp: 2000,
      actor: 'p1',
      action: 'shuffle',
      seed,
      beforeHash: hashOrder(initial),
      afterHash: hashOrder(afterShuffle),
    },
    {
      timestamp: 3000,
      actor: 'p1',
      action: 'draw',
      cardIds: drawn,
      beforeHash: hashOrder(afterShuffle),
      afterHash: hashOrder(afterDraw),
    },
    {
      timestamp: 4000,
      actor: 'p1',
      action: 'cut',
      cutAt,
      beforeHash: hashOrder(afterDraw),
      afterHash: hashOrder(afterCut),
    },
    {
      timestamp: 5000,
      actor: 'p1',
      action: 'deal',
      cardIds: dealt,
      beforeHash: hashOrder(afterCut),
      afterHash: hashOrder(afterDeal),
    },
  ];
}

describe('verifyReplay', () => {
  it('returns valid: true for a correct history', () => {
    const result = verifyReplay(makeValidHistory());
    expect(result.valid).toBe(true);
    expect(result.failedAt).toBeNull();
  });

  it('returns valid: true for empty history', () => {
    expect(verifyReplay([])).toEqual({ valid: true, failedAt: null });
  });

  it('catches a tampered afterHash', () => {
    const history = makeValidHistory();
    history[2].afterHash = 'deadbeef'.repeat(8); // corrupt draw entry
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(2);
  });

  it('catches a tampered beforeHash mid-chain', () => {
    const history = makeValidHistory();
    history[3].beforeHash = 'cafebabe'.repeat(8); // corrupt cut entry beforeHash
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(3);
  });

  it('catches a shuffle entry missing its seed', () => {
    const history = makeValidHistory();
    delete (history[1] as Partial<DeckHistoryEntry>).seed;
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
  });

  it('catches a cut entry missing cutAt', () => {
    const history = makeValidHistory();
    delete (history[3] as Partial<DeckHistoryEntry>).cutAt;
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(3);
  });

  it('catches a draw entry missing cardIds', () => {
    const history = makeValidHistory();
    delete (history[2] as Partial<DeckHistoryEntry>).cardIds;
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(2);
  });

  it('rejects a history that does not start with create+initialOrder', () => {
    const history = makeValidHistory();
    history[0] = { ...history[0], action: 'shuffle' } as DeckHistoryEntry;
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(0);
  });

  it('catches a tampered shuffle that changes the resulting order', () => {
    const history = makeValidHistory();
    // Flip two cards in the shuffle afterHash to simulate server-side manipulation
    history[1].afterHash = hashOrder(['ZZ', ...CARD_IDS.slice(1)]); // impossible hash
    const result = verifyReplay(history);
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
  });
});
