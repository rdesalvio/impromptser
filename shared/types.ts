export type GameType = "imposter" | "spyfall" | "flip7" | "teeko";

export type Phase =
  | "LOBBY"
  | "ANSWERING"
  | "IMPOSTER_ANSWERING"
  | "REVEAL"
  | "DISCUSS"
  | "VOTING"
  | "RESULTS"
  | "ROUND"
  | "ROUND_END"
  | "GAME_OVER"
  | "DRAWING"
  | "WRITING"
  | "COMPOSING"
  | "BRACKET"
  | "CHAMPION";

export type PlayerId = string;
export type RoomCode = string;

export interface Player {
  id: PlayerId;
  name: string;
  score: number;
  connected: boolean;
  isHost: boolean;
}

export interface ChatMsg {
  id: string;
  playerId: PlayerId;
  playerName: string;
  text: string;
  ts: number;
}

export interface AnswerCard {
  ownerId: PlayerId;
  text: string;
}

export interface ImposterRoundPublic {
  promptForRealPlayers: string | null;
  answers: AnswerCard[];
  votes: Record<PlayerId, PlayerId>;
  chat: ChatMsg[];
  phaseEndsAt: number;
  imposterRevealed?: PlayerId;
  winner?: "PLAYERS" | "IMPOSTER";
  mostVotedAnswerOwnerId?: PlayerId;
  myRole?: "IMPOSTER" | "PLAYER";
  iSubmittedAnswer: boolean;
  iVoted: boolean;
  roundNumber: number;
  totalRounds: number;
  // GAME_OVER only:
  finalGameWinnerId?: PlayerId;
}

export interface SpyfallRoundPublic {
  myRole: "SPY" | "PLAYER";
  myLocation?: string;
  myLocationRole?: string;
  allLocations: string[];
  votes: Record<PlayerId, PlayerId>;
  chat: ChatMsg[];
  phaseEndsAt: number;
  iVoted: boolean;
  spyRevealed?: PlayerId;
  actualLocation?: string;
  winner?: "PLAYERS" | "SPY";
  mostVotedPlayerId?: PlayerId;
}

// ----- Flip 7 -----

export type Flip7Modifier = "+2" | "+4" | "+6" | "+8" | "+10" | "x2";
export type Flip7ActionKind = "FREEZE" | "FLIP3" | "SECOND_CHANCE";

export type Flip7Card =
  | { kind: "number"; value: number }
  | { kind: "modifier"; modifier: Flip7Modifier }
  | { kind: "action"; action: Flip7ActionKind };

export type Flip7HandStatus =
  | "ACTIVE"
  | "STAYED"
  | "FROZEN"
  | "BUSTED"
  | "FLIPPED_SEVEN";

export interface Flip7Hand {
  numbers: number[];
  modifiers: Flip7Modifier[];
  hasSecondChance: boolean;
  status: Flip7HandStatus;
  roundScore: number;
  bustedOn?: number;
}

export type Flip7Awaiting =
  | { kind: "DECISION"; playerId: PlayerId; deadline: number }
  | {
      kind: "TARGET";
      actorId: PlayerId;
      cardKind: "FREEZE" | "FLIP3" | "GIVE_SC";
      deadline: number;
    }
  | { kind: "FORCED_DRAWING"; targetId: PlayerId };

export interface Flip7Event {
  ts: number;
  text: string;
}

export interface Flip7RoundPublic {
  roundNumber: number;
  targetScore: number;
  turnOrder: PlayerId[];
  currentPlayerIndex: number;
  hands: Record<PlayerId, Flip7Hand>;
  awaiting: Flip7Awaiting;
  flipThree?: { targetId: PlayerId; remaining: number };
  deckRemaining: number;
  recentEvents: Flip7Event[];
  chat: ChatMsg[];
  // Round-end / game-over visibility:
  roundOverIn?: number;          // ms remaining before next round (ROUND_END only)
  gameWinnerId?: PlayerId;       // GAME_OVER only
}

// ----- Tee K.O. -----

export interface DrawingStroke {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export interface TeekoDrawingPublic {
  id: string;
  strokes: DrawingStroke[];
}

export interface TeekoSloganPublic {
  id: string;
  text: string;
}

export interface TeekoShirtPublic {
  id: string;
  drawing: TeekoDrawingPublic;
  slogan: TeekoSloganPublic;
}

export interface TeekoMatchupPublic {
  byeShirt?: TeekoShirtPublic;       // present only if this is a bye
  leftShirt?: TeekoShirtPublic;
  rightShirt?: TeekoShirtPublic;
  myVote?: "LEFT" | "RIGHT";         // visible to the voter only
  revealed: boolean;
  leftVotes?: number;                // populated only after reveal
  rightVotes?: number;
  winner?: "LEFT" | "RIGHT";
  // Per-viewer flags: true if I composed, drew, or wrote the slogan for this shirt.
  iContributedLeft?: boolean;
  iContributedRight?: boolean;
}

export interface TeekoRoundPublic {
  phaseEndsAt: number;
  drawing?: { mySubmitted: number; target: number };
  writing?: { mySubmitted: number; mySlogans: string[]; target: number };
  composing?: {
    myHand?: { drawings: TeekoDrawingPublic[]; slogans: TeekoSloganPublic[] };
    submitted: boolean;
    progress: { submitted: number; total: number };
  };
  bracket?: {
    currentRound: number;
    totalRounds: number;
    matchupIndex: number;
    matchupsInRound: number;
    matchup: TeekoMatchupPublic;
  };
  champion?: {
    shirt: TeekoShirtPublic;
    composerId: PlayerId;
    drawingAuthorId: PlayerId;
    sloganAuthorId: PlayerId;
  };
}

export interface RoomStatePublic {
  code: RoomCode;
  gameType: GameType;
  phase: Phase;
  players: Player[];
  hostId: PlayerId;
  myId: PlayerId;
  imposterRound?: ImposterRoundPublic;
  spyfallRound?: SpyfallRoundPublic;
  flip7Round?: Flip7RoundPublic;
  flip7TargetScore?: number;     // visible in lobby so all players see what the host picked
  teekoRound?: TeekoRoundPublic;
  imposterTotalRounds?: number;  // visible in lobby so all players see what the host picked
  minPlayers: number;
}

export const ANSWER_SECONDS = 30;
export const IMPOSTER_ANSWER_SECONDS = 30;
export const VOTING_SECONDS = 60;
export const RESULTS_SECONDS = 15;
export const REVEAL_SECONDS = 15;
export const DISCUSS_SECONDS = 360;
export const FLIP7_DECISION_SECONDS = 30;
export const FLIP7_TARGET_SECONDS = 15;
export const FLIP7_ROUND_END_SECONDS = 8;
export const FLIP7_FORCED_DRAW_MS = 700;
export const FLIP7_TARGET_SCORES = [50, 100, 200] as const;
export const FLIP7_DEFAULT_TARGET = 200;
export const FLIP7_RECENT_EVENTS = 5;
export const IMPOSTER_ROUND_OPTIONS = [3, 5, 7] as const;
export const IMPOSTER_DEFAULT_ROUNDS = 5;
export const IMPOSTER_BETWEEN_ROUNDS_SECONDS = 6;

export const MIN_PLAYERS_IMPOSTER = 4;
export const MIN_PLAYERS_SPYFALL = 3;
export const MIN_PLAYERS_FLIP7 = 3;
export const MIN_PLAYERS_TEEKO = 3;
export const MAX_PLAYERS = 10;
export const MAX_NAME_LEN = 16;
export const MAX_ANSWER_LEN = 120;
export const MAX_CHAT_LEN = 200;
export const MAX_SLOGAN_LEN = 80;
export const MAX_DRAWING_STROKES = 400;
export const MAX_DRAWING_POINTS = 8000;

export const TEEKO_DRAWING_SECONDS = 120;
export const TEEKO_WRITING_SECONDS = 90;
export const TEEKO_COMPOSING_SECONDS = 45;
export const TEEKO_MATCHUP_VOTE_SECONDS = 20;
export const TEEKO_MATCHUP_REVEAL_SECONDS = 4;
export const TEEKO_BYE_REVEAL_SECONDS = 3;
export const TEEKO_DRAWING_TARGET = 2;
export const TEEKO_SLOGAN_TARGET = 4;
export const TEEKO_HAND_DRAWINGS = 4;
export const TEEKO_HAND_SLOGANS = 4;
export const TEEKO_SHIRTS_PER_PLAYER = 2;

export interface ClientToServerEvents {
  "room:create": (
    payload: { name: string; gameType: GameType },
    ack: (res: AckCreate) => void
  ) => void;
  "room:join": (payload: { code: string; name: string }, ack: (res: AckJoin) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: string }, ack: (res: AckJoin) => void) => void;
  "game:start": () => void;
  "answer:submit": (payload: { text: string }) => void;
  "vote:cast": (payload: { targetPlayerId: string }) => void;
  "vote:call": () => void;
  "chat:send": (payload: { text: string }) => void;
  "flip7:hit": () => void;
  "flip7:stay": () => void;
  "flip7:target": (payload: { targetPlayerId: string }) => void;
  "flip7:set-target": (payload: { targetScore: number }) => void;
  "flip7:next-game": () => void;
  "imposter:set-rounds": (payload: { rounds: number }) => void;
  "imposter:next-game": () => void;
  "teeko:submit-drawing": (payload: { strokes: DrawingStroke[] }) => void;
  "teeko:submit-slogan": (payload: { text: string }) => void;
  "teeko:submit-shirts": (
    payload: { shirts: { drawingId: string; sloganId: string }[] }
  ) => void;
  "teeko:vote": (payload: { side: "LEFT" | "RIGHT" }) => void;
  "teeko:next-game": () => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomStatePublic) => void;
  "room:error": (msg: string) => void;
}

export type AckCreate =
  | { ok: true; code: RoomCode; playerId: PlayerId }
  | { ok: false; error: string };

export type AckJoin =
  | { ok: true; code: RoomCode; playerId: PlayerId }
  | { ok: false; error: string };
