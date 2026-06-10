import { randomUUID } from 'node:crypto';
import { Room, Client, logger } from 'colyseus';
import {
  AnimationType,
  CardState,
  ErrorCode,
  IntentType,
  MAX_INTENTS_PER_SECOND,
  MAX_PRESENCE_PER_SECOND,
  MAX_SIGNALING_PER_SECOND,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PRESENCE_FLUSH_MS,
  RECONNECT_GRACE_SEC,
  RoomMode,
  SPECTATOR_SLOTS,
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
  type GrabIntent,
  type ReleaseIntent,
  type PresenceIntent,
  type SetBackfillIntent,
  type LockTableIntent,
  type KickIntent,
  type WebRTCOfferIntent,
  type WebRTCAnswerIntent,
  type WebRTCIceIntent,
} from '@faceless-spectre/shared';
import { RoomStateSchema } from '../state/RoomStateSchema';
import { CardSchema } from '../state/CardSchema';
import { PlayerSchema } from '../state/PlayerSchema';
import { DeckTruth } from '../engine/DeckTruth';
import { cutDeck, hashOrder, shuffleDeck } from '../engine/shuffle';
import { auditStore } from '../engine/AuditStore';
import { assertLegalTransition } from '../engine/stateMachine';
import {
  IntentError,
  requireCard,
  requireNonEmptyDeck,
  requireOwner,
  requireSeat,
} from '../validation/intentValidation';

/** Keep only the most recent rejected intents per room so a persistent
 *  rejecter can't grow the audit array (and its upserts) without bound. */
const MAX_REJECTED_INTENTS = 500;

export class TableRoom extends Room<RoomStateSchema> {
  maxClients = MAX_PLAYERS;

  /** Server-only deck truth — never serialized or sent to any client. */
  private deckTruth = new DeckTruth();

  /** Per-session intent rate-limit counters. Fixed-window, 1-second windows. */
  private intentCounts = new Map<string, { count: number; windowStart: number }>();

  /** Per-session counters for the non-throwing rate caps (presence, signaling). */
  private presenceCounts = new Map<string, { count: number; windowStart: number }>();
  private signalingCounts = new Map<string, { count: number; windowStart: number }>();

  /**
   * Latest presence per player, buffered and flushed on a fixed tick rather than
   * relayed per-message. Transient — never stored in synced room state.
   */
  private latestPresence = new Map<string, { hand: PresenceIntent['hand']; maskId: string }>();
  private dirtyPresence = new Set<string>();

  /** Structured record of every rejected intent for the audit trail. */
  private rejectedIntents: Array<{ timestamp: number; sessionId: string; errorCode: ErrorCode; message: string }> = [];

  /** Connected seatless observers (sessionId). Not stored in synced state. */
  private spectators = new Set<string>();

  onCreate(options?: { maxPlayers?: number; mode?: string }): void {
    const playerCap =
      options?.maxPlayers !== undefined
        ? Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Math.floor(options.maxPlayers)))
        : MAX_PLAYERS;
    // Total connections = player seats + extra spectator slots. The player cap is
    // enforced separately (nextAvailableSeat), so spectators never take a seat.
    this.maxClients = playerCap + SPECTATOR_SLOTS;
    this.setState(new RoomStateSchema());
    this.state.maxPlayers = playerCap;

    this.state.mode = options?.mode === RoomMode.Private ? RoomMode.Private : RoomMode.Public;
    this.refreshDiscovery();

    this.initDeck();
    this.registerIntentHandlers();
    // Aggregate presence: one broadcast per tick carrying every player whose hand
    // moved since the last flush. Idle rooms send nothing.
    this.setSimulationInterval(() => this.flushPresence(), PRESENCE_FLUSH_MS);
    logger.info(`[TableRoom] room ${this.roomId} created (max ${this.maxClients} players)`);
  }

  onJoin(client: Client, options?: { displayName?: string; maskId?: string; clientId?: string; spectate?: boolean }): void {
    const clientId = options?.clientId ?? '';

    // Spectators get no seat — they only observe. The visibility @filter already
    // hides every hand/deck face from them (they own nothing), and requireSeat
    // blocks all card/host intents. They can join even a full table.
    if (options?.spectate) {
      this.spectators.add(client.sessionId);
      this.state.spectatorCount = this.spectators.size;
      logger.info(`[TableRoom] spectator joined room ${this.roomId}`);
      return;
    }

    // If this device held a seat that's still in its grace window, reclaim it
    // (seat + cards) instead of taking a new one.
    if (clientId && this.tryReclaimSeat(client, clientId)) return;

    const seat = this.nextAvailableSeat();
    if (seat === -1) {
      throw new Error(ErrorCode.RoomFull);
    }

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.clientId = clientId;
    player.displayName = options?.displayName ?? `Player ${seat + 1}`;
    player.seat = seat;
    player.maskId = options?.maskId ?? 'faceless';
    player.connected = true;
    player.handSize = 0;

    this.state.players.set(client.sessionId, player);

    // First joiner is the host.
    if (this.state.hostId === '') this.state.hostId = client.sessionId;

    // Recompute matchmaking visibility (a full table drops out of Quick Play and
    // the browse list, but stays joinable by id for spectators and reclaimers).
    this.refreshDiscovery();

    logger.info(`[TableRoom] ${player.displayName} joined room ${this.roomId} at seat ${seat}`);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    this.intentCounts.delete(client.sessionId);
    this.presenceCounts.delete(client.sessionId);
    this.signalingCounts.delete(client.sessionId);
    this.latestPresence.delete(client.sessionId);
    this.dirtyPresence.delete(client.sessionId);

    // A spectator leaving has no seat, cards, or ghost hand to clean up.
    if (this.spectators.has(client.sessionId)) {
      this.spectators.delete(client.sessionId);
      this.state.spectatorCount = this.spectators.size;
      return;
    }

    // Clear ghost hand for this player on all remaining clients
    this.broadcast(ServerMessageType.Presence, {
      type: ServerMessageType.Presence,
      presences: [{ playerId: client.sessionId, hand: null, maskId: '' }],
    });

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (consented) {
      logger.info(`[TableRoom] ${player.displayName} left room ${this.roomId}`);
      this.removePlayer(client.sessionId);
      return;
    }

    // Unconsented disconnect — hold the seat (and cards) for the grace window.
    // The same socket can reconnect via token; a return on a NEW socket with the
    // same clientId reclaims it in onJoin (tryReclaimSeat) while it's held here.
    player.connected = false;
    logger.info(`[TableRoom] ${player.displayName} disconnected — holding seat for ${RECONNECT_GRACE_SEC}s`);
    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SEC);
      // Resolves only for a same-socket token reconnect. If the seat was already
      // reclaimed by clientId on a new socket, it's re-keyed and this is a no-op.
      const current = this.state.players.get(client.sessionId);
      if (current) current.connected = true;
      logger.info(`[TableRoom] ${player.displayName} reconnected to room ${this.roomId}`);
    } catch {
      logger.info(`[TableRoom] ${player.displayName} reconnection timed out — removing`);
      this.removePlayer(client.sessionId);
    }
  }

  async onDispose(): Promise<void> {
    this.syncAudit();
    try {
      await auditStore.persist(this.roomId);
      // Evict from the in-memory store now that it's durable in Postgres —
      // otherwise every closed room's history accumulates in-process forever.
      // The /audit endpoint falls back to Postgres for closed rooms.
      auditStore.delete(this.roomId);
    } catch (err) {
      logger.warn(`[TableRoom] audit persist failed for room ${this.roomId}: ${err instanceof Error ? err.message : err}`);
    }
    logger.info(`[TableRoom] room ${this.roomId} disposed`);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private syncAudit(): void {
    auditStore.upsert(this.roomId, {
      roomId: this.roomId,
      history: this.deckTruth.history,
      rejectedIntents: this.rejectedIntents,
    });
  }

  /**
   * Adopt a held (disconnected) seat for a returning device. Re-keys the player
   * under the new sessionId, remaps card ownership and host, and marks them
   * connected. Returns false when there's no reclaimable seat for this clientId.
   */
  private tryReclaimSeat(client: Client, clientId: string): boolean {
    let held: PlayerSchema | undefined;
    this.state.players.forEach((p: PlayerSchema) => {
      if (!held && !p.connected && p.clientId === clientId) held = p;
    });
    if (!held) return false;

    const oldId = held.id;
    const newId = client.sessionId;
    if (oldId !== newId) {
      this.state.cards.forEach((card: CardSchema) => {
        if (card.ownerId === oldId) card.ownerId = newId;
      });
      held.id = newId;
      this.state.players.delete(oldId);
      this.state.players.set(newId, held);
      if (this.state.hostId === oldId) this.state.hostId = newId;
    }
    held.connected = true;
    logger.info(`[TableRoom] ${held.displayName} reclaimed seat ${held.seat} in room ${this.roomId}`);
    return true;
  }

  private removePlayer(sessionId: string): void {
    this.returnCardsToNobody(sessionId);
    this.state.players.delete(sessionId);

    // If the host left, pass the role to the next seated player (lowest seat).
    if (this.state.hostId === sessionId) {
      let next: PlayerSchema | undefined;
      this.state.players.forEach((p: PlayerSchema) => {
        if (!next || p.seat < next.seat) next = p;
      });
      this.state.hostId = next ? next.id : '';
    }

    // A seat freed up — re-evaluate matchmaking visibility (no-op if the host
    // explicitly locked the table).
    this.refreshDiscovery();

    this.syncAudit();
  }

  /**
   * Single authority for the room's matchmaking visibility. A host-locked table
   * stays fully private. Otherwise the room is matchmade (Quick Play) only when
   * it has a free player seat AND is public or has backfill enabled; it appears
   * in the browse list only when public. Joining by id is unaffected — spectators
   * and reclaimers can always reach a non-host-locked room.
   */
  private refreshDiscovery(): void {
    if (this.state.locked) {
      this.setPrivate(true);
      this.setMetadata({ mode: this.state.mode, browsable: false });
      return;
    }
    const playersFull = this.state.players.size >= this.state.maxPlayers;
    const matchmade = !playersFull && (this.state.mode === RoomMode.Public || this.state.allowRandomFill);
    this.setPrivate(!matchmade);
    this.setMetadata({ mode: this.state.mode, browsable: matchmade && this.state.mode === RoomMode.Public });
  }

  private initDeck(): void {
    this.deckTruth.order = [];

    STANDARD_DECK.forEach(({ rank, suit }, i) => {
      // Opaque, face-independent id. Deriving it from rank+suit would leak the
      // card's identity to every client (id is broadcast unfiltered), defeating
      // the @filter on rank/suit. The face lives only in the filtered fields.
      const id = randomUUID();
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
      initialOrder: [...this.deckTruth.order],
      beforeHash: '',
      afterHash: hashOrder(this.deckTruth.order),
    });
    this.syncAudit();
  }

  private nextAvailableSeat(): number {
    const takenSeats = new Set<number>();
    this.state.players.forEach((p: PlayerSchema) => takenSeats.add(p.seat));
    // Cap at the configured player count so spectator slots never become seats.
    for (let i = 0; i < this.state.maxPlayers; i++) {
      if (!takenSeats.has(i)) return i;
    }
    return -1;
  }

  private returnCardsToNobody(sessionId: string): void {
    this.state.cards.forEach((card: CardSchema) => {
      if (card.ownerId === sessionId) {
        const wasRevealed = card.state === CardState.Revealed;
        card.ownerId = '';
        // A face-up card stays public when its owner leaves; everything else
        // returns face-down to the table.
        card.visibility = wasRevealed ? Visibility.Public : Visibility.Hidden;
        card.state = wasRevealed ? CardState.Revealed : CardState.Placed;
        card.zoneId = 'table';
      }
    });
  }

  private rejectIntent(client: Client, code: ErrorCode, message: string): void {
    client.send(ServerMessageType.Error, { type: ServerMessageType.Error, code, message });
    logger.warn(`[TableRoom] intent rejected from ${client.sessionId}: [${code}] ${message}`);
    this.rejectedIntents.push({ timestamp: Date.now(), sessionId: client.sessionId, errorCode: code, message });
    if (this.rejectedIntents.length > MAX_REJECTED_INTENTS) {
      this.rejectedIntents.splice(0, this.rejectedIntents.length - MAX_REJECTED_INTENTS);
    }
    // Not synced to the audit store here — captured on the next deck mutation
    // and on dispose. Avoids an upsert per rejection, which is the flood path.
  }

  /**
   * Fixed-window rate limiter: at most MAX_INTENTS_PER_SECOND per session per second.
   * Accepts an optional nowFn for testing with a controlled clock.
   */
  private checkRateLimit(client: Client, nowFn: () => number = Date.now): void {
    const now = nowFn();
    const entry = this.intentCounts.get(client.sessionId);
    if (!entry || now - entry.windowStart >= 1000) {
      this.intentCounts.set(client.sessionId, { count: 1, windowStart: now });
      return;
    }
    if (entry.count >= MAX_INTENTS_PER_SECOND) {
      throw new IntentError(ErrorCode.RateLimited, `Rate limit exceeded for ${client.sessionId}`);
    }
    entry.count += 1;
  }

  /**
   * Non-throwing fixed-window rate gate for high-frequency, low-value messages
   * (presence, signaling). Returns false when the per-second cap is exceeded so
   * the caller can drop silently — never rejected/logged, to avoid amplifying a
   * flood into per-message error traffic.
   */
  private withinRate(
    counts: Map<string, { count: number; windowStart: number }>,
    sessionId: string,
    cap: number,
    now: number = Date.now(),
  ): boolean {
    const entry = counts.get(sessionId);
    if (!entry || now - entry.windowStart >= 1000) {
      counts.set(sessionId, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= cap) return false;
    entry.count += 1;
    return true;
  }

  /** Broadcast every player whose presence changed since the last flush, in one message. */
  private flushPresence(): void {
    if (this.dirtyPresence.size === 0) return;
    const presences: Array<{ playerId: string; hand: PresenceIntent['hand']; maskId: string }> = [];
    this.dirtyPresence.forEach((id) => {
      const p = this.latestPresence.get(id);
      if (p) presences.push({ playerId: id, hand: p.hand, maskId: p.maskId });
    });
    this.dirtyPresence.clear();
    if (presences.length === 0) return;
    this.broadcast(ServerMessageType.Presence, { type: ServerMessageType.Presence, presences });
  }

  // ── Intent handlers ────────────────────────────────────────────────────────

  private registerIntentHandlers(): void {
    this.onMessage(IntentType.Presence, (client, msg: PresenceIntent) => {
      this.handlePresence(client, msg);
    });

    this.onMessage(IntentType.Grab, (client, msg: GrabIntent) => {
      this.handleGrab(client, msg.cardId);
    });

    this.onMessage(IntentType.Release, (client, msg: ReleaseIntent) => {
      this.handleRelease(client, msg.cardId);
    });

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

    this.onMessage(IntentType.SetBackfill, (client, msg: SetBackfillIntent) => {
      this.handleSetBackfill(client, msg.enabled);
    });

    this.onMessage(IntentType.LockTable, (client, _msg: LockTableIntent) => {
      this.handleLockTable(client);
    });

    this.onMessage(IntentType.Kick, (client, msg: KickIntent) => {
      this.handleKick(client, msg.targetId);
    });

    this.onMessage(IntentType.WebRTCOffer, (client, msg: WebRTCOfferIntent) => {
      this.handleWebRTCOffer(client, msg);
    });

    this.onMessage(IntentType.WebRTCAnswer, (client, msg: WebRTCAnswerIntent) => {
      this.handleWebRTCAnswer(client, msg);
    });

    this.onMessage(IntentType.WebRTCIce, (client, msg: WebRTCIceIntent) => {
      this.handleWebRTCIce(client, msg);
    });

    this.onMessage('*', (client, type, _msg) => {
      logger.warn(`[TableRoom] unknown intent "${type}" from ${client.sessionId}`);
      this.rejectIntent(client, ErrorCode.UnknownIntent, `Unknown intent: ${type}`);
    });
  }

  private handlePresence(client: Client, intent: PresenceIntent): void {
    // Buffer the latest hand and mark it dirty; flushPresence() broadcasts all
    // dirty presences once per tick. An independent server-side cap drops floods
    // silently (the client also self-throttles to PRESENCE_THROTTLE_MS). Never
    // stored in synced room state.
    try {
      requireSeat(this.state.players, client.sessionId);
      if (!this.withinRate(this.presenceCounts, client.sessionId, MAX_PRESENCE_PER_SECOND)) return;
      this.latestPresence.set(client.sessionId, { hand: intent.hand, maskId: intent.maskId });
      this.dirtyPresence.add(client.sessionId);
    } catch (err) {
      if (err instanceof IntentError) this.rejectIntent(client, err.code, err.message);
      else throw err;
    }
  }

  private handleGrab(client: Client, cardId: string): void {
    try {
      this.checkRateLimit(client);
      requireSeat(this.state.players, client.sessionId);
      const card = requireCard(this.state.cards, cardId);
      // Hand cards are private — only the owner may grab.
      // Placed/Revealed cards are public to all seated players (sandbox semantics).
      if (card.state === CardState.Hand) requireOwner(card, client.sessionId);
      assertLegalTransition(card.state, CardState.Selected, cardId);
      card.ownerId = client.sessionId;
      card.state = CardState.Selected;
      card.visibility = Visibility.OwnerOnly;
      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Move,
        durationMs: 200,
        cardIds: [cardId],
      });
    } catch (err) {
      if (err instanceof IntentError) this.rejectIntent(client, err.code, err.message);
      else throw err;
    }
  }

  private handleRelease(client: Client, cardId: string): void {
    try {
      this.checkRateLimit(client);
      requireSeat(this.state.players, client.sessionId);
      const card = requireCard(this.state.cards, cardId);
      requireOwner(card, client.sessionId);
      // SELECTED → HAND or MOVING → HAND
      assertLegalTransition(card.state, CardState.Hand, cardId);
      card.state = CardState.Hand;
      this.broadcast(ServerMessageType.AnimationCommand, {
        type: ServerMessageType.AnimationCommand,
        animation: AnimationType.Move,
        durationMs: 150,
        cardIds: [cardId],
      });
    } catch (err) {
      if (err instanceof IntentError) this.rejectIntent(client, err.code, err.message);
      else throw err;
    }
  }

  private handleDraw(client: Client, count: number): void {
    try {
      this.checkRateLimit(client);
      requireSeat(this.state.players, client.sessionId);
      const safeCount = Math.min(count, this.deckTruth.order.length);
      requireNonEmptyDeck(this.deckTruth.order.length);

      // Snapshot the pre-draw order so the audit records the actual hash rather
      // than reconstructing it from the drawn ids afterward.
      const beforeHash = hashOrder(this.deckTruth.order);

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
        cardIds: drawnIds,
        beforeHash,
        afterHash: hashOrder(this.deckTruth.order),
      });
      this.syncAudit();

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
      this.checkRateLimit(client);
      requireSeat(this.state.players, client.sessionId);

      // Phase 6: pass style + intensity here once shuffleDeck() dispatches
      // per-algorithm. See docs/realistic-shuffles.md.
      shuffleDeck(this.deckTruth, client.sessionId);
      this.state.deckSize = this.deckTruth.order.length;
      this.syncAudit();

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
      this.checkRateLimit(client);
      requireSeat(this.state.players, client.sessionId);
      cutDeck(this.deckTruth, client.sessionId, cutAt);
      this.state.deckSize = this.deckTruth.order.length;
      this.syncAudit();
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
      this.checkRateLimit(client);
      requireSeat(this.state.players, client.sessionId);
      requireNonEmptyDeck(this.deckTruth.order.length);

      // Snapshot the pre-deal order for the audit (see handleDraw).
      const beforeHash = hashOrder(this.deckTruth.order);

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
        cardIds: dealtIds,
        beforeHash,
        afterHash: hashOrder(this.deckTruth.order),
      });
      this.syncAudit();

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
      this.checkRateLimit(client);
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
      this.checkRateLimit(client);
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

  // ── Host-only room controls ────────────────────────────────────────────────

  private requireHost(client: Client): void {
    if (client.sessionId !== this.state.hostId) {
      throw new IntentError(ErrorCode.NotHost, `${client.sessionId} is not the host`);
    }
  }

  private handleSetBackfill(client: Client, enabled: boolean): void {
    try {
      this.checkRateLimit(client);
      this.requireHost(client);
      // Only meaningful for private rooms; public rooms are always fillable.
      if (this.state.mode !== RoomMode.Private) return;

      this.state.allowRandomFill = enabled;
      // refreshDiscovery makes the room Quick-Play matchmade while backfill is on
      // (and a seat is free), but keeps it out of the public browse list.
      this.refreshDiscovery();
    } catch (err) {
      if (err instanceof IntentError) this.rejectIntent(client, err.code, err.message);
      else throw err;
    }
  }

  private handleLockTable(client: Client): void {
    try {
      this.checkRateLimit(client);
      this.requireHost(client);
      this.lockTable();
    } catch (err) {
      if (err instanceof IntentError) this.rejectIntent(client, err.code, err.message);
      else throw err;
    }
  }

  /** Explicit, sticky lock: no further joins (players OR spectators) and removed
   *  from matchmaking. */
  private lockTable(): void {
    this.state.locked = true;
    this.state.allowRandomFill = false;
    this.lock();
    this.refreshDiscovery();
  }

  private handleKick(client: Client, targetId: string): void {
    try {
      this.checkRateLimit(client);
      this.requireHost(client);
      if (targetId === this.state.hostId) return; // host can't kick themselves
      const target = this.clients.find((c) => c.sessionId === targetId);
      // Remove first so the ensuing onLeave finds no player and skips the
      // 30s reconnection hold — a kick is immediate and final.
      this.removePlayer(targetId);
      if (target) target.leave();
    } catch (err) {
      if (err instanceof IntentError) this.rejectIntent(client, err.code, err.message);
      else throw err;
    }
  }

  // ── WebRTC signaling relay ─────────────────────────────────────────────────

  private relaySignal(
    fromClient: Client,
    targetId: string,
    messageType: ServerMessageType,
    payload: Record<string, unknown>,
  ): void {
    // Only seated players may relay, and only within the signaling rate cap.
    // Both failures drop silently — signaling is peer-to-peer setup noise.
    if (!this.state.players.has(fromClient.sessionId)) return;
    if (!this.withinRate(this.signalingCounts, fromClient.sessionId, MAX_SIGNALING_PER_SECOND)) return;
    const target = this.clients.find((c) => c.sessionId === targetId);
    if (!target) return; // peer already left — silently drop
    target.send(messageType, { ...payload, fromId: fromClient.sessionId });
  }

  private handleWebRTCOffer(client: Client, msg: WebRTCOfferIntent): void {
    this.relaySignal(client, msg.targetId, ServerMessageType.WebRTCOffer, { sdp: msg.sdp });
  }

  private handleWebRTCAnswer(client: Client, msg: WebRTCAnswerIntent): void {
    this.relaySignal(client, msg.targetId, ServerMessageType.WebRTCAnswer, { sdp: msg.sdp });
  }

  private handleWebRTCIce(client: Client, msg: WebRTCIceIntent): void {
    this.relaySignal(client, msg.targetId, ServerMessageType.WebRTCIce, { candidate: msg.candidate });
  }
}
