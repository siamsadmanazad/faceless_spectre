import { Schema, type, MapSchema } from '@colyseus/schema';
import { PlayerSchema } from './PlayerSchema';
import { CardSchema } from './CardSchema';

export class RoomStateSchema extends Schema {
  @type('string') phase: string = 'lobby';
  @type('number') deckSize: number = 0;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: CardSchema }) cards = new MapSchema<CardSchema>();
}
