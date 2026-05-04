import {
  ANSWER_SECONDS,
  DISCUSS_SECONDS,
  FLIP7_DECISION_SECONDS,
  FLIP7_DEFAULT_TARGET,
  FLIP7_FORCED_DRAW_MS,
  FLIP7_RECENT_EVENTS,
  FLIP7_ROUND_END_SECONDS,
  FLIP7_TARGET_SCORES,
  FLIP7_TARGET_SECONDS,
  IMPOSTER_ANSWER_SECONDS,
  MAX_ANSWER_LEN,
  MAX_CHAT_LEN,
  MAX_NAME_LEN,
  MAX_PLAYERS,
  MIN_PLAYERS_FLIP7,
  MIN_PLAYERS_IMPOSTER,
  MIN_PLAYERS_SPYFALL,
  RESULTS_SECONDS,
  REVEAL_SECONDS,
  VOTING_SECONDS,
} from "../../shared/types.ts";
import type {
  ChatMsg,
  Flip7Awaiting,
  Flip7Card,
  Flip7Event,
  Flip7Hand,
  Flip7Modifier,
  Flip7RoundPublic,
  GameType,
  ImposterRoundPublic,
  Phase,
  Player,
  PlayerId,
  RoomCode,
  RoomStatePublic,
  SpyfallRoundPublic,
} from "../../shared/types.ts";
import { pickRandomPrompt } from "./prompts.ts";
import { ALL_LOCATION_NAMES, pickRandomLocation } from "./locations.ts";
import { buildDeck, shuffleInPlace } from "./cards.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(taken: Set<string>): RoomCode {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code");
}

export function sanitizeName(raw: string): string {
  const trimmed = (raw ?? "").trim().slice(0, MAX_NAME_LEN);
  return trimmed || "Player";
}

export function sanitizeText(raw: string, max: number): string {
  return (raw ?? "").toString().slice(0, max);
}

export type StateChangeListener = (room: RoomBase) => void;

export abstract class RoomBase {
  abstract readonly gameType: GameType;
  abstract readonly minPlayers: number;
  code: RoomCode;
  players = new Map<PlayerId, Player>();
  hostId: PlayerId;
  phase: Phase = "LOBBY";
  protected timer?: NodeJS.Timeout;
  private listeners = new Set<StateChangeListener>();

  constructor(code: RoomCode, hostId: PlayerId) {
    this.code = code;
    this.hostId = hostId;
  }

  on(listener: StateChangeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange() {
    for (const l of this.listeners) l(this);
  }

  addPlayer(playerId: PlayerId, name: string): { ok: boolean; error?: string } {
    if (this.phase !== "LOBBY") {
      const existing = this.players.get(playerId);
      if (existing) {
        existing.connected = true;
        this.emitChange();
        return { ok: true };
      }
      return { ok: false, error: "Game already in progress" };
    }
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, error: "Room is full" };
    }
    if (this.players.has(playerId)) {
      const p = this.players.get(playerId)!;
      p.connected = true;
      p.name = sanitizeName(name);
      this.emitChange();
      return { ok: true };
    }
    this.players.set(playerId, {
      id: playerId,
      name: sanitizeName(name),
      score: 0,
      connected: true,
      isHost: playerId === this.hostId,
    });
    this.emitChange();
    return { ok: true };
  }

  reconnect(playerId: PlayerId): { ok: boolean; error?: string } {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: "Player not in room" };
    p.connected = true;
    this.emitChange();
    return { ok: true };
  }

  markDisconnected(playerId: PlayerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
    if (this.phase === "LOBBY") {
      this.players.delete(playerId);
      if (playerId === this.hostId) {
        const next = [...this.players.values()].find((pp) => pp.connected);
        if (next) {
          this.hostId = next.id;
          next.isHost = true;
        }
      }
    }
    this.emitChange();
  }

  isEmpty(): boolean {
    return [...this.players.values()].every((p) => !p.connected);
  }

  protected setPhase(phase: Phase, seconds: number, onElapsed: () => void) {
    this.phase = phase;
    this.clearTimer();
    this.timer = setTimeout(onElapsed, seconds * 1000);
    this.emitChange();
  }

  protected clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  destroy() {
    this.clearTimer();
    this.listeners.clear();
  }

  abstract startGame(by: PlayerId): { ok: boolean; error?: string };
  abstract publicStateFor(viewerId: PlayerId): RoomStatePublic;

  submitAnswer(_playerId: PlayerId, _text: string): { ok: boolean; error?: string } {
    return { ok: false, error: "Not supported in this game" };
  }
  castVote(_voterId: PlayerId, _targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    return { ok: false, error: "Not voting right now" };
  }
  callVote(_playerId: PlayerId): { ok: boolean; error?: string } {
    return { ok: false, error: "Not supported in this game" };
  }
  postChat(_playerId: PlayerId, _text: string): { ok: boolean; error?: string } {
    return { ok: false, error: "Chat not available right now" };
  }

  protected baseStateFor(
    viewerId: PlayerId
  ): Omit<RoomStatePublic, "imposterRound" | "spyfallRound"> {
    const players = [...this.players.values()].map((p) => ({ ...p }));
    return {
      code: this.code,
      gameType: this.gameType,
      phase: this.phase,
      players,
      hostId: this.hostId,
      myId: viewerId,
      minPlayers: this.minPlayers,
    };
  }

  protected returnToLobby() {
    this.phase = "LOBBY";
    this.clearTimer();
    this.emitChange();
  }
}

// ---------------- Imposter ----------------

interface ImposterRound {
  promptId: string;
  promptText: string;
  imposterId: PlayerId;
  answers: Map<PlayerId, string>;
  votes: Map<PlayerId, PlayerId>;
  chat: ChatMsg[];
  phaseEndsAt: number;
  winner?: "PLAYERS" | "IMPOSTER";
  mostVotedAnswerOwnerId?: PlayerId;
}

export class ImposterRoom extends RoomBase {
  readonly gameType = "imposter" as const;
  readonly minPlayers = MIN_PLAYERS_IMPOSTER;
  round?: ImposterRound;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    this.beginRound();
    return { ok: true };
  }

  private beginRound() {
    const connected = [...this.players.values()].filter((p) => p.connected);
    const imposter = connected[Math.floor(Math.random() * connected.length)];
    const prompt = pickRandomPrompt();
    this.round = {
      promptId: prompt.id,
      promptText: prompt.text,
      imposterId: imposter.id,
      answers: new Map(),
      votes: new Map(),
      chat: [],
      phaseEndsAt: Date.now() + ANSWER_SECONDS * 1000,
    };
    this.setPhase("ANSWERING", ANSWER_SECONDS, () => this.endAnsweringPhase());
  }

  override submitAnswer(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const trimmed = sanitizeText(text, MAX_ANSWER_LEN).trim();
    if (!trimmed) return { ok: false, error: "Answer cannot be empty" };
    const isImposter = playerId === this.round.imposterId;
    if (this.phase === "ANSWERING") {
      if (isImposter) return { ok: false, error: "Imposter answers later" };
      if (this.round.answers.has(playerId)) return { ok: false, error: "Already answered" };
      this.round.answers.set(playerId, trimmed);
      this.emitChange();
      const realPlayers = [...this.players.values()].filter(
        (p) => p.connected && p.id !== this.round!.imposterId
      );
      if (this.round.answers.size >= realPlayers.length) {
        this.endAnsweringPhase();
      }
      return { ok: true };
    }
    if (this.phase === "IMPOSTER_ANSWERING") {
      if (!isImposter) return { ok: false, error: "Only the imposter answers now" };
      if (this.round.answers.has(playerId)) return { ok: false, error: "Already answered" };
      this.round.answers.set(playerId, trimmed);
      this.emitChange();
      this.startVotingPhase();
      return { ok: true };
    }
    return { ok: false, error: "Not accepting answers right now" };
  }

  private endAnsweringPhase() {
    if (this.phase !== "ANSWERING" || !this.round) return;
    this.round.phaseEndsAt = Date.now() + IMPOSTER_ANSWER_SECONDS * 1000;
    this.setPhase("IMPOSTER_ANSWERING", IMPOSTER_ANSWER_SECONDS, () =>
      this.startVotingPhase()
    );
  }

  private startVotingPhase() {
    if (!this.round) return;
    if (!this.round.answers.has(this.round.imposterId)) {
      this.round.answers.set(this.round.imposterId, "(no answer)");
    }
    this.round.phaseEndsAt = Date.now() + VOTING_SECONDS * 1000;
    this.setPhase("VOTING", VOTING_SECONDS, () => this.tallyVotes());
  }

  override castVote(voterId: PlayerId, targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING" || !this.round) {
      return { ok: false, error: "Not voting right now" };
    }
    if (!this.players.has(voterId)) return { ok: false, error: "Not in this room" };
    if (!this.round.answers.has(targetPlayerId)) {
      return { ok: false, error: "Invalid vote target" };
    }
    if (voterId === targetPlayerId) {
      return { ok: false, error: "Cannot vote for your own answer" };
    }
    this.round.votes.set(voterId, targetPlayerId);
    this.emitChange();
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (this.round.votes.size >= connected.length) this.tallyVotes();
    return { ok: true };
  }

  override postChat(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING") return { ok: false, error: "Chat only during voting" };
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: "Not in this room" };
    const trimmed = sanitizeText(text, MAX_CHAT_LEN).trim();
    if (!trimmed) return { ok: false, error: "Empty message" };
    if (!this.round) return { ok: false, error: "No round" };
    this.round.chat.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      playerName: player.name,
      text: trimmed,
      ts: Date.now(),
    });
    this.emitChange();
    return { ok: true };
  }

  private tallyVotes() {
    if (!this.round) return;
    const counts = new Map<PlayerId, number>();
    for (const target of this.round.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    let topCount = -1;
    const topOwners: PlayerId[] = [];
    for (const [ownerId, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topOwners.length = 0;
        topOwners.push(ownerId);
      } else if (count === topCount) {
        topOwners.push(ownerId);
      }
    }
    const isImposterTopAndAlone =
      topOwners.length === 1 && topOwners[0] === this.round.imposterId;
    this.round.winner = isImposterTopAndAlone ? "PLAYERS" : "IMPOSTER";
    this.round.mostVotedAnswerOwnerId = topOwners.length === 1 ? topOwners[0] : undefined;
    if (this.round.winner === "PLAYERS") {
      for (const p of this.players.values()) {
        if (p.id !== this.round.imposterId) p.score += 1;
      }
    } else {
      const imposter = this.players.get(this.round.imposterId);
      if (imposter) imposter.score += 2;
    }
    this.round.phaseEndsAt = Date.now() + RESULTS_SECONDS * 1000;
    this.setPhase("RESULTS", RESULTS_SECONDS, () => {
      this.round = undefined;
      this.returnToLobby();
    });
  }

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let imposterRound: ImposterRoundPublic | undefined;
    if (this.round) {
      const isImposter = viewerId === this.round.imposterId;
      const myRole: "IMPOSTER" | "PLAYER" = isImposter ? "IMPOSTER" : "PLAYER";
      const showPromptToReal = !isImposter && this.phase !== "RESULTS";
      const showPromptToAll = this.phase === "VOTING" || this.phase === "RESULTS";
      const promptForRealPlayers = showPromptToAll
        ? this.round.promptText
        : showPromptToReal
          ? this.round.promptText
          : null;

      let answers: { ownerId: PlayerId; text: string }[] = [];
      if (this.phase === "IMPOSTER_ANSWERING" && isImposter) {
        answers = [...this.round.answers.entries()].map(([ownerId, text]) => ({
          ownerId,
          text,
        }));
        answers = shuffle(answers);
      } else if (this.phase === "VOTING" || this.phase === "RESULTS") {
        answers = [...this.round.answers.entries()].map(([ownerId, text]) => ({
          ownerId,
          text,
        }));
        answers = shuffle(answers);
      }

      imposterRound = {
        promptForRealPlayers,
        answers,
        votes:
          this.phase === "VOTING" || this.phase === "RESULTS"
            ? Object.fromEntries(this.round.votes)
            : {},
        chat: this.phase === "VOTING" || this.phase === "RESULTS" ? this.round.chat : [],
        phaseEndsAt: this.round.phaseEndsAt,
        imposterRevealed:
          this.phase === "RESULTS" ? this.round.imposterId : undefined,
        winner: this.round.winner,
        mostVotedAnswerOwnerId: this.round.mostVotedAnswerOwnerId,
        myRole,
        iSubmittedAnswer: this.round.answers.has(viewerId),
        iVoted: this.round.votes.has(viewerId),
      };
    }
    return { ...base, imposterRound };
  }
}

// ---------------- Spyfall ----------------

interface SpyfallRound {
  spyId: PlayerId;
  location: string;
  rolesByPlayer: Map<PlayerId, string>;
  votes: Map<PlayerId, PlayerId>;
  chat: ChatMsg[];
  phaseEndsAt: number;
  winner?: "PLAYERS" | "SPY";
  mostVotedPlayerId?: PlayerId;
}

export class SpyfallRoom extends RoomBase {
  readonly gameType = "spyfall" as const;
  readonly minPlayers = MIN_PLAYERS_SPYFALL;
  round?: SpyfallRound;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    this.beginRound();
    return { ok: true };
  }

  private beginRound() {
    const connected = [...this.players.values()].filter((p) => p.connected);
    const spy = connected[Math.floor(Math.random() * connected.length)];
    const location = pickRandomLocation();
    const rolesByPlayer = new Map<PlayerId, string>();
    const roles = shuffle(location.roles);
    let i = 0;
    for (const p of connected) {
      if (p.id === spy.id) continue;
      rolesByPlayer.set(p.id, roles[i % roles.length]);
      i++;
    }
    this.round = {
      spyId: spy.id,
      location: location.name,
      rolesByPlayer,
      votes: new Map(),
      chat: [],
      phaseEndsAt: Date.now() + REVEAL_SECONDS * 1000,
    };
    this.setPhase("REVEAL", REVEAL_SECONDS, () => this.startDiscussPhase());
  }

  private startDiscussPhase() {
    if (!this.round) return;
    this.round.phaseEndsAt = Date.now() + DISCUSS_SECONDS * 1000;
    this.setPhase("DISCUSS", DISCUSS_SECONDS, () => this.startVotingPhase());
  }

  private startVotingPhase() {
    if (!this.round) return;
    this.round.phaseEndsAt = Date.now() + VOTING_SECONDS * 1000;
    this.setPhase("VOTING", VOTING_SECONDS, () => this.tallyVotes());
  }

  override callVote(playerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "DISCUSS") {
      return { ok: false, error: "Can only call vote during discussion" };
    }
    if (!this.players.has(playerId)) return { ok: false, error: "Not in this room" };
    this.startVotingPhase();
    return { ok: true };
  }

  override castVote(voterId: PlayerId, targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING" || !this.round) {
      return { ok: false, error: "Not voting right now" };
    }
    if (!this.players.has(voterId)) return { ok: false, error: "Not in this room" };
    if (!this.players.has(targetPlayerId)) return { ok: false, error: "Invalid vote target" };
    if (voterId === targetPlayerId) return { ok: false, error: "Cannot vote for yourself" };
    this.round.votes.set(voterId, targetPlayerId);
    this.emitChange();
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (this.round.votes.size >= connected.length) this.tallyVotes();
    return { ok: true };
  }

  override postChat(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (this.phase !== "DISCUSS" && this.phase !== "VOTING") {
      return { ok: false, error: "Chat only during discussion or voting" };
    }
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: "Not in this room" };
    const trimmed = sanitizeText(text, MAX_CHAT_LEN).trim();
    if (!trimmed) return { ok: false, error: "Empty message" };
    if (!this.round) return { ok: false, error: "No round" };
    this.round.chat.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      playerName: player.name,
      text: trimmed,
      ts: Date.now(),
    });
    this.emitChange();
    return { ok: true };
  }

  private tallyVotes() {
    if (!this.round) return;
    const counts = new Map<PlayerId, number>();
    for (const target of this.round.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    let topCount = -1;
    const topPlayers: PlayerId[] = [];
    for (const [pid, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topPlayers.length = 0;
        topPlayers.push(pid);
      } else if (count === topCount) {
        topPlayers.push(pid);
      }
    }
    const isSpyTopAndAlone =
      topPlayers.length === 1 && topPlayers[0] === this.round.spyId;
    this.round.winner = isSpyTopAndAlone ? "PLAYERS" : "SPY";
    this.round.mostVotedPlayerId = topPlayers.length === 1 ? topPlayers[0] : undefined;
    if (this.round.winner === "PLAYERS") {
      for (const p of this.players.values()) {
        if (p.id !== this.round.spyId) p.score += 1;
      }
    } else {
      const spy = this.players.get(this.round.spyId);
      if (spy) spy.score += 2;
    }
    this.round.phaseEndsAt = Date.now() + RESULTS_SECONDS * 1000;
    this.setPhase("RESULTS", RESULTS_SECONDS, () => {
      this.round = undefined;
      this.returnToLobby();
    });
  }

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let spyfallRound: SpyfallRoundPublic | undefined;
    if (this.round) {
      const isSpy = viewerId === this.round.spyId;
      const reveal = this.phase === "RESULTS";
      spyfallRound = {
        myRole: isSpy ? "SPY" : "PLAYER",
        myLocation: isSpy ? undefined : this.round.location,
        myLocationRole: isSpy ? undefined : this.round.rolesByPlayer.get(viewerId),
        allLocations: ALL_LOCATION_NAMES,
        votes:
          this.phase === "VOTING" || this.phase === "RESULTS"
            ? Object.fromEntries(this.round.votes)
            : {},
        chat:
          this.phase === "DISCUSS" || this.phase === "VOTING" || this.phase === "RESULTS"
            ? this.round.chat
            : [],
        phaseEndsAt: this.round.phaseEndsAt,
        iVoted: this.round.votes.has(viewerId),
        spyRevealed: reveal ? this.round.spyId : undefined,
        actualLocation: reveal ? this.round.location : undefined,
        winner: this.round.winner,
        mostVotedPlayerId: this.round.mostVotedPlayerId,
      };
    }
    return { ...base, spyfallRound };
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------- Flip 7 ----------------

interface Flip7Round {
  roundNumber: number;
  deck: Flip7Card[];
  discard: Flip7Card[];
  turnOrder: PlayerId[];
  currentPlayerIndex: number;
  hands: Map<PlayerId, Flip7Hand>;
  awaiting: Flip7Awaiting;
  flipThree?: { targetId: PlayerId; remaining: number };
  initialDealIndex?: number; // server-internal: position in turn order being dealt to
  recentEvents: Flip7Event[];
  roundEndsAt?: number;
}

const MODIFIER_VALUES: Record<Flip7Modifier, number> = {
  "+2": 2, "+4": 4, "+6": 6, "+8": 8, "+10": 10, "x2": 0, // x2 handled separately
};

function computeRoundScore(hand: Flip7Hand): number {
  if (hand.status === "BUSTED") return 0;
  let numbers = hand.numbers.reduce((s, n) => s + n, 0);
  let bonus = 0;
  for (const m of hand.modifiers) {
    if (m === "x2") numbers *= 2;
    else bonus += MODIFIER_VALUES[m];
  }
  if (hand.status === "FLIPPED_SEVEN") bonus += 15;
  return numbers + bonus;
}

export class Flip7Room extends RoomBase {
  readonly gameType = "flip7" as const;
  readonly minPlayers = MIN_PLAYERS_FLIP7;
  targetScore = FLIP7_DEFAULT_TARGET;
  round?: Flip7Round;
  gameWinnerId?: PlayerId;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    for (const p of this.players.values()) p.score = 0;
    this.gameWinnerId = undefined;
    this.beginRound(1);
    return { ok: true };
  }

  setTargetScore(by: PlayerId, value: number): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can change target" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    if (!FLIP7_TARGET_SCORES.includes(value as 50 | 100 | 200)) {
      return { ok: false, error: "Invalid target score" };
    }
    this.targetScore = value;
    this.emitChange();
    return { ok: true };
  }

  nextGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can reset" };
    if (this.phase !== "GAME_OVER") return { ok: false, error: "Game still in progress" };
    for (const p of this.players.values()) p.score = 0;
    this.round = undefined;
    this.gameWinnerId = undefined;
    this.phase = "LOBBY";
    this.clearTimer();
    this.emitChange();
    return { ok: true };
  }

  hit(playerId: PlayerId): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const a = this.round.awaiting;
    if (a.kind !== "DECISION" || a.playerId !== playerId) {
      return { ok: false, error: "Not your turn" };
    }
    this.clearTimer();
    this.drawAndApply(playerId);
    return { ok: true };
  }

  stay(playerId: PlayerId): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const a = this.round.awaiting;
    if (a.kind !== "DECISION" || a.playerId !== playerId) {
      return { ok: false, error: "Not your turn" };
    }
    this.clearTimer();
    const hand = this.round.hands.get(playerId)!;
    hand.status = "STAYED";
    hand.roundScore = computeRoundScore(hand);
    this.logEvent(`${this.nameOf(playerId)} stayed`);
    this.advanceAfterPlayerDone();
    return { ok: true };
  }

  target(playerId: PlayerId, targetId: PlayerId): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const a = this.round.awaiting;
    if (a.kind !== "TARGET" || a.actorId !== playerId) {
      return { ok: false, error: "Not waiting on your target choice" };
    }
    if (!this.players.has(targetId)) return { ok: false, error: "Invalid target" };
    if (a.cardKind === "GIVE_SC") {
      const targetHand = this.round.hands.get(targetId);
      if (!targetHand || targetHand.status !== "ACTIVE" || targetHand.hasSecondChance || targetId === playerId) {
        return { ok: false, error: "Invalid target for Second Chance" };
      }
    } else {
      const targetHand = this.round.hands.get(targetId);
      if (!targetHand || targetHand.status !== "ACTIVE") {
        return { ok: false, error: "Target is not active" };
      }
    }
    this.clearTimer();
    this.applyTarget(a.cardKind, playerId, targetId);
    return { ok: true };
  }

  private beginRound(roundNumber: number) {
    const connected = [...this.players.values()].filter((p) => p.connected);
    const turnOrder = connected.map((p) => p.id);
    shuffleInPlace(turnOrder);
    const deck = buildDeck();
    shuffleInPlace(deck);
    const hands = new Map<PlayerId, Flip7Hand>();
    for (const p of connected) {
      hands.set(p.id, {
        numbers: [],
        modifiers: [],
        hasSecondChance: false,
        status: "ACTIVE",
        roundScore: 0,
      });
    }
    this.round = {
      roundNumber,
      deck,
      discard: [],
      turnOrder,
      currentPlayerIndex: 0,
      hands,
      awaiting: { kind: "FORCED_DRAWING", targetId: turnOrder[0] },
      recentEvents: [],
      initialDealIndex: 0,
    };
    this.phase = "ROUND";
    this.logEvent(`Round ${roundNumber} begins — dealing one card to each player`);
    this.scheduleInitialDeal();
  }

  private scheduleInitialDeal() {
    if (!this.round) return;
    if (
      this.round.initialDealIndex === undefined ||
      this.round.initialDealIndex >= this.round.turnOrder.length
    ) {
      // Done dealing — start regular play
      this.round.initialDealIndex = undefined;
      this.beginCurrentPlayerDecision();
      return;
    }
    const targetId = this.round.turnOrder[this.round.initialDealIndex];
    this.round.awaiting = { kind: "FORCED_DRAWING", targetId };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.drawAndApply(targetId);
    }, FLIP7_FORCED_DRAW_MS);
    this.emitChange();
  }

  private advanceInitialDeal() {
    if (!this.round) return;
    this.round.initialDealIndex = (this.round.initialDealIndex ?? 0) + 1;
    this.scheduleInitialDeal();
  }

  private startDecisionTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (!this.round) return;
      const a = this.round.awaiting;
      if (a.kind !== "DECISION") return;
      const hand = this.round.hands.get(a.playerId);
      if (!hand) return;
      hand.status = "STAYED";
      hand.roundScore = computeRoundScore(hand);
      this.logEvent(`${this.nameOf(a.playerId)} timed out — auto-stay`);
      this.advanceAfterPlayerDone();
    }, FLIP7_DECISION_SECONDS * 1000);
  }

  private startTargetTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (!this.round) return;
      const a = this.round.awaiting;
      if (a.kind !== "TARGET") return;
      let target: PlayerId | undefined;
      if (a.cardKind === "GIVE_SC") {
        const eligible = [...this.round.hands.entries()].find(
          ([id, h]) => id !== a.actorId && h.status === "ACTIVE" && !h.hasSecondChance
        );
        target = eligible?.[0];
      } else {
        target = a.actorId;
      }
      if (target) {
        this.logEvent(`${this.nameOf(a.actorId)} idled — auto-targeted ${this.nameOf(target)}`);
        this.applyTarget(a.cardKind, a.actorId, target);
      } else {
        this.logEvent(`${this.nameOf(a.actorId)} idled — Second Chance discarded`);
        this.resumeAfterAction(a.actorId);
      }
    }, FLIP7_TARGET_SECONDS * 1000);
  }

  private drawCardFromDeck(): Flip7Card | undefined {
    if (!this.round) return undefined;
    if (this.round.deck.length === 0) {
      if (this.round.discard.length === 0) return undefined;
      this.round.deck = this.round.discard;
      this.round.discard = [];
      shuffleInPlace(this.round.deck);
      this.logEvent("Deck reshuffled");
    }
    return this.round.deck.pop();
  }

  private drawAndApply(drawerId: PlayerId) {
    if (!this.round) return;
    const card = this.drawCardFromDeck();
    if (!card) {
      // Defensive: deck and discard both empty. End round.
      this.endRound("ALL_STOPPED");
      return;
    }
    const hand = this.round.hands.get(drawerId);
    if (!hand) return;

    if (card.kind === "number") {
      if (hand.numbers.includes(card.value)) {
        // Bust check
        if (hand.hasSecondChance) {
          hand.hasSecondChance = false;
          this.round.discard.push(card);
          this.logEvent(`${this.nameOf(drawerId)} would bust on ${card.value} — Second Chance saves them`);
          hand.roundScore = computeRoundScore(hand);
          this.continueAfterDraw(drawerId);
        } else {
          hand.status = "BUSTED";
          hand.bustedOn = card.value;
          hand.roundScore = 0;
          this.round.discard.push(card);
          this.logEvent(`${this.nameOf(drawerId)} BUSTED on duplicate ${card.value}`);
          this.handleDrawerStopped(drawerId);
        }
      } else {
        hand.numbers.push(card.value);
        if (hand.numbers.length === 7) {
          hand.status = "FLIPPED_SEVEN";
          hand.roundScore = computeRoundScore(hand);
          this.logEvent(`${this.nameOf(drawerId)} FLIPPED 7! Round ends.`);
          // Force any other ACTIVE players to bank their current scores (they "stayed by force").
          for (const [id, h] of this.round.hands) {
            if (id !== drawerId && h.status === "ACTIVE") {
              h.status = "STAYED";
              h.roundScore = computeRoundScore(h);
            }
          }
          this.endRound("FLIP_7");
        } else {
          hand.roundScore = computeRoundScore(hand);
          this.continueAfterDraw(drawerId);
        }
      }
    } else if (card.kind === "modifier") {
      hand.modifiers.push(card.modifier);
      hand.roundScore = computeRoundScore(hand);
      this.logEvent(`${this.nameOf(drawerId)} drew ${card.modifier}`);
      this.continueAfterDraw(drawerId);
    } else {
      // Action card — does NOT consume the turn (decision B).
      this.handleActionDraw(drawerId, card.action);
    }
  }

  private continueAfterDraw(drawerId: PlayerId) {
    if (!this.round) return;
    if (this.round.flipThree && this.round.flipThree.targetId === drawerId) {
      this.continueFlipThreeSequence();
    } else if (this.round.initialDealIndex !== undefined) {
      this.advanceInitialDeal();
    } else {
      // Round-robin: one card per turn, then advance.
      this.advanceAfterPlayerDone();
    }
  }

  private continueFlipThreeSequence() {
    if (!this.round?.flipThree) return;
    this.round.flipThree.remaining -= 1;
    const targetId = this.round.flipThree.targetId;
    const targetHand = this.round.hands.get(targetId);
    const targetCanContinue = targetHand?.status === "ACTIVE";
    if (this.round.flipThree.remaining <= 0 || !targetCanContinue) {
      if (!targetCanContinue && this.round.flipThree.remaining > 0) {
        this.logEvent(
          `Flip Three on ${this.nameOf(targetId)} ends — they are no longer active`
        );
      }
      this.round.flipThree = undefined;
      if (this.round.initialDealIndex !== undefined) {
        this.advanceInitialDeal();
      } else {
        this.advanceAfterPlayerDone();
      }
    } else {
      this.scheduleForcedDraw();
    }
  }

  private handleDrawerStopped(drawerId: PlayerId) {
    if (!this.round) return;
    if (this.round.flipThree && this.round.flipThree.targetId === drawerId) {
      // Sequence stops: target busted (or otherwise can't continue).
      this.round.flipThree = undefined;
    }
    if (this.round.initialDealIndex !== undefined) {
      this.advanceInitialDeal();
      return;
    }
    this.advanceAfterPlayerDone();
  }

  private handleActionDraw(actorId: PlayerId, kind: "FREEZE" | "FLIP3" | "SECOND_CHANCE") {
    if (!this.round) return;
    if (kind === "FREEZE" || kind === "FLIP3") {
      this.logEvent(`${this.nameOf(actorId)} drew ${kind === "FREEZE" ? "Freeze" : "Flip Three"}`);
      this.round.awaiting = {
        kind: "TARGET",
        actorId,
        cardKind: kind,
        deadline: Date.now() + FLIP7_TARGET_SECONDS * 1000,
      };
      this.startTargetTimer();
      this.emitChange();
      return;
    }
    // SECOND_CHANCE
    const hand = this.round.hands.get(actorId)!;
    if (!hand.hasSecondChance) {
      hand.hasSecondChance = true;
      this.logEvent(`${this.nameOf(actorId)} drew Second Chance`);
      this.continueAfterDraw(actorId);
      return;
    }
    // Already has one — must give to another active player without one
    const eligible = [...this.round.hands.entries()].find(
      ([id, h]) => id !== actorId && h.status === "ACTIVE" && !h.hasSecondChance
    );
    if (!eligible) {
      this.logEvent(`${this.nameOf(actorId)} drew Second Chance — no eligible recipient, discarded`);
      this.continueAfterDraw(actorId);
      return;
    }
    this.logEvent(`${this.nameOf(actorId)} drew Second Chance — must give it away`);
    this.round.awaiting = {
      kind: "TARGET",
      actorId,
      cardKind: "GIVE_SC",
      deadline: Date.now() + FLIP7_TARGET_SECONDS * 1000,
    };
    this.startTargetTimer();
    this.emitChange();
  }

  private applyTarget(
    cardKind: "FREEZE" | "FLIP3" | "GIVE_SC",
    actorId: PlayerId,
    targetId: PlayerId
  ) {
    if (!this.round) return;
    if (cardKind === "FREEZE") {
      const target = this.round.hands.get(targetId)!;
      target.status = "FROZEN";
      target.roundScore = computeRoundScore(target);
      this.logEvent(`${this.nameOf(actorId)} froze ${this.nameOf(targetId)}`);
      this.resumeAfterAction(actorId);
    } else if (cardKind === "FLIP3") {
      this.logEvent(`${this.nameOf(actorId)} Flip-Three'd ${this.nameOf(targetId)}`);
      this.round.flipThree = { targetId, remaining: 3 };
      this.scheduleForcedDraw();
    } else {
      // GIVE_SC
      const target = this.round.hands.get(targetId)!;
      target.hasSecondChance = true;
      this.logEvent(`${this.nameOf(actorId)} gave Second Chance to ${this.nameOf(targetId)}`);
      this.resumeAfterAction(actorId);
    }
  }

  private resumeAfterAction(actorId: PlayerId) {
    if (!this.round) return;
    // The action card draw counts as the actor's draw for this turn / sequence slot.
    if (this.round.flipThree && this.round.flipThree.targetId === actorId) {
      // Action card was drawn during a Flip Three forced sequence — count it.
      this.continueFlipThreeSequence();
    } else if (this.round.initialDealIndex !== undefined) {
      this.advanceInitialDeal();
    } else {
      // Round-robin: action card resolved → turn passes.
      this.advanceAfterPlayerDone();
    }
  }

  private scheduleForcedDraw() {
    if (!this.round || !this.round.flipThree) return;
    const targetId = this.round.flipThree.targetId;
    this.round.awaiting = { kind: "FORCED_DRAWING", targetId };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.drawAndApply(targetId);
    }, FLIP7_FORCED_DRAW_MS);
    this.emitChange();
  }

  private beginDecisionFor(playerId: PlayerId) {
    if (!this.round) return;
    const hand = this.round.hands.get(playerId);
    if (!hand || hand.status !== "ACTIVE") {
      // Player can no longer act — advance turn instead.
      this.advanceAfterPlayerDone();
      return;
    }
    this.round.awaiting = {
      kind: "DECISION",
      playerId,
      deadline: Date.now() + FLIP7_DECISION_SECONDS * 1000,
    };
    this.startDecisionTimer();
    this.emitChange();
  }

  private beginCurrentPlayerDecision() {
    if (!this.round) return;
    const turnHolder = this.round.turnOrder[this.round.currentPlayerIndex];
    this.beginDecisionFor(turnHolder);
  }

  private advanceAfterPlayerDone() {
    if (!this.round) return;
    if (!this.anyoneActive()) {
      this.endRound("ALL_STOPPED");
      return;
    }
    this.advanceTurn();
  }

  private anyoneActive(): boolean {
    if (!this.round) return false;
    for (const h of this.round.hands.values()) if (h.status === "ACTIVE") return true;
    return false;
  }

  private advanceTurn() {
    if (!this.round) return;
    for (let step = 0; step < this.round.turnOrder.length; step++) {
      this.round.currentPlayerIndex =
        (this.round.currentPlayerIndex + 1) % this.round.turnOrder.length;
      const id = this.round.turnOrder[this.round.currentPlayerIndex];
      const hand = this.round.hands.get(id);
      if (hand?.status === "ACTIVE") {
        this.beginDecisionFor(id);
        return;
      }
    }
    this.endRound("ALL_STOPPED");
  }

  private endRound(_reason: "FLIP_7" | "ALL_STOPPED") {
    if (!this.round) return;
    this.clearTimer();
    // Finalize round scores (for any still-ACTIVE players being banked)
    for (const [id, hand] of this.round.hands) {
      if (hand.status === "ACTIVE") {
        hand.status = "STAYED";
      }
      hand.roundScore = computeRoundScore(hand);
      const player = this.players.get(id);
      if (player) player.score += hand.roundScore;
    }
    this.logEvent(`Round ${this.round.roundNumber} complete`);
    // Winner check
    let winnerId: PlayerId | undefined;
    let topScore = -1;
    for (const p of this.players.values()) {
      if (p.score >= this.targetScore && p.score > topScore) {
        topScore = p.score;
        winnerId = p.id;
      }
    }
    if (winnerId) {
      this.gameWinnerId = winnerId;
      this.phase = "GAME_OVER";
      this.emitChange();
      return;
    }
    // Otherwise schedule next round
    this.round.roundEndsAt = Date.now() + FLIP7_ROUND_END_SECONDS * 1000;
    this.phase = "ROUND_END";
    this.emitChange();
    this.timer = setTimeout(() => {
      const next = (this.round?.roundNumber ?? 0) + 1;
      this.beginRound(next);
    }, FLIP7_ROUND_END_SECONDS * 1000);
  }

  private logEvent(text: string) {
    if (!this.round) return;
    this.round.recentEvents.push({ ts: Date.now(), text });
    if (this.round.recentEvents.length > FLIP7_RECENT_EVENTS) {
      this.round.recentEvents.shift();
    }
  }

  private nameOf(id: PlayerId): string {
    return this.players.get(id)?.name ?? "?";
  }

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let flip7Round: Flip7RoundPublic | undefined;
    if (this.round) {
      const hands: Record<PlayerId, Flip7Hand> = {};
      for (const [id, h] of this.round.hands) {
        hands[id] = {
          numbers: [...h.numbers],
          modifiers: [...h.modifiers],
          hasSecondChance: h.hasSecondChance,
          status: h.status,
          roundScore: h.roundScore,
          bustedOn: h.bustedOn,
        };
      }
      const roundOverIn =
        this.phase === "ROUND_END" && this.round.roundEndsAt
          ? Math.max(0, this.round.roundEndsAt - Date.now())
          : undefined;
      flip7Round = {
        roundNumber: this.round.roundNumber,
        targetScore: this.targetScore,
        turnOrder: [...this.round.turnOrder],
        currentPlayerIndex: this.round.currentPlayerIndex,
        hands,
        awaiting: this.round.awaiting,
        flipThree: this.round.flipThree
          ? { targetId: this.round.flipThree.targetId, remaining: this.round.flipThree.remaining }
          : undefined,
        deckRemaining: this.round.deck.length + this.round.discard.length,
        recentEvents: [...this.round.recentEvents],
        roundOverIn,
        gameWinnerId: this.phase === "GAME_OVER" ? this.gameWinnerId : undefined,
      };
    }
    return {
      ...base,
      flip7Round,
      flip7TargetScore: this.targetScore,
    };
  }
}

export class RoomStore {
  private rooms = new Map<RoomCode, RoomBase>();

  create(hostId: PlayerId, gameType: GameType): RoomBase {
    const code = generateRoomCode(new Set(this.rooms.keys()));
    const room: RoomBase =
      gameType === "spyfall"
        ? new SpyfallRoom(code, hostId)
        : gameType === "flip7"
          ? new Flip7Room(code, hostId)
          : new ImposterRoom(code, hostId);
    this.rooms.set(code, room);
    return room;
  }

  get(code: RoomCode): RoomBase | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: RoomCode) {
    const room = this.rooms.get(code);
    if (room) {
      room.destroy();
      this.rooms.delete(code);
    }
  }

  all(): RoomBase[] {
    return [...this.rooms.values()];
  }
}
