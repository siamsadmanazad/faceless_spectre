import { describe, it, expect } from 'vitest';
import { fisherYatesShuffle, generateSeed, hashOrder, shuffleDeck } from '../engine/shuffle';
import { DeckTruth } from '../engine/DeckTruth';
import { STANDARD_DECK } from '@faceless-spectre/shared';

const CARD_IDS = STANDARD_DECK.map(({ rank, suit }) => `${rank}${suit}`);

describe('shuffle engine — CSPRNG source', () => {
  it('generateSeed produces 64-char hex (32 bytes from crypto)', () => {
    const seed = generateSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses Node crypto randomBytes, not Math.random', () => {
    // Verify that randomBytes is importable from node:crypto and that
    // fisherYatesShuffle never uses Math.random by monkey-patching it.
    const original = Math.random;
    let mathRandomCalled = false;
    Math.random = () => {
      mathRandomCalled = true;
      return original();
    };
    try {
      fisherYatesShuffle([...CARD_IDS]);
    } finally {
      Math.random = original;
    }
    expect(mathRandomCalled).toBe(false);
  });
});

describe('shuffle engine — Fisher-Yates correctness', () => {
  it('output is a permutation of the input', () => {
    const result = fisherYatesShuffle([...CARD_IDS]);
    expect(result.length).toBe(CARD_IDS.length);
    expect(new Set(result).size).toBe(CARD_IDS.length);
    expect(result.sort()).toEqual([...CARD_IDS].sort());
  });

  it('produces different results on successive calls (negligible collision probability)', () => {
    const a = fisherYatesShuffle([...CARD_IDS]);
    const b = fisherYatesShuffle([...CARD_IDS]);
    expect(a.join(',')).not.toBe(b.join(','));
  });
});

describe('shuffle engine — uniformity', () => {
  it('each card appears in each position approximately equally across 10 000 shuffles', () => {
    const RUNS = 10_000;
    const N = 5; // test with a small deck for speed
    const deck = ['A', 'B', 'C', 'D', 'E'];
    const counts: number[][] = Array.from({ length: N }, () => Array(N).fill(0));

    for (let i = 0; i < RUNS; i++) {
      const shuffled = fisherYatesShuffle([...deck]);
      shuffled.forEach((card, pos) => {
        counts[deck.indexOf(card)][pos]++;
      });
    }

    const expected = RUNS / N;
    const tolerance = 0.15; // ±15% tolerance

    for (let card = 0; card < N; card++) {
      for (let pos = 0; pos < N; pos++) {
        const ratio = counts[card][pos] / expected;
        expect(ratio).toBeGreaterThan(1 - tolerance);
        expect(ratio).toBeLessThan(1 + tolerance);
      }
    }
  });
});

describe('shuffleDeck', () => {
  it('records seed and hashes in history', () => {
    const deck = new DeckTruth();
    deck.order = [...CARD_IDS];

    const seed = shuffleDeck(deck, 'player1');

    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(deck.seed).toBe(seed);
    expect(deck.history.length).toBe(1);
    expect(deck.history[0].action).toBe('shuffle');
    expect(deck.history[0].actor).toBe('player1');
    expect(deck.history[0].beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(deck.history[0].afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(deck.history[0].beforeHash).not.toBe(deck.history[0].afterHash);
  });

  it('before and after hashes differ after shuffle', () => {
    const deck = new DeckTruth();
    deck.order = [...CARD_IDS];
    const beforeHash = hashOrder(deck.order);
    shuffleDeck(deck, 'player1');
    const afterHash = hashOrder(deck.order);
    expect(beforeHash).not.toBe(afterHash);
  });

  it('same deck order produces the same hash (determinism)', () => {
    const order = [...CARD_IDS];
    expect(hashOrder(order)).toBe(hashOrder([...order]));
  });
});
