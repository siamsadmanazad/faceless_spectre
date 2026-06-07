import { Room, Client, logger } from 'colyseus';
import {
  AnimationType,
  CardState,
  ErrorCode,
  IntentType,
  MAX_PLAYERS,
  ServerMessageType,
  ShuffleIntensity,
  ShuffleStyle,
  STANDARD_DECK,
  Visibility,
  type DrawIntent,
  type MultiDrawIntent,
  type CutIntent,
  type ShuffleIntent,
  type PlaceIntent,
  type RevealIntent,
  type DealIntent,
} from '@phantom-table/shared';
import { RoomStateSchema } from '../state/RoomStateSchema';
import { CardSchema } from '../state/CardSchema';
import { PlayerSchema } from '../state/PlayerSchema';
import { DeckTruth } from '../engine/DeckTruth';
import { cutDeck, hashOrder, shuffleDeck } from '../engine/shuffle';
import { assertLegalTransition } from '../engine/stateMachine';
import {
  IntentError,
  requireCard,
  requireNonEmptyDeck,
  requireOwner,
  requireSeat,
} from '../validation/intentValidation';

export class TableRoom extends Room<RoomStateSchema> {
  maxClients = MAX_PLAYERS;

  /** Server-only deck truth — never serialized or sent to any client. */
  private deckTruth = new DeckTruth();

  onCreate(): void {
    this.setState(new RoomStateSchema());
    this.initDeck();
    this.registerIntentHandlers();
    logger.info(`[TableRoom] room ${this.roomId} created`);
  }

  onJoin(client: Client, options?: { displayName?: string; maskId?: string }): void {
    const seat = this.nextAvailableSeat();
    if (seat === -1) {
      throw new Error(ErrorCode.RoomFull);
    }

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.displayName = options?.displayName ?? `Player ${seat + 1}`;
    player.seat = seat;
    player.maskId = options?.maskId ?? 'faceless';
    player.connected = true;
    player.handSize = 0;

    this.state.players.set(client.sessionId, player);
    logger.info(`[TableRoom] ${player.displayName} joined room ${this.roomId} at seat ${seat}`);
  }

  onLeave(client: Client, _consented: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = false;
      logger.info(`[TableRoom] ${player.displayName} left room ${this.roomId}`);
    }
    this.state.players.delete(client.sessionId);
    this.returnCardsToNobody(client.sessionId);
  }

  onDispose(): void {
    logger.info(`[TableRoom] room ${this.roomId} disposed`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private initDeck(): void {
    this.deckTruth.order = [];

    STANDARD_DECK.forEach(({ rank, suit }, i) => {
      const id = `${rank}${suit}`;
      const card = new CardSchema();
      card.id = id;
      card.state = CardState.Deck;
      card.visibility = Visibility.Hidden;
      card.ownerId = '';
      card.position = i;
      card.zoneId = 'deck';
      card.rank = rank;
      card.suit = suit;

      this.state.cards.set(id, card);
      this.deckTruth.order.push(id);
    });

    this.state.deckSize = this.deckTruth.order.length;

    this.deckTruth.history.push({
      timestamp: Date.now(),
      actor: 'system',
      action: 'create',
      beforeHash: '',
      afterHash: hashOrder(this.deckTruth.order),
    });
  }

  private nextAvailableSeat(): number {
    const takenSeats = new Set<number>();
    this.state.players.forEach((p: PlayerSchema) => takenSeats.add(p.seat));
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!takenSeats.has(i)) return i;
    }
    return -1;
  }

  private returnCardsToNobody(sessionId: string): void {
    this.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === sessionId) {
        card.ownerId = '';
        card.visibility = Visibility.Hidden;
        card.state = CardState.Placed;
        card.zoneId = 'table';
      }
    });
  }

  private rejectIntent(client: Client, code: ErrorCode, message: string): void {
    client.send(ServerMessageType.Error, { type: ServerMessageType.Error, code, message });
    logger.warn(`[TableRoom] intent rejected from ${client.sessionId}: [${code}] ${message}`);
  }

  // ── Intent handlers ────────────────────────────────────────────────────────

  private registerIntentHandlers(): void {
    this.onMessage(IntentType.Draw, (client, _msg: DrawIntent) => {
      this.handleDraw(client, 1);
    });

    this.onMessage(IntentType.MultiDraw, (client, msg: MultiDrawIntent) => {
      this.handleDraw(client, msg.count ?? 1);
    });

    this.onMessage(IntentType.Shuffle, (client, msg: ShuffleIntent) => {
      this.handleShuffle(client, msg.style ?? ShuffleStyle.Overhand, msg.intensity ?? ShuffleIntensity.Medium);
    });

    this.onMessage(IntentType.Cut, (client, msg: CutIntent) => {
      this.handleCut(client, msg.cutAt ?? 0);
    });

    this.onMessage(IntentType.Deal, (client, msg: DealIntent) => {
      this.handleDeal(client, msg.count ?? 1, msg.seats ?? []);
    });

    this.onMessage(IntentType.Place, (client, msg: PlaceIntent) => {
      this.handlePlace(client, msg.cardId, msg.zoneId ?? 'table');
    });

    this.onMessage(IntentType.Reveal, (client, msg: RevealIntent) => {
      this.handleReveal(client, msg.cardId);
    });

    this.onMessage('*', (client, type, _msg) => {
      logger.warn(`[TableRoom] unknown intent "${type}" from ${client.sessionId}`);
      this.rejectIntent(client, ErrorCode.UnknownIntent, `Unknown intent: ${type}`);
    });
  }

  private handleDraw(client: Client, count: number): void {
    try {
      requireSeat(this.state.players, client.sessionId);
      const safeCount = Math.min(count, this.deckTruth.order.length);
      requireNonEmptyDeck(this.deckTruth.order.length);

      const drawnIds: string[] = [];
      for (let i = 0; i < safeCount; i++) {
        const cardId = this.deckTruth.order.shift()!;
        const card = this.state.cards.get(cardId)!;
        assertLegalTransition(card.state, CardState.Drawn, cardId);
        card.state = CardState.Drawn;
        assertLegalTransition(card.state, CardState.Hand, cardId);
        card.state = CardState.Hand;
        card.ownerId = client.sessionId;
        card.visibility = Visibility.OwnerOnly;
        card.zoneId = `hand:${client.sessionId}`;
        drawnIds.push(cardId);
      }

      this.state.deckSize = this.deckTruth.order.length;

      const player = this.state.players.get(client.sessionId)!;
      player.handSize += drawnIds.length;

      this.deckTruth.history.push({
        timestamp: Date.now(),
        actor: client.sessionId,
        action: 'draw',
        beforeHash: hashOrder([...drawnIds, ...this.deckTruth.order]),
        afterHash: hashOrder(this.deckTruth.order),
      });

      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Draw,
        durationMs: 400,
        cardIds: drawnIds,
      });
    } catch (err) {
      if (err instanceof IntentError) {
        this.rejectIntent(client, err.code, err.message);
      } else {
        throw err;
      }
    }
  }

  private handleShuffle(client: Client, style: ShuffleStyle, intensity: ShuffleIntensity): void {
    try {
      requireSeat(this.state.players, client.sessionId);

      shuffleDeck(this.deckTruth, client.sessionId);
      this.state.deckSize = this.deckTruth.order.length;

      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Shuffle,
        durationMs: 1200,
        cardIds: [],
        style,
        intensity,
      });
    } catch (err) {
      if (err instanceof IntentError) {
        this.rejectIntent(client, err.code, err.message);
      } else {
        throw err;
      }
    }
  }

  private handleCut(client: Client, cutAt: number): void {
    try {
      requireSeat(this.state.players, client.sessionId);
      cutDeck(this.deckTruth, client.sessionId, cutAt);
      this.state.deckSize = this.deckTruth.order.length;
    } catch (err) {
      if (err instanceof IntentError) {
        this.rejectIntent(client, err.code, err.message);
      } else {
        throw err;
      }
    }
  }

  private handleDeal(client: Client, count: number, seats: number[]): void {
    try {
      requireSeat(this.state.players, client.sessionId);
      requireNonEmptyDeck(this.deckTruth.order.length);

      const targetPlayers: PlayerSchema[] = [];
      this.state.players.forEach((p: PlayerSchema) => {
        if (seats.length === 0 || seats.includes(p.seat)) {
          targetPlayers.push(p);
        }
      });

      const dealtIds: string[] = [];

      for (let round = 0; round < count; round++) {
        for (const player of targetPlayers) {
          if (this.deckTruth.order.length === 0) break;
          const cardId = this.deckTruth.order.shift()!;
          const card = this.state.cards.get(cardId)!;
          assertLegalTransition(card.state, CardState.Drawn, cardId);
          card.state = CardState.Drawn;
          assertLegalTransition(card.state, CardState.Hand, cardId);
          card.state = CardState.Hand;
          card.ownerId = player.id;
          card.visibility = Visibility.OwnerOnly;
          card.zoneId = `hand:${player.id}`;
          player.handSize += 1;
          dealtIds.push(cardId);
        }
      }

      this.state.deckSize = this.deckTruth.order.length;

      this.deckTruth.history.push({
        timestamp: Date.now(),
        actor: client.sessionId,
        action: 'deal',
        beforeHash: '',
        afterHash: hashOrder(this.deckTruth.order),
      });

      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Deal,
        durationMs: 600,
        cardIds: dealtIds,
      });
    } catch (err) {
      if (err instanceof IntentError) {
        this.rejectIntent(client, err.code, err.message);
      } else {
        throw err;
      }
    }
  }

  private handlePlace(client: Client, cardId: string, zoneId: string): void {
    try {
      requireSeat(this.state.players, client.sessionId);
      const card = requireCard(this.state.cards, cardId);
      requireOwner(card, client.sessionId);
      assertLegalTransition(card.state, CardState.Placed, cardId);

      const wasInHand = card.state === CardState.Hand || card.state === CardState.Selected || card.state === CardState.Moving;
      card.state = CardState.Placed;
      card.zoneId = zoneId;
      card.ownerId = '';

      if (wasInHand) {
        const player = this.state.players.get(client.sessionId);
        if (player && player.handSize > 0) player.handSize -= 1;
      }

      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Place,
        durationMs: 300,
        cardIds: [cardId],
      });
    } catch (err) {
      if (err instanceof IntentError) {
        this.rejectIntent(client, err.code, err.message);
      } else {
        throw err;
      }
    }
  }

  private handleReveal(client: Client, cardId: string): void {
    try {
      requireSeat(this.state.players, client.sessionId);
      const card = requireCard(this.state.cards, cardId);
      requireOwner(card, client.sessionId);
      assertLegalTransition(card.state, CardState.Revealed, cardId);

      card.state = CardState.Revealed;
      card.visibility = Visibility.Public;

      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Flip,
        durationMs: 500,
        cardIds: [cardId],
      });
    } catch (err) {
      if (err instanceof IntentError) {
        this.rejectIntent(client, err.code, err.message);
      } else {
        throw err;
      }
    }
  }
}
