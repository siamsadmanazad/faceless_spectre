import { Schema, type } from '@colyseus/schema';

export class PlayerSchema extends Schema {
  @type('string') id: string = '';
  @type('string') displayName: string = '';
  @type('number') seat: number = 0;
  @type('string') maskId: string = 'faceless';
  @type('boolean') connected: boolean = true;
  @type('number') handSize: number = 0;
}
