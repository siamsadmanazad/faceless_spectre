import { Schema, type, filter } from '@colyseus/schema';
import { Client } from 'colyseus';
import { Visibility } from '@faceless-spectre/shared';
import { RoomStateSchema } from './RoomStateSchema';

function canSeeCardFace(this: CardSchema, client: Client, _value: string, _root: RoomStateSchema): boolean {
  if (this.visibility === Visibility.Public) return true;
  if (this.visibility === Visibility.OwnerOnly) return this.ownerId === client.sessionId;
  return false;
}

export class CardSchema extends Schema {
  @type('string') id: string = '';
  @type('string') state: string = '';
  @type('string') visibility: string = Visibility.Hidden;
  @type('string') ownerId: string = '';
  @type('string') zoneId: string = '';

  /**
   * position is the card's initial deck index. Because the canonical deck order
   * is public, that index maps deterministically to a face — so it is filtered
   * exactly like rank/suit. Unauthorized viewers receive the default 0.
   */
  @filter(canSeeCardFace)
  @type('number') position: number = 0;

  /**
   * rank and suit are filtered per-viewer: sent only to clients entitled to see the face.
   * Unauthorized clients receive the empty-string default — treat as card back.
   */
  @filter(canSeeCardFace)
  @type('string') rank: string = '';

  @filter(canSeeCardFace)
  @type('string') suit: string = '';
}
