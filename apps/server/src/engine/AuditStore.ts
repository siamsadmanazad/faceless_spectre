import type { DeckHistoryEntry } from '@faceless-spectre/shared';

export interface RejectedIntent {
  timestamp: number;
  sessionId: string;
  errorCode: string;
  message: string;
}

export interface RoomAudit {
  roomId: string;
  history: DeckHistoryEntry[];
  rejectedIntents: RejectedIntent[];
  snapshotAt: number;
}

class AuditStore {
  private store = new Map<string, RoomAudit>();

  upsert(roomId: string, audit: Omit<RoomAudit, 'snapshotAt'>): void {
    this.store.set(roomId, { ...audit, snapshotAt: Date.now() });
  }

  get(roomId: string): RoomAudit | undefined {
    return this.store.get(roomId);
  }

  delete(roomId: string): void {
    this.store.delete(roomId);
  }

  all(): RoomAudit[] {
    return Array.from(this.store.values());
  }
}

export const auditStore = new AuditStore();
