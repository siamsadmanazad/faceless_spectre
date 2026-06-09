import type { DeckHistoryEntry } from '@faceless-spectre/shared';
import { pgPool } from '../db';

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

  async persist(roomId: string): Promise<void> {
    const audit = this.store.get(roomId);
    if (!audit) return;
    await pgPool.query(
      `INSERT INTO room_audits (room_id, history, rejected_intents, finalized_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (room_id) DO UPDATE
         SET history = EXCLUDED.history,
             rejected_intents = EXCLUDED.rejected_intents,
             finalized_at = EXCLUDED.finalized_at`,
      [roomId, JSON.stringify(audit.history), JSON.stringify(audit.rejectedIntents)],
    );
  }
}

export const auditStore = new AuditStore();
