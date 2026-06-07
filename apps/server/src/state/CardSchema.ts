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
  @type('number') position: number = 0;
  @type('string') zoneId: string = '';

  /**
   * rank and suit are filtered per-viewer: sent only to clients entitled to see the face.
   * Unauthorized clients receive the empty-string default — treat as card back.
   */
  @filter(canSeeCardFace)
  @type('string') rank: string = '';

  @filter(canSeeCardFace)
  @type('string') suit: string = '';
}
