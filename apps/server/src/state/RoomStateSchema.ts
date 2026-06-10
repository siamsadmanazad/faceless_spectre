import { Schema, type, MapSchema } from '@colyseus/schema';
import { PlayerSchema } from './PlayerSchema';
import { CardSchema } from './CardSchema';

export class RoomStateSchema extends Schema {
  @type('string') phase: string = 'lobby';
  @type('number') deckSize: number = 0;
  @type('number') maxPlayers: number = 6;
  /** sessionId of the host (room creator / first joiner). */
  @type('string') hostId: string = '';
  @type('string') mode: string = 'public';
  /** Number of seatless observers currently watching. */
  @type('number') spectatorCount: number = 0;
  /** Host has opened empty seats to random fill (private rooms only). */
  @type('boolean') allowRandomFill: boolean = false;
  /** No further joins accepted (full or host-locked). */
  @type('boolean') locked: boolean = false;
  /** Live tally of an in-progress vote to open empty seats to randoms. */
  @type('boolean') backfillVoteActive: boolean = false;
  @type('number') backfillVoteYes: number = 0;
  @type('number') backfillVoteNo: number = 0;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: CardSchema }) cards = new MapSchema<CardSchema>();
}
