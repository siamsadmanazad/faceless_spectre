import { CARD_STATE_MACHINE } from '@faceless-spectre/shared';

export function isLegalTransition(from: string, to: string): boolean {
  const allowed = CARD_STATE_MACHINE[from];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}

export function assertLegalTransition(from: string, to: string, cardId: string): void {
  if (!isLegalTransition(from, to)) {
    throw new Error(`Illegal card state transition ${from} → ${to} for card ${cardId}`);
  }
}
