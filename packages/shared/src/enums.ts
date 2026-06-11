export enum Suit {
  Spades = 'S',
  Hearts = 'H',
  Diamonds = 'D',
  Clubs = 'C',
}

export enum Rank {
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Ace = 'A',
}

export enum Visibility {
  Hidden = 'HIDDEN',
  OwnerOnly = 'OWNER_ONLY',
  Public = 'PUBLIC',
}

export enum CardState {
  Deck = 'DECK',
  Drawn = 'DRAWN',
  Hand = 'HAND',
  Selected = 'SELECTED',
  Moving = 'MOVING',
  Placed = 'PLACED',
  Revealed = 'REVEALED',
}

export enum HandState {
  Idle = 'idle',
  Hover = 'hover',
  Grab = 'grab',
  Thinking = 'thinking',
  Reveal = 'reveal',
}

export enum ShuffleStyle {
  Overhand = 'overhand',
  Riffle = 'riffle',
  Wash = 'wash',
  Split = 'split',
  Casino = 'casino',
}

export enum ShuffleIntensity {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum AnimationType {
  Draw = 'DRAW',
  Place = 'PLACE',
  Shuffle = 'SHUFFLE',
  Deal = 'DEAL',
  Flip = 'FLIP',
  Move = 'MOVE',
  Fan = 'FAN',
}

export enum RoomMode {
  Public = 'public',
  Private = 'private',
}

export enum IntentType {
  Grab = 'grab',
  Release = 'release',
  Draw = 'draw',
  MultiDraw = 'multiDraw',
  Cut = 'cut',
  Shuffle = 'shuffle',
  Deal = 'deal',
  Gesture = 'gesture',
  Place = 'place',
  Reveal = 'reveal',
  Chat = 'chat',
  Presence = 'presence',
  SetBackfill = 'setBackfill',
  BackfillVote = 'backfillVote',
  LockTable = 'lockTable',
  Kick = 'kick',
  WebRTCOffer = 'webrtcOffer',
  WebRTCAnswer = 'webrtcAnswer',
  WebRTCIce = 'webrtcIce',
}

export enum ServerMessageType {
  StateUpdate = 'stateUpdate',
  AnimationCommand = 'animationCommand',
  Error = 'error',
  Presence = 'presence',
  Chat = 'chat',
  WebRTCOffer = 'webrtcOffer',
  WebRTCAnswer = 'webrtcAnswer',
  WebRTCIce = 'webrtcIce',
}

export enum ErrorCode {
  NotYourCard = 'NOT_YOUR_CARD',
  EmptyDeck = 'EMPTY_DECK',
  IllegalTransition = 'ILLEGAL_TRANSITION',
  InvalidSeat = 'INVALID_SEAT',
  RoomFull = 'ROOM_FULL',
  UnknownCard = 'UNKNOWN_CARD',
  RateLimited = 'RATE_LIMITED',
  UnknownIntent = 'UNKNOWN_INTENT',
  NotHost = 'NOT_HOST',
}
