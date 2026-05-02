export type Phase =
  | "LOBBY"
  | "ANSWERING"
  | "IMPOSTER_ANSWERING"
  | "VOTING"
  | "RESULTS";

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

export interface RoundPublic {
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
}

export interface RoomStatePublic {
  code: RoomCode;
  phase: Phase;
  players: Player[];
  hostId: PlayerId;
  myId: PlayerId;
  round?: RoundPublic;
  minPlayers: number;
}

export const ANSWER_SECONDS = 30;
export const IMPOSTER_ANSWER_SECONDS = 30;
export const VOTING_SECONDS = 60;
export const RESULTS_SECONDS = 15;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;
export const MAX_NAME_LEN = 16;
export const MAX_ANSWER_LEN = 120;
export const MAX_CHAT_LEN = 200;

export interface ClientToServerEvents {
  "room:create": (payload: { name: string }, ack: (res: AckCreate) => void) => void;
  "room:join": (payload: { code: string; name: string }, ack: (res: AckJoin) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: string }, ack: (res: AckJoin) => void) => void;
  "game:start": () => void;
  "answer:submit": (payload: { text: string }) => void;
  "vote:cast": (payload: { targetPlayerId: string }) => void;
  "chat:send": (payload: { text: string }) => void;
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
