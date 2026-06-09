import { describe, it, expect } from 'vitest';
import { CardState } from '@faceless-spectre/shared';
import { assertLegalTransition, isLegalTransition } from '../engine/stateMachine';

describe('card state machine — legal transitions', () => {
  const legalPaths: [string, string][] = [
    [CardState.Deck, CardState.Drawn],
    [CardState.Drawn, CardState.Hand],
    [CardState.Drawn, CardState.Placed],
    [CardState.Hand, CardState.Selected],
    [CardState.Hand, CardState.Placed],
    [CardState.Selected, CardState.Moving],
    [CardState.Selected, CardState.Hand],
    [CardState.Selected, CardState.Placed],
    [CardState.Moving, CardState.Placed],
    [CardState.Moving, CardState.Hand],
    [CardState.Placed, CardState.Selected],
    [CardState.Placed, CardState.Revealed],
    [CardState.Revealed, CardState.Selected],
  ];

  legalPaths.forEach(([from, to]) => {
    it(`allows ${from} → ${to}`, () => {
      expect(isLegalTransition(from, to)).toBe(true);
    });
  });
});

describe('card state machine — illegal transitions', () => {
  const illegalPaths: [string, string][] = [
    [CardState.Deck, CardState.Hand],
    [CardState.Deck, CardState.Placed],
    [CardState.Drawn, CardState.Deck],
    [CardState.Hand, CardState.Deck],
    [CardState.Hand, CardState.Drawn],
    [CardState.Revealed, CardState.Deck],
    [CardState.Placed, CardState.Deck],
    ['NONEXISTENT', CardState.Drawn],
  ];

  illegalPaths.forEach(([from, to]) => {
    it(`rejects ${from} → ${to}`, () => {
      expect(isLegalTransition(from, to)).toBe(false);
    });
  });
});

describe('assertLegalTransition', () => {
  it('does not throw on a legal transition', () => {
    expect(() => assertLegalTransition(CardState.Deck, CardState.Drawn, 'test-card')).not.toThrow();
  });

  it('throws on an illegal transition', () => {
    expect(() => assertLegalTransition(CardState.Deck, CardState.Hand, 'test-card')).toThrow();
  });
});
